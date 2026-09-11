'use strict';
/* ============================================================================
   src/routes/connect.js — matriz 4.8 / AR-F4: Conexión cliente ↔ mecánico.

   Rutas extraídas VERBATIM de server-pg.js (misma respuesta, mismos status y
   mismos campos): GET/POST /api/connect/profiles, GET /api/connect/match y POST /api/connect/locate.

   POR QUÉ AQUÍ Y NO EN lib/
   Esto habla con la base de datos y con express: es servidor, no regla del
   taller (AGENTS.md §3). lib/ sigue siendo puro.

   CÓMO SE MONTA
   server-pg.js llama montarConnect(app, { ... }) en la MISMA posición en la que
   estaba el bloque, para no cambiar el orden de registro de las rutas. Recibe
   por `deps` exactamente lo que necesita. Ver src/routes/README.md.

   LIMITADORES
   connectLimiter y connectMatchLimiter se crean AQUÍ con las MISMAS opciones y
   los mismos topes que tenían en server-pg.js (es lo que exige F8/2.6 y
   2.11/B28). No se reciben por `deps` porque un limitador es estado propio del
   dominio, no del entorno de createApp.
   ========================================================================= */
const rateLimit = require('express-rate-limit');
const { StoreBD } = require('../services/rate-limit-store');

