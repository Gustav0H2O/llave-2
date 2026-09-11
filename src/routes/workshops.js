'use strict';
/* ============================================================================
   src/routes/workshops.js — matriz 4.8 / AR-F4: Perfil público del taller, reseñas y directorio.

   Rutas extraídas VERBATIM de server-pg.js (misma respuesta, mismos status y
   mismos campos): GET /api/workshops/:slug, POST /api/workshops/:slug/reviews y GET /api/workshops.

   POR QUÉ AQUÍ Y NO EN lib/
   Esto habla con la base de datos y con express: es servidor, no regla del
   taller (AGENTS.md §3). lib/ sigue siendo puro.

   CÓMO SE MONTA
   server-pg.js llama montarWorkshops(app, { ... }) en la MISMA posición en la que
   estaba el bloque, para no cambiar el orden de registro de las rutas. Recibe
   por `deps` exactamente lo que necesita. Ver src/routes/README.md.

   resumenReseñas solo lo usan estas dos rutas, así que vive aquí. visitSalt es
   ESTADO DE CONFIGURACIÓN (en server-pg.js es config.VISIT_SALT y lo comparten
   el contador de visitas y el hash de autor de reseña): llega por `deps` para
   que la sal siga teniendo una sola fuente.
   ========================================================================= */
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

function montarWorkshops(app, deps) {
  const { db, str, visitSalt } = deps;

  /* ================================================================
     Perfil público del taller y reputación
     ================================================================ */
  const resumenReseñas = async (workshopId) => {
    const r = await db.get(
      'SELECT COUNT(*) c, AVG(rating) a FROM workshop_reviews WHERE workshop_id = ?', workshopId);
    const n = Number(r?.c || 0);
    return { total: n, promedio: n ? Math.round(Number(r.a) * 10) / 10 : null };
  };

  app.get('/api/workshops/:slug', async (req, res) => {
    const slug = str(req.params.slug, 60);
    const ws = await db.get(
      `SELECT id, name, phone, city, bio, services, email_verified, donor_level, avatar_url, created_at
         FROM workshops WHERE slug = ? AND is_public = 1`, slug);
    if (!ws) return res.status(404).json({ error: 'Perfil no encontrado o no publicado' });
    const reviews = await db.all(
      `SELECT author, rating, comment, created_at FROM workshop_reviews
        WHERE workshop_id = ? ORDER BY id DESC LIMIT 50`, ws.id);
    const { total, promedio } = await resumenReseñas(ws.id);
    // el id interno no sale: fuera se identifica por slug
    const { id, ...publico } = ws;
    res.set('Cache-Control', 'public, max-age=60').json({
      ...publico, slug,
      avatar_url: ws.avatar_url || null,
      email_verified: Number(ws.email_verified) === 1,
      donor_level: Number(ws.donor_level || 0),
      reseñas: reviews, total, promedio,
    });
  });

  const reviewLimiter = rateLimit({ windowMs: 3600_000, limit: 10, standardHeaders: true, legacyHeaders: false });

  app.post('/api/workshops/:slug/reviews', reviewLimiter, async (req, res) => {
    const slug = str(req.params.slug, 60);
    const ws = await db.get('SELECT id FROM workshops WHERE slug = ? AND is_public = 1', slug);
    if (!ws) return res.status(404).json({ error: 'Perfil no encontrado o no publicado' });

    const author = str(req.body?.author, 60);
    const comment = str(req.body?.comment, 600);
    /* OJO: `toInt` RECORTA al rango en vez de rechazar (es lo que quieren los
       filtros del catálogo). Aquí eso convertiría un 9 en un 5 sin avisar y
       ensuciaría el promedio, así que la calificación se valida a mano. */
    const rating = Number.parseInt(req.body?.rating, 10);
    if (!author) return res.status(400).json({ error: 'Pon tu nombre' });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'La calificación va de 1 a 5' });
    }

    /* F9/B26 (2.7): author_hash=HMAC(ip+día+taller), NO device_id del cliente
       (falsificable: rotando device_id se votaba infinito). Una por IP/día/taller
       vía clave única + tope 20/día/taller contra ráfagas. */
    const diaHoy = new Date().toISOString().slice(0, 10);
    const author_hash = crypto.createHmac('sha256', visitSalt).update(`${req.ip}|${diaHoy}|${ws.id}`).digest('hex');
    const cuantasHoy = (await db.get(`SELECT COUNT(*) c FROM workshop_reviews WHERE workshop_id = ? AND date(created_at) = date('now')`, [ws.id]))?.c || 0;
    if (Number(cuantasHoy) >= 20) return res.status(429).json({ error: 'Límite diario de reseñas para este taller' });
    const previa = await db.get('SELECT id FROM workshop_reviews WHERE workshop_id = ? AND author_hash = ?', [ws.id, author_hash]);
    if (previa) return res.status(409).json({ error: 'Ya dejaste una reseña en este taller' });

    await db.run(
      'INSERT INTO workshop_reviews (workshop_id, author, rating, comment, author_hash) VALUES (?, ?, ?, ?, ?)',
      [ws.id, author, rating, comment || null, author_hash]
    );
    const resumen = await resumenReseñas(ws.id);
    res.status(201).json({ ok: true, ...resumen });
  });

  /* Directorio de talleres publicados: alimenta "Conectar cliente ↔ mecánico" */
  app.get('/api/workshops', async (req, res) => {
    const ciudad = str(req.query.city, 80);
    const filas = await db.all(
      `SELECT w.slug, w.name, w.city, w.services, w.phone, w.donor_level, w.avatar_url,
              COUNT(r.id) total, AVG(r.rating) promedio
         FROM workshops w LEFT JOIN workshop_reviews r ON r.workshop_id = w.id
        WHERE w.is_public = 1 ${ciudad ? 'AND LOWER(w.city) LIKE ?' : ''}
        GROUP BY w.id ORDER BY w.donor_level DESC, promedio DESC, w.name`,
      ciudad ? [`%${ciudad.toLowerCase()}%`] : []
    );
    res.set('Cache-Control', 'public, max-age=120').json(filas.map(f => ({
      ...f, total: Number(f.total || 0),
      donor_level: Number(f.donor_level || 0),
      avatar_url: f.avatar_url || null,
      promedio: f.total ? Math.round(Number(f.promedio) * 10) / 10 : null,
    })));
  });

}

module.exports = { montarWorkshops };
