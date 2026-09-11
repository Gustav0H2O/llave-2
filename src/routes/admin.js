'use strict';
/* ============================================================================
   src/routes/admin.js — matriz 4.8 / oleada 3b: Panel de administración.

   TODAS las rutas /api/admin/* extraídas VERBATIM de server-pg.js (misma
   respuesta, mismos status y mismos campos): login, logout, bootstrap, vehículos
   (listar/ver/alta/edición/borrado/verificar/import), marcas, pilas, búsquedas
   sin resultado, donaciones (listar/aprobar/rechazar/manual/aviso de prueba) y
   talleres (listar/editar/contraseña/vaciar/borrar/respaldo/rango de donador).

   POR QUÉ AQUÍ Y NO EN lib/
   Esto habla con la base de datos y con express: es servidor, no regla del
   taller (AGENTS.md §3). lib/ sigue siendo puro.

   AUTENTICACIÓN, CSRF Y AUDITORÍA
   El token de admin (HMAC con jti, vida 1 h, revocable), requireAdmin, los
   limitadores (40/min global y 5/15 min en el login, relajado en pruebas) y la
   auditoría de mutaciones viven AQUÍ: son estado propio del dominio y este es su
   único consumidor. ADMIN_PASSWORD/ADMIN_SECRET se leen del entorno en este
   módulo. CSRF_COOKIE llega por `deps`: el nonce lo emite un middleware global
   de server-pg.js, así que la cookie sigue teniendo una sola fuente.

   CACHÉS COMPARTIDAS
   Las invalidaciones usan src/services/caches.js (invalidarCatalogos/
   invalidarMetaCache/invalidarPumpsCache), el singleton que el catálogo LEE.
   No son variables locales: una copia por módulo se desincronizaría.

   notificarTaller se DEVUELVE junto a la montura: el dominio de donaciones
   (montarDonations) lo reutiliza, así que hay una sola definición.

   CÓMO SE MONTA
   server-pg.js llama montarAdmin(app, { ... }) en la MISMA posición en la que
   estaba el bloque, para no cambiar el orden de registro de las rutas. Recibe
   por `deps` exactamente lo que necesita. Ver src/routes/README.md.
   ========================================================================= */
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { invalidarMetaCache, invalidarPumpsCache, invalidarCatalogos } = require('../services/caches');

/* 2.30 — Token de admin (vida 1 h, con `jti` revocable) y helpers CSRF (2.32).
   La contraseña se lee del entorno aquí (antes en server-pg.js, misma posición
   temporal: se lee al cargar el módulo). */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_SECRET = ADMIN_PASSWORD
  ? crypto.createHash('sha256').update('ftadmin|' + ADMIN_PASSWORD).digest()
  : null;
const igualDeFormaSegura = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};
const METODOS_MUTANTES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ADMIN_TOKEN_TTL_MS = 3600e3;
const ADMIN_COOKIE = 'ft_admin';
const adminTokensRevocados = new Map();
const firmaAdmin = (exp, jti) => crypto.createHmac('sha256', ADMIN_SECRET).update(`${exp}.${jti}`).digest('base64url');
const signAdminToken = (ttlMs = ADMIN_TOKEN_TTL_MS) => {
  const exp = Date.now() + ttlMs, jti = crypto.randomBytes(16).toString('base64url');
  return `${exp}.${jti}.${firmaAdmin(exp, jti)}`;
};
const verifyAdminToken = (token) => {
  if (!ADMIN_SECRET || typeof token !== 'string') return false;
  const [exp, jti, sig] = token.split('.');
  if (!jti || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now() || adminTokensRevocados.has(jti)) return false;
  return igualDeFormaSegura(sig, firmaAdmin(exp, jti));
};
const revocarAdminToken = (token) => {
  const [exp, jti] = typeof token === 'string' ? token.split('.') : [];
  if (!/^\d+$/.test(exp || '') || !jti) return false;
  adminTokensRevocados.set(jti, Number(exp));
  return true;
};
setInterval(() => { const t = Date.now(); for (const [j, e] of adminTokensRevocados) if (e < t) adminTokensRevocados.delete(j); }, 30 * 60 * 1000).unref?.();

