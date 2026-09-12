'use strict';
/* ============================================================================
   src/routes/catalog.js — matriz 4.8 / oleada 3a: Catálogo público.

   Rutas extraídas VERBATIM de server-pg.js (misma respuesta, mismos status y
   mismos campos): GET /api/meta, GET /api/vehicles, GET /api/vehicles/:id,
   GET/POST /api/vehicles/:id/comments, GET /api/modules, GET /api/modules/:id,
   GET /api/pumps y GET /api/pumps/:id.

   POR QUÉ AQUÍ Y NO EN lib/
   Esto habla con la base de datos y con express: es servidor, no regla del
   taller (AGENTS.md §3). lib/ sigue siendo puro.

   CACHÉS COMPARTIDAS
   metaCache y pumpsCache son estado MUTABLE por proceso: este módulo las LEE y
   el panel de admin (que se extraerá en la siguiente oleada) las INVALIDA. Viven
   en src/services/caches.js para que haya UNA sola copia — no se duplica el
   estado. Aquí solo se leen y se escriben cuando la caché está vacía.

   CÓMO SE MONTA
   server-pg.js llama montarCatalog(app, { ... }) en la MISMA posición en la que
   estaba el bloque, para no cambiar el orden de registro de las rutas. Recibe
   por `deps` exactamente lo que necesita. Ver src/routes/README.md.
   ========================================================================= */
const rateLimit = require('express-rate-limit');
const { StoreBD } = require('../services/rate-limit-store');
const { leerMetaCache, setMetaCache, leerPumpsCache, setPumpsCache } = require('../services/caches');

