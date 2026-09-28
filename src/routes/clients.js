'use strict';
/* ============================================================================
   src/routes/clients.js — matriz 4.8 / AR-F4: Clientes + vehículos.

   Rutas extraídas VERBATIM de server-pg.js (misma respuesta, mismos status y
   mismos campos): GET/POST /api/clients, PUT/DELETE /api/clients/:id, GET/POST /api/clients/:id/vehicles y DELETE /api/clients/vehicles/:vid.

   POR QUÉ AQUÍ Y NO EN lib/
   Esto habla con la base de datos y con express: es servidor, no regla del
   taller (AGENTS.md §3). lib/ sigue siendo puro.

   CÓMO SE MONTA
   server-pg.js llama montarClients(app, { ... }) en la MISMA posición en la que
   estaba el bloque, para no cambiar el orden de registro de las rutas. Recibe
   por `deps` exactamente lo que necesita. Ver src/routes/README.md.
   ========================================================================= */
function montarClients(app, deps) {
  const { db, requireWorkshop, idDe, str, toInt, errorAccionable } = deps;

  /* ---- Clientes + vehículos ---- */
  app.get('/api/clients', requireWorkshop, async (req, res) => {
    // Tope 500 = mismo criterio que órdenes y caja (robot carga: sin tope devolvía 800+)
    const rows = await db.all('SELECT * FROM clients WHERE workshop_id = ? ORDER BY name LIMIT 500', req.workshopId);
    // Adjuntar vehículos de cada cliente para el selector de órdenes
    const out = [];
    for (const c of rows) {
      const vehicles = await db.all('SELECT id, brand, model, year, plate, vin, mileage FROM client_vehicles WHERE client_id = ? AND workshop_id = ?', [c.id, req.workshopId]);
      out.push({ ...c, vehicles });
    }
    res.set('Cache-Control', 'no-store').json(out);
  });

  app.post('/api/clients', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const name = str(b.name, 120);
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    try {
      const id = await db.insertReturningId(`INSERT INTO clients (workshop_id, name, doc_id, phone, email, address, city, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.workshopId, name, str(b.doc_id, 40) || null, str(b.phone, 40) || null, str(b.email, 120) || null,
         str(b.address, 300) || null, str(b.city, 120) || null, str(b.notes, 500) || null]);
      res.status(201).json({ id });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo guardar el cliente') }); } /* 2.23 */
  });

  app.put('/api/clients/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const b = req.body || {};
    const name = str(b.name, 120);
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    try {
      const info = await db.run(`UPDATE clients SET name=?, doc_id=?, phone=?, email=?, address=?, city=?, notes=?
        WHERE id=? AND workshop_id=?`,
        [name, str(b.doc_id, 40) || null, str(b.phone, 40) || null, str(b.email, 120) || null, str(b.address, 300) || null,
         str(b.city, 120) || null, str(b.notes, 500) || null, id, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo actualizar el cliente') }); } /* 2.23 */
  });

  app.delete('/api/clients/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    try {
      const info = await db.run('DELETE FROM clients WHERE id=? AND workshop_id=?', [id, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo borrar el cliente') }); } /* 2.23 */
  });

  app.get('/api/clients/:id/vehicles', requireWorkshop, async (req, res) => {
    const cid = idDe(req); /* 2.21 */
    if (cid === null) return res.status(404).json({ error: 'No encontrado' });
    const rows = await db.all('SELECT * FROM client_vehicles WHERE workshop_id=? AND client_id=? ORDER BY id', [req.workshopId, cid]);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  app.post('/api/clients/:id/vehicles', requireWorkshop, async (req, res) => {
    const cid = idDe(req); /* 2.21 */
    if (cid === null) return res.status(404).json({ error: 'Cliente no encontrado' });
    const b = req.body || {};
    const owner = await db.get('SELECT id FROM clients WHERE id=? AND workshop_id=?', [cid, req.workshopId]);
    if (!owner) return res.status(404).json({ error: 'Cliente no encontrado' });
    try {
      const vid = await db.insertReturningId(`INSERT INTO client_vehicles (workshop_id, client_id, brand, model, year, plate, vin, mileage, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.workshopId, cid, str(b.brand, 60) || null, str(b.model, 80) || null,
         toInt(b.year, 1900, 2100), str(b.plate, 20).toUpperCase() || null, str(b.vin, 30) || null, toInt(b.mileage, 0, 2_000_000), str(b.notes, 300) || null]);
      res.status(201).json({ id: vid });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo guardar el vehículo') }); } /* 2.23 */
  });

  app.delete('/api/clients/vehicles/:vid', requireWorkshop, async (req, res) => {
    const vid = idDe(req, 'vid'); /* 2.21 */
    if (vid === null) return res.status(404).json({ error: 'No encontrado' });
    try {
      const info = await db.run('DELETE FROM client_vehicles WHERE id=? AND workshop_id=?', [vid, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo borrar el vehículo') }); } /* 2.23 */
  });

  /* Editar un vehículo ya cargado: antes había que borrarlo y volver a
     crearlo, lo que lo desligaba de su historial de órdenes. La validación
     es la misma del alta. */
  app.put('/api/clients/:id/vehicles/:vid', requireWorkshop, async (req, res) => {
    const cid = idDe(req); /* 2.21 */
    const vid = idDe(req, 'vid'); /* 2.21 */
    if (cid === null || vid === null) return res.status(404).json({ error: 'No encontrado' });
    const b = req.body || {};
    try {
      const actual = await db.get('SELECT id FROM client_vehicles WHERE id=? AND client_id=? AND workshop_id=?', [vid, cid, req.workshopId]);
      if (!actual) return res.status(404).json({ error: 'No encontrado' });
      const info = await db.run(`UPDATE client_vehicles SET brand=?, model=?, year=?, plate=?, vin=?, mileage=?, notes=?
        WHERE id=? AND client_id=? AND workshop_id=?`,
        [str(b.brand, 60) || null, str(b.model, 80) || null, toInt(b.year, 1900, 2100),
         str(b.plate, 20).toUpperCase() || null, str(b.vin, 30) || null, toInt(b.mileage, 0, 2_000_000),
         str(b.notes, 300) || null, vid, cid, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo actualizar el vehículo') }); } /* 2.23 */
  });

  /* Expediente del vehículo: todo lo que el taller le hizo, en una sola
     consulta. Es lo que se mira cuando el cliente pregunta "¿qué le
     cambiaron la última vez?". */
  app.get('/api/clients/vehicles/:vid/history', requireWorkshop, async (req, res) => {
    const vid = idDe(req, 'vid'); /* 2.21 */
    if (vid === null) return res.status(404).json({ error: 'No encontrado' });
    const vehicle = await db.get('SELECT * FROM client_vehicles WHERE id=? AND workshop_id=?', [vid, req.workshopId]);
    if (!vehicle) return res.status(404).json({ error: 'No encontrado' });
    const client = vehicle.client_id
      ? await db.get('SELECT id, name, phone, email FROM clients WHERE id=? AND workshop_id=?', [vehicle.client_id, req.workshopId])
      : null;
    const orders = await db.all(`SELECT id, title, descr, status, type, service_type, total, odometer, fuel_level, created_at, closed_at
      FROM work_orders WHERE workshop_id=? AND vehicle_id=? ORDER BY id DESC LIMIT 200`, [req.workshopId, vid]);
    const documents = await db.all(`SELECT d.id, d.kind, d.number, d.status, d.total, d.created_at
      FROM documents d JOIN work_orders o ON o.id = d.order_id
      WHERE d.workshop_id=? AND o.vehicle_id=? ORDER BY d.id DESC LIMIT 200`, [req.workshopId, vid]);
    const total = await db.get(`SELECT COUNT(*) AS ordenes, COALESCE(SUM(total), 0) AS facturado FROM work_orders
      WHERE workshop_id=? AND vehicle_id=? AND status='Entregado'`, [req.workshopId, vid]);
    res.set('Cache-Control', 'no-store').json({
      vehicle, client, orders, documents,
      resumen: { ordenes: Number(total?.ordenes) || 0, facturado: +(Number(total?.facturado) || 0).toFixed(2) },
    });
  });

}

module.exports = { montarClients };