function montarConnect(app, deps) {
  const { db, requireWorkshop, str, num, toInt } = deps;

  /* ---- Conexión cliente ↔ mecánico ---- */
  const CONNECT_ROLES = ['mecanico', 'cliente', 'tienda'];
  /* FT-0002 (auditoría P0): el directorio es público, pero las respuestas NUNCA
     incluyen email, dirección ni coordenadas exactas — esa PII alimentaba
     raspadores. El contacto es el teléfono que cada quien publicó voluntariamente
     (misma política del perfil público /taller/:slug); la distancia se calcula en
     servidor y sale como distance_km, jamás el punto crudo. */
  const CONNECT_PUBLICO = 'id, role, name, phone, city, zone, offers, needs';
  const connectLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, store: new StoreBD(db, 'connect') });

  app.get('/api/connect/profiles', async (req, res) => {
    const rows = await db.all(`SELECT ${CONNECT_PUBLICO} FROM connect_profiles ORDER BY name`);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  // F3/B27/V-A9 (2.3): alta solo con sesión; email desde la cuenta (no del body).
  // Antes cualquiera suplantaba cualquier email y publicaba spam/PII a su nombre.
  app.post('/api/connect/profiles', connectLimiter, requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const wsPropio = await db.get('SELECT email FROM workshops WHERE id = ?', [req.workshopId]);
    if (!wsPropio) return res.status(401).json({ error: 'Cuenta no encontrada' });
    const email = String(wsPropio.email || '').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Correo inválido' });
    const name = str(b.name, 120);
    const city = str(b.city, 120);
    if (!name || !city) return res.status(400).json({ error: 'Nombre y ciudad son requeridos' });
    const lat = num(b.lat), lng = num(b.lng);
    if (lat !== null && (lat < -90 || lat > 90)) return res.status(400).json({ error: 'Latitud inválida (±90)' });
    if (lng !== null && (lng < -180 || lng > 180)) return res.status(400).json({ error: 'Longitud inválida (±180)' });
    const role = CONNECT_ROLES.includes(b.role) ? b.role : 'mecanico';
    const existing = await db.get('SELECT id FROM connect_profiles WHERE email = ?', [email]);
    const vals = [email, role, name, str(b.phone, 40) || null, city, str(b.zone, 80) || null,
      str(b.address, 300) || null, lat, lng, str(b.offers, 500) || null, str(b.needs, 500) || null];
    if (existing) {
      await db.run(`UPDATE connect_profiles SET role=?, name=?, phone=?, city=?, zone=?, address=?, lat=?, lng=?, offers=?, needs=? WHERE id=?`,
        [...vals.slice(1), existing.id]);
      return res.json({ id: existing.id });
    }
    const id = await db.insertReturningId(`INSERT INTO connect_profiles (email, role, name, phone, city, zone, address, lat, lng, offers, needs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, vals);
    res.status(201).json({ id });
  });

  const haversineKm = (lat1, lng1, lat2, lng2) => {
    const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  // Matching por similitud: mismo lugar (ciudad/zona) + cercanía GPS + solape de ofrezco/busco
  // F8/V-A3 (2.6): 20/min propio. V-5.1/5.4/B28 (2.11): radius 1..50, limit<=50 y LIMIT en SQL.
  const connectMatchLimiter = rateLimit({ windowMs: 60_000, limit: process.env.NODE_ENV === 'test' ? 5000 : 20, standardHeaders: true, legacyHeaders: false, store: new StoreBD(db, 'connect-match') });
  app.get('/api/connect/match', connectMatchLimiter, async (req, res) => {
    const q = req.query || {};
    const meCity = str(q.city, 120).toLowerCase();
    const meZone = str(q.zone, 80).toLowerCase();
    const myLat = num(q.lat), myLng = num(q.lng);
    const radius = Math.min(50, Math.max(1, num(q.radius) ?? 25));
    const limite = toInt(q.limit, 1, 50) ?? 50;
    const meOffers = str(q.offers, 500).toLowerCase();
    const meNeeds = str(q.needs, 500).toLowerCase();
    const tokens = (s) => new Set(s.toLowerCase().split(/[^a-záéíóúñ0-9]+/i).filter(w => w.length > 2));
    const myOff = tokens(meOffers), myNeed = tokens(meNeeds);
    // lat/lng se leen SÓLO para calcular distance_km en servidor; jamás salen en la respuesta.
    // LIMIT en SQL: no traer toda la tabla a memoria (B28).
    const profiles = await db.all(`SELECT ${CONNECT_PUBLICO}, lat, lng FROM connect_profiles ORDER BY name LIMIT ?`, [limite * 4]);
    const out = [];
    for (const p of profiles) {
      // Si tengo coordenadas y el otro también → distancia real
      let dist = null;
      if (myLat != null && myLng != null && p.lat != null && p.lng != null) {
        dist = haversineKm(myLat, myLng, p.lat, p.lng);
        if (dist > radius) continue;
      }
      // Filtro por ciudad/zona (si el otro tiene datos y yo filtro por ciudad)
      const pc = (p.city || '').toLowerCase(), pz = (p.zone || '').toLowerCase();
      if (meCity && pc && pc !== meCity) continue;
      if (meZone && pz && meZone !== pz) continue;
      // Solape de ofrezco/busco: mecánico ofrece X ↔ cliente busca X
      const pOff = tokens(p.offers || ''), pNeed = tokens(p.needs || '');
      let overlap = 0;
      for (const w of myOff) if (pNeed.has(w)) overlap++;
      for (const w of myNeed) if (pOff.has(w)) overlap++;
      const { lat, lng, ...publico } = p;
      out.push({ ...publico, distance_km: dist != null ? +dist.toFixed(1) : null, match_score: overlap });
      if (out.length >= limite) break;
    }
    out.sort((a, b) => (b.match_score - a.match_score) || ((a.distance_km ?? 9999) - (b.distance_km ?? 9999)));
    res.set('Cache-Control', 'no-store').json(out.slice(0, limite));
  });

  // Dado lat/lng del GPS, se guarda el perfil con coordenadas y se sugiere ciudad/zona
  app.post('/api/connect/locate', async (req, res) => {
    const lat = num(req.body?.lat), lng = num(req.body?.lng);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: 'Coordenadas inválidas' });
    }
    // Sin geocodificación inversa (sin API externa): devolvemos las coords para guardar
    res.json({ lat, lng });
  });

}

module.exports = { montarConnect };