function montarCatalog(app, deps) {
  const { db, statsDb, idDe, toInt, psiToBar, vehicleSlug, requireWorkshop, str } = deps;

  /* Limitador del catálogo público (mismo tope que tenía en el monolito). El
     conteo va a la base (StoreBD) para compartirse entre instancias. */
  const catalogLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, store: new StoreBD(db, 'catalog') });

  /* Registro de búsquedas SIN resultado → hoja de ruta de datos guiada por
     demanda real. Vive en stats.db (la base de estadísticas), por eso llega por
     `deps` como statsDb. */
  const bumpMissing = { run: async (p1, p2) => statsDb.run(`INSERT INTO missing_searches (day, q, count) VALUES (?, ?, 1)
    ON CONFLICT(day, q) DO UPDATE SET count = count + 1`, [p1, p2]) };

  // --- Catálogos para filtros ---
  app.get('/api/meta', catalogLimiter, async (req, res) => {
    if (!leerMetaCache()) {
      /* 2.29 (B35): con base vacía MIN/MAX son null; se devuelve {} seguro en
         vez de {min:null,max:null} que rompe al frontend. */
      const yr = await db.get(`SELECT MIN(year_from) min, MAX(year_to) max FROM vehicles`, []);
      setMetaCache({
        brands: await db.all(`SELECT id, name FROM brands ORDER BY name`, []),
        injection_types: await db.all(`SELECT id, code, name, description FROM injection_types ORDER BY id`, []),
        year_range: (yr && yr.min != null && yr.max != null) ? yr : {},
        total_vehicles: (await db.get(`SELECT COUNT(*) c FROM vehicles`, []))?.c || 0
      });
    }
    res.set('Cache-Control', 'public, max-age=300');
    res.json(leerMetaCache());
  });

  // --- Buscador ---
  const MAX_PAGE_SIZE = 200;
  app.get('/api/vehicles', async (req, res) => {
    const { brand_id, model, year, injection_type_id } = req.query;
    const where = [];
    const params = {};
    const brandId = toInt(brand_id, 1, 1e9);
    const yearN = toInt(year, 1900, 2100);
    const injId = toInt(injection_type_id, 1, 1e9);
    if (brandId !== null) { where.push('v.brand_id = @brand_id');            params.brand_id = brandId; }
    if (typeof model === 'string' && model.trim()) {
      where.push('v.model LIKE @model ESCAPE \'\\\'');
      params.model = `%${model.trim().slice(0, 60).replace(/[%_\\]/g, '\\$&')}%`;
    }
    if (yearN !== null)   { where.push('@year BETWEEN v.year_from AND v.year_to'); params.year = yearN; }
    if (injId !== null)   { where.push('v.injection_type_id = @inj');        params.inj = injId; }

    params.limit = toInt(req.query.limit, 1, MAX_PAGE_SIZE) ?? MAX_PAGE_SIZE;
    params.offset = toInt(req.query.offset, 0, 10000) ?? 0;

    const rows = await db.all(`
      SELECT v.id, b.name AS brand, v.model, v.year_from, v.year_to, v.engine, v.body_type,
             it.code AS injection_code, it.name AS injection_name,
             v.rail_pressure_psi_min, v.rail_pressure_psi_max, v.data_verified,
             fm.code AS module_code,
             (SELECT GROUP_CONCAT(fp.code, ' / ') FROM module_pumps mp
                JOIN fuel_pumps fp ON fp.id = mp.pump_id WHERE mp.module_id = fm.id) AS pump_codes
      FROM vehicles v
      JOIN brands b ON b.id = v.brand_id
      JOIN injection_types it ON it.id = v.injection_type_id
      LEFT JOIN vehicle_modules vm ON vm.vehicle_id = v.id
      LEFT JOIN fuel_modules fm ON fm.id = vm.module_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ${req.query.order_by === 'psi_desc' ? 'ORDER BY v.rail_pressure_psi_max DESC, b.name, v.model' :
        req.query.order_by === 'year_desc' ? 'ORDER BY v.year_from DESC, b.name, v.model' :
        'ORDER BY b.name, v.model, v.year_from'}
      LIMIT @limit OFFSET @offset
    `, params);

    // Si una búsqueda por modelo no devuelve nada, la registramos: es la mejor
    // señal de qué vehículos agregar al catálogo (demanda real insatisfecha).
    if (rows.length === 0 && typeof model === 'string' && model.trim()) {
      try { await bumpMissing.run(new Date().toISOString().slice(0, 10), model.trim().slice(0, 60).toLowerCase()); }
      catch (e) { /* no crítico */ }
    }

    res.json(rows.map(r => ({
      ...r,
      data_verified: !!r.data_verified,
      rail_pressure_bar_min: psiToBar(r.rail_pressure_psi_min),
      rail_pressure_bar_max: psiToBar(r.rail_pressure_psi_max)
    })));
  });

  // --- Ficha completa anidada ---
  app.get('/api/vehicles/:id', async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'Vehículo no encontrado' });
    const v = await db.get(`
      SELECT v.*, b.name AS brand, it.code AS injection_code, it.name AS injection_name, it.description AS injection_desc
      FROM vehicles v
      JOIN brands b ON b.id = v.brand_id
      JOIN injection_types it ON it.id = v.injection_type_id
      WHERE v.id = ?
    `, [id]);
    if (!v) return res.status(404).json({ error: 'Vehículo no encontrado' });

    const modules = await db.all(`
      SELECT vm.location_text, vm.location_zone, vm.requires_tank_removal, vm.access_notes,
             m.id, m.code, m.name, m.assembly_type, m.regulated_psi, m.flow_lph, m.regulator_type,
             m.float_type, m.strainer_ref, m.connector_desc, m.lines_desc, m.mount_desc, m.diagram_key
      FROM vehicle_modules vm
      JOIN fuel_modules m ON m.id = vm.module_id
      WHERE vm.vehicle_id = ?
    `, v.id);



    res.set('Cache-Control', 'no-store');
    res.json({
      id: v.id,
      slug: vehicleSlug(v),
      brand: v.brand,
      model: v.model,
      years: `${v.year_from}–${v.year_to}`,
      engine: v.engine,
      body_type: v.body_type,
      injection: { code: v.injection_code, name: v.injection_name, description: v.injection_desc },
      rail_pressure: {
        psi_min: v.rail_pressure_psi_min, psi_max: v.rail_pressure_psi_max,
        bar_min: psiToBar(v.rail_pressure_psi_min), bar_max: psiToBar(v.rail_pressure_psi_max)
      },
      notes: v.notes,
      data_verified: !!v.data_verified,
      modules: await Promise.all(modules.map(async m => ({
        id: m.id, code: m.code, name: m.name, assembly_type: m.assembly_type,
        location: {
          text: m.location_text, zone: m.location_zone,
          requires_tank_removal: !!m.requires_tank_removal, access_notes: m.access_notes
        },
        specs: {
          regulated_psi: m.regulated_psi, regulated_bar: psiToBar(m.regulated_psi),
          flow_lph: m.flow_lph, regulator_type: m.regulator_type,
          float_type: m.float_type, strainer_ref: m.strainer_ref, connector_desc: m.connector_desc,
          lines_desc: m.lines_desc, mount_desc: m.mount_desc
        },
        diagram_key: m.diagram_key,
        compatible_pumps: (await db.all(`SELECT p.*, mp.fitment, mp.is_oem, mp.notes AS fitment_notes FROM module_pumps mp JOIN fuel_pumps p ON p.id = mp.pump_id WHERE mp.module_id = ? ORDER BY mp.is_oem DESC`, m.id)).map(p => ({
          id: p.id, code: p.code, manufacturer: p.manufacturer, pump_style: p.pump_style,
          max_psi_direct: p.max_psi_direct, max_bar_direct: psiToBar(p.max_psi_direct),
          amperage_a: p.amperage_a, voltage_v: p.voltage_v, flow_lph_free: p.flow_lph_free,
          inlet_desc: p.inlet_desc, outlet_desc: p.outlet_desc, polarity_desc: p.polarity_desc,
          diagram_key: p.diagram_key,
          fitment: p.fitment, is_oem: !!p.is_oem, fitment_notes: p.fitment_notes
        }))
      })))
    });
  });

  // --- Comentarios de vehículos ---
  // F8 (2.6): 5/h por IP + paginación (limit 1..50 default 20) contra spam/listados sin tope.
  const commentLimiter = rateLimit({ windowMs: 3600_000, limit: process.env.NODE_ENV === 'test' ? 5000 : 5, standardHeaders: true, legacyHeaders: false, store: new StoreBD(db, 'catalog-comments') });
  app.get('/api/vehicles/:id/comments', async (req, res) => {
    const vehicle_id = idDe(req); /* 2.21 */
    if (vehicle_id === null) return res.status(404).json({ error: 'Vehículo no válido' });
    const limit = toInt(req.query.limit, 1, 50) ?? 20;
    const offset = toInt(req.query.offset, 0, 10000) ?? 0;
    const rows = await db.all(`
      SELECT id, parent_id, author_name, content, created_at
      FROM vehicle_comments
      WHERE vehicle_id = ?
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?
    `, [vehicle_id, limit, offset]);
    res.json(rows);
  });

  /* Escribir un comentario exige CUENTA. Antes era público y aceptaba un nombre
     libre del cuerpo, así que cualquiera podía firmar como otro taller; ahora el
     nombre sale de la sesión. Leerlos sigue siendo público: el comentario se ve
     en la ficha del vehículo, que es una página abierta. */
  app.post('/api/vehicles/:id/comments', requireWorkshop, commentLimiter, async (req, res) => {
    const vehicle_id = idDe(req); /* 2.21 */
    if (vehicle_id === null) return res.status(404).json({ error: 'Vehículo no válido' });
    /* `author_name` del cuerpo se IGNORA a propósito: lo pone el servidor con el
       nombre de la cuenta. */
    const { content, parent_id } = req.body || {};

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'El mensaje es requerido' });
    }
    const msg = content.trim().slice(0, 1000);
    if (!msg) return res.status(400).json({ error: 'El mensaje es requerido' });

    /* El nombre de quien comenta es el de su cuenta (no un texto libre). */
    const cuenta = await db.get('SELECT name FROM workshops WHERE id = ?', req.workshopId);
    const name = str(cuenta?.name, 50) || 'Taller';

    /* 2.26 (B33): parent_id inválido → 404, no degradar a raíz. Solo se permite
       omitirlo (respuesta raíz); si viene pero no existe o no es del vehículo,
       es error del cliente. */
    let pId = null;
    if (parent_id !== undefined && parent_id !== null && parent_id !== '') {
      pId = toInt(parent_id, 1, 1e9);
      if (pId === null) return res.status(404).json({ error: 'Comentario padre no encontrado' });
      const parent = await db.get('SELECT id FROM vehicle_comments WHERE id = ? AND vehicle_id = ?', [pId, vehicle_id]);
      if (!parent) return res.status(404).json({ error: 'Comentario padre no encontrado' });
    }

    try {
      const id = await db.insertReturningId(`
        INSERT INTO vehicle_comments (vehicle_id, parent_id, author_name, content)
        VALUES (?, ?, ?, ?)
      `, [vehicle_id, pId, name, msg]);
      
      const newComment = await db.get(`SELECT id, parent_id, author_name, content, created_at FROM vehicle_comments WHERE id = ?`, [id]);
      res.json(newComment);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Error al guardar comentario' });
    }
  });

  // --- Catálogo de módulos ---
  app.get('/api/modules', catalogLimiter, async (req, res) => {
    const limit = toInt(req.query.limit, 1, MAX_PAGE_SIZE) ?? MAX_PAGE_SIZE;
    const offset = toInt(req.query.offset, 0, 10000) ?? 0;
    const rows = await db.all(`
      SELECT m.id, m.code, m.name, m.assembly_type, m.regulated_psi, m.flow_lph, m.regulator_type, m.diagram_key,
             v.id AS vehicle_id, b.name AS brand, v.model, v.year_from, v.year_to
      FROM fuel_modules m
      JOIN vehicle_modules vm ON vm.module_id = m.id
      JOIN vehicles v ON v.id = vm.vehicle_id
      JOIN brands b ON b.id = v.brand_id
      ORDER BY b.name, v.model, v.year_from
      LIMIT @limit OFFSET @offset
    `, { limit, offset });
    res.json(rows.map(r => ({ ...r, regulated_bar: psiToBar(r.regulated_psi) })));
  });

  app.get('/api/modules/:id', async (req, res) => {
    // El id se valida ANTES de tocar la base: toInt devuelve null para basura
    // y pasarle null a un `?` hace que better-sqlite3 lance.
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'Módulo no encontrado' });
    const m = await db.get(`SELECT * FROM fuel_modules WHERE id = ?`, [id]);
    if (!m) return res.status(404).json({ error: 'Módulo no encontrado' });
    res.json({ ...m, regulated_bar: psiToBar(m.regulated_psi) });
  });

  // --- Catálogo de pilas ---
  app.get('/api/pumps', catalogLimiter, async (req, res) => {
    if (!leerPumpsCache()) {
      // .map() va sobre la fila resuelta, no sobre la promesa: sin los paréntesis
      // esto lanzaba TypeError dentro del handler async y la petición quedaba colgada.
      setPumpsCache((await db.all(`SELECT * FROM fuel_pumps ORDER BY manufacturer, code`))
        .map(p => ({ ...p, max_bar_direct: psiToBar(p.max_psi_direct) })));
    }
    res.set('Cache-Control', 'public, max-age=300');
    res.json(leerPumpsCache());
  });

  app.get('/api/pumps/:id', async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'Pila no encontrada' });
    const p = await db.get(`SELECT * FROM fuel_pumps WHERE id = ?`, [id]);
    if (!p) return res.status(404).json({ error: 'Pila no encontrada' });
    res.json({ ...p, max_bar_direct: psiToBar(p.max_psi_direct) });
  });

}

module.exports = { montarCatalog };