function montarAdmin(app, deps) {
  /* ZONES/BODY_TYPES (lib/catalog), las reglas del taller (lib/domain), el nivel
     de donador (lib/pure), el validador de correo (lib/validar) y el aviso de
     donación (lib/notificaciones) entran por `deps`: el monolito ya los tenía y
     no se duplican. hashPassword vive en server-pg.js (lo comparten la
     autenticación de talleres y este panel). */
  const {
    db, statsDb, idDe, errorAccionable, enTransaccion, hashPassword,
    str, num, toInt, esc, leerCookie, extraerToken,
    ZONES, BODY_TYPES, moduleRegulatedPsi, pumpClass, baseFlow, calcularNivelDonador,
    vEmail, enviarAvisoDonacion, PROD, BASE_URL, CSRF_COOKIE,
  } = deps;

  /* ---------- Panel de administración (carga de datos sin editar seed.js) ----------
     Autenticación: contraseña (ADMIN_PASSWORD) → token HMAC firmado con expiración.
     Si ADMIN_PASSWORD no está definida, todo el panel responde 503 (desactivado). */
  /* 4.6: ZONES y BODY_TYPES vienen de lib/catalog.js (fuente única, entran por
     `deps`). El orden de ZONES es el de ZONE_LOC, no el que tenía la copia local. */
  const ASSEMBLY = ['external', 'hanger_tbi', 'hanger_return', 'module_returnless', 'vortec', 'gdi_low'];

  const adminLimiter = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false });
  /* 2.30: limitador del login de admin — 5/15 min (relajado en pruebas). */
  const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: process.env.NODE_ENV === 'test' ? 1000 : 5,
    standardHeaders: true, legacyHeaders: false,
  });
  const requireAdmin = (req, res, next) => {
    if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Panel no configurado. Define la variable ADMIN_PASSWORD.' });
    /* 4.6: token (Bearer o cookie ft_admin) con el helper único; el origen cookie
       se conserva para exigir CSRF en las mutaciones. */
    const auth = String(req.headers.authorization || '');
    const headerToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const viaCookie = !headerToken && !!leerCookie(req, ADMIN_COOKIE);
    const token = extraerToken(req, ADMIN_COOKIE);
    if (!verifyAdminToken(token)) return res.status(401).json({ error: 'No autorizado' });
    /* 2.32: mutar por cookie exige CSRF; Bearer va exento (no lo manda el navegador solo). */
    if (viaCookie && METODOS_MUTANTES.has(req.method)
      && !igualDeFormaSegura(req.headers['x-csrf-token'], leerCookie(req, CSRF_COOKIE))) {
      return res.status(403).json({ code: 'csrf_invalid', error: 'Falta o no coincide el token CSRF' });
    }
    /* 2.30: auditoría — IP + acción de cada mutación de admin (sin PII ni tokens). */
    if (METODOS_MUTANTES.has(req.method)) console.warn(`[admin-audit] ip=${req.ip || '-'} ${req.method} ${req.path}`);
    req.adminToken = token;
    next();
  };

  app.post('/api/admin/login', adminLimiter, adminLoginLimiter, async (req, res) => {
    if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Panel no configurado. Define la variable ADMIN_PASSWORD.' });
    const pass = typeof req.body?.password === 'string' ? req.body.password : '';
    const a = Buffer.from(pass), b = Buffer.from(ADMIN_PASSWORD);
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta' });
    /* 2.30: token en cookie HttpOnly; también en el cuerpo por compatibilidad Bearer. */
    const token = signAdminToken();
    res.set('Cache-Control', 'no-store')
      .cookie(ADMIN_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: PROD, path: '/', maxAge: ADMIN_TOKEN_TTL_MS })
      .json({ token });
  });

  app.post('/api/admin/logout', requireAdmin, (req, res) => {
    /* 2.30: revoca el `jti` actual (deja de valer aunque no caduque) y limpia cookie. */
    revocarAdminToken(req.adminToken);
    res.clearCookie(ADMIN_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/admin/bootstrap', requireAdmin, async (req, res) => {
    res.set('Cache-Control', 'no-store').json({
      brands: await db.all('SELECT id, name FROM brands ORDER BY name', ),
      injection_types: await db.all('SELECT id, code, name FROM injection_types ORDER BY id', ),
      pumps: await db.all('SELECT id, code, manufacturer FROM fuel_pumps ORDER BY manufacturer, code', ),
      enums: { body_types: BODY_TYPES, zones: ZONES, assembly: ASSEMBLY },
      counts: {
        vehicles: (await db.get('SELECT COUNT(*) c FROM vehicles'))?.c || 0,
        brands: (await db.get('SELECT COUNT(*) c FROM brands'))?.c || 0,
        pumps: (await db.get('SELECT COUNT(*) c FROM fuel_pumps'))?.c || 0,
        unverified: (await db.get('SELECT COUNT(*) c FROM vehicles WHERE data_verified = 0'))?.c || 0
      }
    });
  });

  app.get('/api/admin/vehicles', requireAdmin, async (req, res) => {
    const q = str(req.query.q, 60);
    const rows = await db.all(`
      SELECT v.id, b.name AS brand, v.model, v.year_from, v.year_to, v.engine, v.data_verified
      FROM vehicles v JOIN brands b ON b.id = v.brand_id
      ${q ? "WHERE v.model LIKE @q OR b.name LIKE @q" : ''}
      ORDER BY b.name, v.model, v.year_from LIMIT 1000
    `, q ? { q: `%${q.replace(/[%_\\]/g, '\\$&')}%` } : {});
    res.set('Cache-Control', 'no-store').json(rows.map(r => ({ ...r, data_verified: !!r.data_verified })));
  });

  app.get('/api/admin/vehicles/:id', requireAdmin, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    // toInt devuelve null para un id no numérico, y pasar null a un `?` hace
    // que better-sqlite3 lance ("Too few parameter values were provided").
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const vehicle = await db.get('SELECT * FROM vehicles WHERE id = ?', [id]);
    if (!vehicle) return res.status(404).json({ error: 'No encontrado' });
    const link = await db.get('SELECT * FROM vehicle_modules WHERE vehicle_id = ?', [id]);
    const module = link ? await db.get('SELECT * FROM fuel_modules WHERE id = ?', [link.module_id]) : null;
    const pumps = link ? await db.all('SELECT pump_id, is_oem, fitment FROM module_pumps WHERE module_id = ?', [link.module_id]) : [];
    res.set('Cache-Control', 'no-store').json({ vehicle, link, module, pumps });
  });

  function buildPayload(body) {
    const b = body || {};
    const brand_id = toInt(b.brand_id, 1, 1e9);
    const injection_type_id = toInt(b.injection_type_id, 1, 1e9);
    const year_from = toInt(b.year_from, 1900, 2100);
    const year_to = toInt(b.year_to, 1900, 2100);
    const model = str(b.model, 80), engine = str(b.engine, 80);
    const psimin = num(b.rail_pressure_psi_min), psimax = num(b.rail_pressure_psi_max);
    if (!brand_id) throw new Error('Marca requerida');
    if (!injection_type_id) throw new Error('Tipo de inyección requerido');
    if (!model) throw new Error('Modelo requerido');
    if (!engine) throw new Error('Motor requerido');
    if (year_from === null || year_to === null || year_to < year_from) throw new Error('Rango de años inválido');
    if (psimin === null || psimax === null || psimax < psimin) throw new Error('Presiones de riel inválidas');
    const m = b.module || {};
    const module = {
      code: str(m.code, 60), name: str(m.name, 120),
      assembly_type: ASSEMBLY.includes(m.assembly_type) ? m.assembly_type : 'module_returnless',
      regulated_psi: num(m.regulated_psi), flow_lph: num(m.flow_lph),
      regulator_type: str(m.regulator_type, 120) || null, float_type: str(m.float_type, 120) || null,
      strainer_ref: str(m.strainer_ref, 120) || null, connector_desc: str(m.connector_desc, 160) || null,
      lines_desc: str(m.lines_desc, 160) || null, mount_desc: str(m.mount_desc, 160) || null,
      diagram_key: str(m.diagram_key, 60) || 'module_generic'
    };
    if (!module.code) throw new Error('Código del módulo requerido');
    if (!module.name) throw new Error('Nombre del módulo requerido');
    if (module.regulated_psi === null) throw new Error('Presión regulada del módulo requerida');
    if (module.flow_lph === null) throw new Error('Flujo del módulo requerido');
    const l = b.link || {};
    const link = {
      location_text: str(l.location_text, 300),
      location_zone: ZONES.includes(l.location_zone) ? l.location_zone : 'tank_drop',
      requires_tank_removal: l.requires_tank_removal ? 1 : 0,
      access_notes: str(l.access_notes, 300) || null
    };
    if (!link.location_text) throw new Error('Ubicación del módulo requerida');
    const pumps = Array.isArray(b.pumps)
      ? b.pumps.map(p => ({ pump_id: toInt(p.pump_id, 1, 1e9), is_oem: p.is_oem ? 1 : 0, fitment: str(p.fitment, 40) || 'directa' })).filter(p => p.pump_id)
      : [];
    return {
      vehicle: { brand_id, model, year_from, year_to, engine, body_type: BODY_TYPES.includes(b.body_type) ? b.body_type : 'sedan', injection_type_id, rail_pressure_psi_min: psimin, rail_pressure_psi_max: psimax, notes: str(b.notes, 500) || null, data_verified: b.data_verified ? 1 : 0 },
      module, link, pumps
    };
  }

  const insModule = async (d) => db.insertReturningId(`INSERT INTO fuel_modules
    (code,name,assembly_type,regulated_psi,flow_lph,regulator_type,float_type,strainer_ref,connector_desc,lines_desc,mount_desc,diagram_key)
    VALUES (@code,@name,@assembly_type,@regulated_psi,@flow_lph,@regulator_type,@float_type,@strainer_ref,@connector_desc,@lines_desc,@mount_desc,@diagram_key)`, d);

  const createVehicle = async (d) => enTransaccion(async () => {
    const module_id = await insModule(d.module);
    const vehicle_id = await db.insertReturningId(`INSERT INTO vehicles
      (brand_id,model,year_from,year_to,engine,body_type,injection_type_id,rail_pressure_psi_min,rail_pressure_psi_max,notes,data_verified)
      VALUES (@brand_id,@model,@year_from,@year_to,@engine,@body_type,@injection_type_id,@rail_pressure_psi_min,@rail_pressure_psi_max,@notes,@data_verified)`, d.vehicle);
    await db.run(`INSERT INTO vehicle_modules (vehicle_id,module_id,location_text,location_zone,requires_tank_removal,access_notes)
      VALUES (?,?,?,?,?,?)`, [vehicle_id, module_id, d.link.location_text, d.link.location_zone, d.link.requires_tank_removal, d.link.access_notes]);
    const insPump = { run: async (m, p, i, f) => db.run('INSERT OR IGNORE INTO module_pumps (module_id,pump_id,is_oem,fitment) VALUES (?,?,?,?)', [m, p, i, f]) };
    for (const p of d.pumps) await insPump.run(module_id, p.pump_id, p.is_oem, p.fitment);
    return vehicle_id;
  });

  const updateVehicle = async (id, d) => enTransaccion(async () => {
    await db.run(`UPDATE vehicles SET brand_id=@brand_id,model=@model,year_from=@year_from,year_to=@year_to,engine=@engine,body_type=@body_type,injection_type_id=@injection_type_id,rail_pressure_psi_min=@rail_pressure_psi_min,rail_pressure_psi_max=@rail_pressure_psi_max,notes=@notes,data_verified=@data_verified WHERE id=@id`, { ...d.vehicle, id });
    const link = await db.get('SELECT module_id FROM vehicle_modules WHERE vehicle_id = ?', [id]);
    let module_id = link?.module_id;
    if (module_id) {
      await db.run(`UPDATE fuel_modules SET code=@code,name=@name,assembly_type=@assembly_type,regulated_psi=@regulated_psi,flow_lph=@flow_lph,regulator_type=@regulator_type,float_type=@float_type,strainer_ref=@strainer_ref,connector_desc=@connector_desc,lines_desc=@lines_desc,mount_desc=@mount_desc,diagram_key=@diagram_key WHERE id=@id`, { ...d.module, id: module_id });
      await db.run('UPDATE vehicle_modules SET location_text=?,location_zone=?,requires_tank_removal=?,access_notes=? WHERE vehicle_id=?', [d.link.location_text, d.link.location_zone, d.link.requires_tank_removal, d.link.access_notes, id]);
    } else {
      module_id = await insModule(d.module);
      await db.run('INSERT INTO vehicle_modules (vehicle_id,module_id,location_text,location_zone,requires_tank_removal,access_notes) VALUES (?,?,?,?,?,?)', [id, module_id, d.link.location_text, d.link.location_zone, d.link.requires_tank_removal, d.link.access_notes]);
    }
    await db.run('DELETE FROM module_pumps WHERE module_id = ?', [module_id]);
    const insPump = { run: async (m, p, i, f) => db.run('INSERT OR IGNORE INTO module_pumps (module_id,pump_id,is_oem,fitment) VALUES (?,?,?,?)', [m, p, i, f]) };
    for (const p of d.pumps) await insPump.run(module_id, p.pump_id, p.is_oem, p.fitment);
  });

  app.post('/api/admin/vehicles', requireAdmin, async (req, res) => {
    try {
      const d = buildPayload(req.body);
      // El await NO es opcional: createVehicle es async, y sin esperarlo `id`
      // es una promesa que se serializa como {} y el panel recibe {"id":{}}.
      const id = await createVehicle(d);
      invalidarCatalogos();
      res.json({ id });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'Datos inválidos (¿código de módulo duplicado?)') }); } /* 2.23 */
  });

  app.put('/api/admin/vehicles/:id', requireAdmin, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    if (!await db.get('SELECT 1 FROM vehicles WHERE id = ?', [id])) return res.status(404).json({ error: 'No encontrado' });
    try {
      const d = buildPayload(req.body);
      // El await NO es opcional: updateVehicle es async. Sin esperarlo se
      // respondía 200 antes de que la edición terminara, y si la transacción
      // fallaba el rechazo quedaba sin capturar (Node aborta el proceso ante
      // un unhandled rejection: una edición mal hecha tumbaba el servidor).
      await updateVehicle(id, d);
      invalidarCatalogos();
      res.json({ id });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'Datos inválidos') }); } /* 2.23 */
  });

  app.delete('/api/admin/vehicles/:id', requireAdmin, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const link = await db.get('SELECT module_id FROM vehicle_modules WHERE vehicle_id = ?', [id]);
    await enTransaccion(async () => {
      await db.run('DELETE FROM vehicles WHERE id = ?', [id]); // vehicle_modules cae por ON DELETE CASCADE
      if (link?.module_id) {
        const used = (await db.get('SELECT COUNT(*) c FROM vehicle_modules WHERE module_id = ?', [link.module_id]))?.c;
        if (used === 0) {
          await db.run('DELETE FROM module_pumps WHERE module_id = ?', [link.module_id]);
          await db.run('DELETE FROM fuel_modules WHERE id = ?', [link.module_id]);
        }
      }
    });

    invalidarCatalogos(); /* 2.25 (B18): DELETE también invalida pilas */
    res.json({ ok: true });
  });

  app.post('/api/admin/vehicles/:id/verify', requireAdmin, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    // OJO: db.run(sql, params) recibe DOS argumentos. Antes se llamaba con tres
    // —run(sql, valor, id)— y el id se descartaba en silencio: la consulta se
    // quedaba sin su segundo parámetro y marcar un vehículo como verificado
    // fallaba siempre. Los parámetros van en un array.
    const info = await db.run(
      'UPDATE vehicles SET data_verified = ? WHERE id = ?',
      [req.body?.data_verified ? 1 : 0, id]
    );
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

  app.post('/api/admin/brands', requireAdmin, async (req, res) => {
    const name = str(req.body?.name, 60);
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const existing = await db.get('SELECT id, name FROM brands WHERE name = ?', name);
    if (existing) return res.json(existing);
    const info = await db.run('INSERT INTO brands (name) VALUES (?)', name);
    invalidarMetaCache();
    res.json({ id: info.lastInsertRowid, name });
  });

  app.post('/api/admin/pumps', requireAdmin, async (req, res) => {
    const b = req.body || {};
    const pump = {
      code: str(b.code, 60), manufacturer: str(b.manufacturer, 60), pump_style: str(b.pump_style, 40) || 'turbina',
      max_psi_direct: num(b.max_psi_direct), amperage_a: num(b.amperage_a), voltage_v: num(b.voltage_v) || 12,
      flow_lph_free: num(b.flow_lph_free), inlet_desc: str(b.inlet_desc, 120) || null, outlet_desc: str(b.outlet_desc, 120) || null,
      polarity_desc: str(b.polarity_desc, 120) || null, diagram_key: str(b.diagram_key, 60) || 'pump_generic'
    };
    if (!pump.code || !pump.manufacturer) return res.status(400).json({ error: 'Código y fabricante requeridos' });
    if (pump.max_psi_direct === null || pump.amperage_a === null) return res.status(400).json({ error: 'Presión máx. y amperaje requeridos' });
    try {
      const info = await db.run(`INSERT INTO fuel_pumps (code,manufacturer,pump_style,max_psi_direct,amperage_a,voltage_v,flow_lph_free,inlet_desc,outlet_desc,polarity_desc,diagram_key)
        VALUES (@code,@manufacturer,@pump_style,@max_psi_direct,@amperage_a,@voltage_v,@flow_lph_free,@inlet_desc,@outlet_desc,@polarity_desc,@diagram_key)`, pump);
      invalidarPumpsCache();
      res.json({ id: info.lastInsertRowid });
    } catch (e) { res.status(400).json({ error: 'Código de pila duplicado o inválido' }); }
  });

  app.get('/api/admin/missing', requireAdmin, async (req, res) => {
    const rows = await statsDb.all('SELECT q, SUM(count) veces FROM missing_searches GROUP BY q ORDER BY veces DESC, q LIMIT 100', );
    res.set('Cache-Control', 'no-store').json(rows);
  });

  async function notificarTaller(wsId, title, message, type = 'info') {
    if (!wsId) return;
    try {
      await db.run(
        'INSERT INTO workshop_notifications (workshop_id, title, message, type) VALUES (?, ?, ?, ?)',
        [wsId, str(title, 120), str(message, 500), str(type, 20) || 'info']
      );
    } catch (e) {
      /* 2.33: antes era mudo. Solo el id del taller y el tipo: ni tokens ni PII. */
      console.error(`[notificarTaller] no se pudo avisar al taller #${wsId} (${str(type, 20) || 'info'}): ${e?.message || e}`);
    }
  }

  /* ---- Donaciones y Solicitudes de Rango (Admin) ---- */
  app.get('/api/admin/donations', requireAdmin, async (req, res) => {
    const status = str(req.query.status, 20);
    const rows = await db.all(`
      SELECT d.*, w.name AS workshop_name, w.slug AS workshop_slug, w.donor_level AS current_level, w.total_donated AS current_donated
        FROM donations d
        LEFT JOIN workshops w ON w.id = d.workshop_id
       ${status ? 'WHERE d.status = ?' : ''}
       ORDER BY d.id DESC LIMIT 200
    `, status ? [status] : []);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  app.post('/api/admin/donations/:id/approve', requireAdmin, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const don = await db.get('SELECT * FROM donations WHERE id = ?', [id]);
    if (!don) return res.status(404).json({ error: 'No encontrado' });
    // F2 (2.2): solo pendientes se pueden aprobar; una rechazada no se revive por aquí.
    if (don.status !== 'pending') return res.status(409).json({ error: 'La solicitud ya fue procesada', status: don.status });

    /* 2.14+2.27 (V-A2/B41): techo 0.1..10000 también al aprobar (no solo al pedir). */
    const montoAprobado = num(req.body?.amount) ?? don.amount;
    if (!(montoAprobado >= 0.1 && montoAprobado <= 10000)) return res.status(400).json({ error: 'Monto en USD inválido (0.1..10000)' });
    let targetWsId = toInt(req.body?.workshop_id, 1, 1e9) || don.workshop_id;
    if (!targetWsId && don.email) {
      const foundWs = await db.get('SELECT id FROM workshops WHERE email = ?', [don.email]);
      if (foundWs) targetWsId = foundWs.id;
    }
    await enTransaccion(async () => {
      await db.run(
        `UPDATE donations SET status = 'approved', amount = ?, workshop_id = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = 'admin', approve_token = NULL WHERE id = ?`,
        [montoAprobado, targetWsId, id]
      );
      if (targetWsId) {
        await db.run('UPDATE workshops SET total_donated = total_donated + ? WHERE id = ?', [montoAprobado, targetWsId]);
        const ws = await db.get('SELECT donor_level, total_donated FROM workshops WHERE id = ?', [targetWsId]);
        const nuevoNivel = calcularNivelDonador(ws.total_donated);
        if (nuevoNivel > ws.donor_level) {
          await db.run('UPDATE workshops SET donor_level = ? WHERE id = ?', [nuevoNivel, targetWsId]);
        }
        await notificarTaller(targetWsId, 'Aporte aprobado', `Tu aporte de $${Number(montoAprobado).toFixed(2)} USD fue aprobado. Nivel de taller: ${nuevoNivel}. ¡Gracias por apoyar!`, 'success');
      }
    });
    res.json({ ok: true, id, status: 'approved', workshop_id: targetWsId });
  });

  app.post('/api/admin/donations/:id/reject', requireAdmin, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const don = await db.get('SELECT * FROM donations WHERE id = ?', [id]);
    if (!don) return res.status(404).json({ error: 'No encontrado' });

    const motivo = str(req.body?.reason, 300);
    const notaFinal = [don.note, motivo ? `Rechazado: ${motivo}` : 'Rechazado por admin'].filter(Boolean).join(' | ');
    await db.run(
      `UPDATE donations SET status = 'rejected', note = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = 'admin', approve_token = NULL WHERE id = ?`,
      [notaFinal, id]
    );
    if (don.workshop_id) {
      await notificarTaller(don.workshop_id, 'Aporte no acreditado', `Tu aporte con referencia "${esc(don.reference)}" fue rechazado. ${motivo ? 'Motivo: ' + esc(motivo) : 'Revisa los datos con soporte.'}`, 'warning');
    }
    res.json({ ok: true, id, status: 'rejected' });
  });

  app.get('/api/admin/workshops', requireAdmin, async (req, res) => {
    const q = str(req.query.q, 80);
    const sql = `
      SELECT w.id, w.name, w.email, w.slug, w.phone, w.city, w.address, w.owner_name, w.doc_id,
             w.business_type, w.onboarding_completed, w.donor_level, w.total_donated, w.avatar_url, w.created_at,
             (SELECT COUNT(*) FROM clients WHERE workshop_id = w.id) AS clients_count,
             (SELECT COUNT(*) FROM work_orders WHERE workshop_id = w.id) AS orders_count,
             (SELECT COUNT(*) FROM inventory_items WHERE workshop_id = w.id) AS inventory_count
      FROM workshops w
      ${q ? 'WHERE w.name LIKE ? OR w.email LIKE ? OR w.phone LIKE ? OR w.doc_id LIKE ?' : ''}
      ORDER BY w.donor_level DESC, w.total_donated DESC, w.id DESC LIMIT 100
    `;
    const rows = await db.all(sql, q ? [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`] : []);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  app.put('/api/admin/workshops/:id', requireAdmin, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const ws = await db.get('SELECT id FROM workshops WHERE id = ?', [id]);
    if (!ws) return res.status(404).json({ error: 'Taller no encontrado' });

    const b = req.body || {};
    const name = str(b.name, 120);
    if (!name) return res.status(400).json({ error: 'El nombre del taller es obligatorio' });

    const phone = str(b.phone, 40);
    const city = str(b.city, 80);
    const address = str(b.address, 200);
    const owner_name = str(b.owner_name, 120);
    const doc_id = str(b.doc_id, 50);
    const business_type = str(b.business_type, 80);
    const donor_level = Number.isInteger(b.donor_level) ? Math.min(5, Math.max(0, b.donor_level)) : null;
    const total_donated = num(b.total_donated);
    const onboarding_completed = b.onboarding_completed !== undefined ? (b.onboarding_completed ? 1 : 0) : null;

    await db.run(`
      UPDATE workshops SET
        name = ?,
        phone = COALESCE(?, phone),
        city = COALESCE(?, city),
        address = COALESCE(?, address),
        owner_name = COALESCE(?, owner_name),
        doc_id = COALESCE(?, doc_id),
        business_type = COALESCE(?, business_type),
        donor_level = COALESCE(?, donor_level),
        total_donated = COALESCE(?, total_donated),
        onboarding_completed = COALESCE(?, onboarding_completed)
      WHERE id = ?
    `, [name, phone, city, address, owner_name, doc_id, business_type, donor_level, total_donated, onboarding_completed, id]);

    const updated = await db.get('SELECT id, name, email, slug, phone, city, address, owner_name, doc_id, business_type, onboarding_completed, donor_level, total_donated, avatar_url, created_at FROM workshops WHERE id = ?', id);
    res.json({ ok: true, workshop: updated });
  });

  app.post('/api/admin/workshops/:id/password', requireAdmin, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const ws = await db.get('SELECT id FROM workshops WHERE id = ?', [id]);
    if (!ws) return res.status(404).json({ error: 'Taller no encontrado' });

    const newPass = typeof req.body?.new_password === 'string' ? req.body.new_password.trim() : '';
    if (newPass.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

    const passHash = await hashPassword(newPass);
    await db.run('UPDATE workshops SET pass_hash = ? WHERE id = ?', [passHash, id]);
    await db.run('DELETE FROM sessions WHERE workshop_id = ?', id);
    res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
  });

  app.post('/api/admin/workshops/:id/wipe', requireAdmin, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const ws = await db.get('SELECT id, name FROM workshops WHERE id = ?', id);
    if (!ws) return res.status(404).json({ error: 'Taller no encontrado' });

    await db.run('DELETE FROM work_order_photos WHERE workshop_id = ?', id);
    await db.run('DELETE FROM work_order_items WHERE workshop_id = ?', id);
    await db.run('DELETE FROM work_orders WHERE workshop_id = ?', id);
    await db.run('DELETE FROM document_items WHERE workshop_id = ?', id);
    await db.run('DELETE FROM documents WHERE workshop_id = ?', id);
    await db.run('DELETE FROM client_vehicles WHERE workshop_id = ?', id);
    await db.run('DELETE FROM clients WHERE workshop_id = ?', id);
    await db.run('DELETE FROM inventory_moves WHERE workshop_id = ?', id);
    await db.run('DELETE FROM inventory_items WHERE workshop_id = ?', id);
    await db.run('DELETE FROM diagnostics WHERE workshop_id = ?', id);
    await db.run('DELETE FROM workshop_notes WHERE workshop_id = ?', id);
    await db.run('DELETE FROM cash_moves WHERE workshop_id = ?', id);
    await db.run('DELETE FROM workshop_notifications WHERE workshop_id = ?', id);

    res.json({ ok: true, message: `Datos operativos del taller "${ws.name}" vaciados correctamente` });
  });

  app.delete('/api/admin/workshops/:id', requireAdmin, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const ws = await db.get('SELECT id, name FROM workshops WHERE id = ?', id);
    if (!ws) return res.status(404).json({ error: 'Taller no encontrado' });

    await db.run('DELETE FROM work_order_photos WHERE workshop_id = ?', id);
    await db.run('DELETE FROM work_order_items WHERE workshop_id = ?', id);
    await db.run('DELETE FROM work_orders WHERE workshop_id = ?', id);
    await db.run('DELETE FROM document_items WHERE workshop_id = ?', id);
    await db.run('DELETE FROM documents WHERE workshop_id = ?', id);
    await db.run('DELETE FROM client_vehicles WHERE workshop_id = ?', id);
    await db.run('DELETE FROM clients WHERE workshop_id = ?', id);
    await db.run('DELETE FROM inventory_moves WHERE workshop_id = ?', id);
    await db.run('DELETE FROM inventory_items WHERE workshop_id = ?', id);
    await db.run('DELETE FROM diagnostics WHERE workshop_id = ?', id);
    await db.run('DELETE FROM workshop_notes WHERE workshop_id = ?', id);
    await db.run('DELETE FROM cash_moves WHERE workshop_id = ?', id);
    await db.run('DELETE FROM workshop_notifications WHERE workshop_id = ?', id);
    await db.run('DELETE FROM workshop_reviews WHERE workshop_id = ?', id);
    await db.run('DELETE FROM sessions WHERE workshop_id = ?', id);
    await db.run('DELETE FROM donations WHERE workshop_id = ?', id);
    await db.run('DELETE FROM workshops WHERE id = ?', id);

    res.json({ ok: true, message: `Taller "${ws.name}" (#${id}) eliminado definitivamente` });
  });

  app.get('/api/admin/workshops/:id/backup', requireAdmin, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const ws = await db.get('SELECT id, name, email, slug, phone, city, address, owner_name, doc_id, business_type, donor_level, total_donated, created_at FROM workshops WHERE id = ?', id);
    if (!ws) return res.status(404).json({ error: 'Taller no encontrado' });

    const [clients, clientVehicles, inventory, orders, orderItems, docs, diag, notes, cash, reviews] = await Promise.all([
      db.all('SELECT * FROM clients WHERE workshop_id = ?', id),
      db.all('SELECT * FROM client_vehicles WHERE workshop_id = ?', id),
      db.all('SELECT * FROM inventory_items WHERE workshop_id = ?', id),
      db.all('SELECT * FROM work_orders WHERE workshop_id = ?', id),
      db.all('SELECT * FROM work_order_items WHERE workshop_id = ?', id),
      db.all('SELECT * FROM documents WHERE workshop_id = ?', id),
      db.all('SELECT * FROM diagnostics WHERE workshop_id = ?', id),
      db.all('SELECT * FROM workshop_notes WHERE workshop_id = ?', id),
      db.all('SELECT * FROM cash_moves WHERE workshop_id = ?', id),
      db.all('SELECT * FROM workshop_reviews WHERE workshop_id = ?', id)
    ]);

    const backupData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      workshop: ws,
      clients,
      client_vehicles: clientVehicles,
      inventory,
      orders,
      order_items: orderItems,
      documents: docs,
      diagnostics: diag,
      notes,
      cash_moves: cash,
      reviews
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup-taller-${id}-${ws.slug || 'export'}.json"`);
    res.send(JSON.stringify(backupData, null, 2));
  });

  app.post('/api/admin/workshops/:id/donor-level', requireAdmin, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    const lvl = Number.parseInt(req.body?.donor_level, 10);
    if (id === null || !Number.isInteger(lvl) || lvl < 0 || lvl > 5) return res.status(400).json({ error: 'Datos inválidos' });
    const donated = num(req.body?.total_donated);
    const ws = await db.get('SELECT id, donor_level, total_donated FROM workshops WHERE id = ?', [id]);
    if (!ws) return res.status(404).json({ error: 'Taller no encontrado' });
    const newDonated = donated !== null ? Math.max(0, donated) : ws.total_donated;
    await db.run('UPDATE workshops SET donor_level = ?, total_donated = ? WHERE id = ?', [lvl, newDonated, id]);
    await notificarTaller(id, 'Rango actualizado', `Tu rango fue actualizado a Nivel ${lvl}. Total acumulado: $${newDonated.toFixed(2)} USD.`, 'info');
    res.json({ ok: true, id, donor_level: lvl, total_donated: newDonated });
  });

  app.post('/api/admin/donations/manual', requireAdmin, async (req, res) => {
    const b = req.body || {};
    const method = str(b.method, 30) || 'manual';
    const reference = str(b.reference, 100) || ('MANUAL-' + Date.now());
    const amount = num(b.amount);
    /* 2.14+2.27 (V-A2/B41): manual también 0.1..10000 como el alta pública. */
    if (amount === null || !(amount >= 0.1 && amount <= 10000)) return res.status(400).json({ error: 'Monto en USD inválido (0.1..10000)' });
    const workshop_id = toInt(b.workshop_id, 1, 1e9);
    const note = str(b.note, 500) || 'Aporte registrado por admin';
    const donor_name = str(b.donor_name, 100) || null;
    const email = vEmail(b.email);
    const id = await db.insertReturningId(
      `INSERT INTO donations (workshop_id, donor_name, email, method, reference, amount, note, status, reviewed_at, reviewed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', CURRENT_TIMESTAMP, 'admin')`,
      [workshop_id, donor_name, email, method, reference, amount, note]
    );
    if (workshop_id) {
      await db.run('UPDATE workshops SET total_donated = total_donated + ? WHERE id = ?', [amount, workshop_id]);
      const ws = await db.get('SELECT donor_level, total_donated FROM workshops WHERE id = ?', workshop_id);
      const nuevoNivel = calcularNivelDonador(ws.total_donated);
      if (nuevoNivel > ws.donor_level) {
        await db.run('UPDATE workshops SET donor_level = ? WHERE id = ?', [nuevoNivel, workshop_id]);
      }
      await notificarTaller(workshop_id, 'Aporte registrado por administración', `Se acreditó un aporte de $${Number(amount).toFixed(2)} USD a tu cuenta de taller. Rango: Nivel ${nuevoNivel}.`, 'success');
    }
    res.status(201).json({ ok: true, id, status: 'approved' });
  });

  app.post('/api/admin/donations/test-notice', requireAdmin, async (req, res) => {
    const url = str(req.body?.webhook_url, 500) || process.env.DONATION_WEBHOOK_URL;
    if (!url) return res.status(400).json({ error: 'Configura DONATION_WEBHOOK_URL o proporciona una URL de webhook' });
    const dummy = {
      id: 999, amount: 15, method: 'zinli', reference: 'TEST-001',
      donor_name: 'Donante de Prueba', email: 'prueba@ejemplo.com',
      note: 'Aviso de prueba enviado desde /admin',
      quickApproveUrl: `${BASE_URL}/admin`
    };
    const r = await enviarAvisoDonacion(dummy, url);
    if (!r.enviado && r.error) console.error('[webhook donación] no se pudo enviar el aviso de prueba:', r.error);
    res.json({ ok: r.enviado, result: r });
  });

  // Import masivo de vehículos desde CSV (marca, modelo, años, motor, inyección, psi, zona...)
  app.post('/api/admin/vehicles/import', requireAdmin, async (req, res) => {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 2000) : [];
    if (!rows.length) return res.status(400).json({ error: 'Sin filas para importar' });
    /* 4.5: precarga en lote. Antes cada fila hacía su propio SELECT de marca y de
       injection_type (hasta ~8 000 consultas para 2 000 filas). Con dos consultas
       (marcas + injection_types) y mapas en memoria, al bucle solo le quedan las
       inserciones reales. El resultado es EXACTAMENTE el mismo: mismas marcas,
       mismos vehículos y moduleRegulatedPsi/pumpClass/baseFlow sin tocar.
       2.19 (B14/B15): injection_type se resuelve por código en base (nunca id
       fijo 1-4) y el módulo usa las reglas del taller (fuente única). */
    const marcaMap = new Map(); // nombre -> id
    for (const b of await db.all('SELECT id, name FROM brands')) if (!marcaMap.has(b.name)) marcaMap.set(b.name, b.id);
    const injMap = new Map(); // código tal cual está en la base -> fila
    for (const it of await db.all('SELECT id, code FROM injection_types')) injMap.set(it.code, it);
    let ok = 0, skipped = 0; const errors = [];
    await enTransaccion(async () => {
      for (const r of rows) {
        try {
          const marca = str(r.marca, 60), modelo = str(r.modelo, 80);
          const y1 = toInt(r.y1, 1900, 2100), y2 = toInt(r.y2, 1900, 2100);
          const motor = str(r.motor, 80), psiMin = num(r.psiMin), psiMax = num(r.psiMax);
          if (!marca || !modelo || !motor || psiMin === null || psiMax === null || y1 === null || y2 === null) { skipped++; continue; }
          /* La marca se resuelve/inserta ANTES de validar la inyección, igual que
             antes: una fila con marca nueva e inyección inválida deja la marca. */
          if (!marcaMap.has(marca)) {
            const nuevoId = await db.insertReturningId('INSERT INTO brands (name) VALUES (?)', [marca]);
            marcaMap.set(marca, nuevoId);
          }
          const brand_id = marcaMap.get(marca);
          const injRow = injMap.get(String(r.inj || '').trim().toUpperCase()) || null;
          if (!injRow) { skipped++; continue; }
          const injCode = injRow.code;
          const zone = ZONES.includes(r.zona) ? r.zona : 'tank_drop';
          const vehicle_id = await db.insertReturningId(`INSERT INTO vehicles
            (brand_id, model, year_from, year_to, engine, body_type, injection_type_id, rail_pressure_psi_min, rail_pressure_psi_max)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [brand_id, modelo, y1, y2, motor, BODY_TYPES.includes(r.carroceria) ? r.carroceria : 'sedan', injRow.id, psiMin, psiMax]);
          /* Reglas del taller: presión regulada y clase de pila desde lib/domain. */
          const regulada = moduleRegulatedPsi({ inj: injCode, engine: motor, psiMax });
          pumpClass({ brand: marca, model: modelo, inj: injCode });
          const flujo = Math.round(baseFlow(motor));
          const module_id = await db.insertReturningId(`INSERT INTO fuel_modules (code, name, assembly_type, regulated_psi, flow_lph)
            VALUES (?, ?, 'module_returnless', ?, ?)`,
            [`FTM-IMP-${vehicle_id}`, `Módulo ${marca} ${modelo} (importado)`, regulada, flujo]);
          await db.run(`INSERT INTO vehicle_modules (vehicle_id, module_id, location_text, location_zone, requires_tank_removal, access_notes)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [vehicle_id, module_id, str(r.ubica, 300) || 'Dentro del tanque.', zone, r.tanque ? 1 : 0, null]);
          ok++;
        } catch (e) { errors.push(errorAccionable(e, 'Fila inválida').slice(0, 120)); } /* 2.23 */
      }
    });
    invalidarCatalogos();
    res.json({ ok, skipped, errors });
  });

  /* El aviso al taller lo comparte el dominio de donaciones: se devuelve para
     que exista UNA sola definición (src/routes/README.md). */
  return { notificarTaller };
}

module.exports = { montarAdmin };
