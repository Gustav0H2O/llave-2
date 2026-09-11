'use strict';
/* ============================================================================
   src/routes/orders.js — matriz 4.8 / AR-F4: Órdenes de trabajo.

   Rutas extraídas VERBATIM de server-pg.js (misma respuesta, mismos status y
   mismos campos): GET/POST /api/orders, PUT/DELETE /api/orders/:id, GET /api/orders/:id, POST /api/orders/:id/items, DELETE /api/orders/:id/items/:iid, POST /api/orders/:id/photos, DELETE /api/orders/:id/photos/:pid y POST /api/orders/:id/status.

   POR QUÉ AQUÍ Y NO EN lib/
   Esto habla con la base de datos y con express: es servidor, no regla del
   taller (AGENTS.md §3). lib/ sigue siendo puro.

   CÓMO SE MONTA
   server-pg.js llama montarOrders(app, { ... }) en la MISMA posición en la que
   estaba el bloque, para no cambiar el orden de registro de las rutas. Recibe
   por `deps` exactamente lo que necesita. Ver src/routes/README.md.

   ORDER_TYPES Y ORDER_STATUS SE EXPORTAN
   El respaldo del taller (POST /api/backup/import, que sigue en server-pg.js)
   los usa como listas blancas de las columnas type/status de work_orders. Se
   importan de aquí en vez de duplicarlos: dos copias del enum acaban
   discrepando y el import aceptaría un estado que la API ya no conoce.
   ========================================================================= */
const ORDER_TYPES = ['reparacion', 'servicio', 'garantia', 'promocion', 'otro'];
const ORDER_STATUS = ['Pendiente', 'En proceso', 'Listo', 'Entregado', 'Cancelado'];

function montarOrders(app, deps) {
  const { db, requireWorkshop, idDe, str, num, toInt, enRango, TOPE_QTY, TOPE_PRECIO, errorAccionable, enTransaccion, esDataUrlImagenPermitida } = deps;

  /* ---- Órdenes de trabajo ---- */

  /* 2.18 (B42): el total de la orden se recalcula SOLO cuando una mutación
     cambia sus partidas. Antes lo recalculaba el GET /api/orders/:id, así que
     una simple LECTURA escribía en la base: dos lecturas a la vez competían por
     el mismo UPDATE y una consulta de solo lectura no debe tener efectos. */
  const recalcularTotalOrden = async (oid, ws) => {
    const row = await db.get('SELECT COALESCE(SUM(line_total), 0) AS t FROM work_order_items WHERE order_id=? AND workshop_id=?', [oid, ws]);
    const total = +(Number(row?.t) || 0).toFixed(2);
    await db.run('UPDATE work_orders SET total=? WHERE id=? AND workshop_id=?', [total, oid, ws]);
    return total;
  };

  app.get('/api/orders', requireWorkshop, async (req, res) => {
    const where = ['o.workshop_id = ?']; const args = [req.workshopId];
    if (req.query.status && ORDER_STATUS.includes(req.query.status)) { where.push('o.status = ?'); args.push(req.query.status); }
    if (req.query.type && ORDER_TYPES.includes(req.query.type)) { where.push('o.type = ?'); args.push(req.query.type); }
    const rows = await db.all(`SELECT o.*, c.name AS client_name, cv.model AS vehicle_model, cv.plate
      FROM work_orders o
      LEFT JOIN clients c ON c.id = o.client_id
      LEFT JOIN client_vehicles cv ON cv.id = o.vehicle_id
      WHERE ${where.join(' AND ')} ORDER BY o.id DESC LIMIT 500`, args);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  app.post('/api/orders', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const title = str(b.title, 200);
    if (!title) return res.status(400).json({ error: 'Título requerido' });
    const type = ORDER_TYPES.includes(b.type) ? b.type : 'reparacion';
    const status = ORDER_STATUS.includes(b.status) ? b.status : 'Pendiente';
    const client_id = toInt(b.client_id, 1, 1e9);
    const vehicle_id = toInt(b.vehicle_id, 1, 1e9);
    try {
      if (client_id && !(await db.get('SELECT id FROM clients WHERE id=? AND workshop_id=?', [client_id, req.workshopId]))) {
        return res.status(400).json({ error: 'Cliente no válido' });
      }
      if (vehicle_id && !(await db.get('SELECT id FROM client_vehicles WHERE id=? AND workshop_id=?', [vehicle_id, req.workshopId]))) {
        return res.status(400).json({ error: 'Vehículo no válido' });
      }
      const id = await db.insertReturningId(`INSERT INTO work_orders (workshop_id, client_id, vehicle_id, type, title, descr, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.workshopId, client_id, vehicle_id, type, title, str(b.descr, 2000) || null, status]);
      res.status(201).json({ id });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo crear la orden') }); } /* 2.23 */
  });

  app.put('/api/orders/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const b = req.body || {};
    const title = str(b.title, 200);
    if (!title) return res.status(400).json({ error: 'Título requerido' });
    const type = ORDER_TYPES.includes(b.type) ? b.type : 'reparacion';
    const status = ORDER_STATUS.includes(b.status) ? b.status : 'Pendiente';
    const client_id = toInt(b.client_id, 1, 1e9);
    const vehicle_id = toInt(b.vehicle_id, 1, 1e9);
    try {
      if (client_id && !(await db.get('SELECT id FROM clients WHERE id=? AND workshop_id=?', [client_id, req.workshopId]))) {
        return res.status(400).json({ error: 'Cliente no válido' });
      }
      if (vehicle_id && !(await db.get('SELECT id FROM client_vehicles WHERE id=? AND workshop_id=?', [vehicle_id, req.workshopId]))) {
        return res.status(400).json({ error: 'Vehículo no válido' });
      }
      const closed_at = status === 'Entregado' ? (new Date().toISOString()) : null;
      const info = await db.run(`UPDATE work_orders SET client_id=?, vehicle_id=?, type=?, title=?, descr=?, status=?, closed_at=COALESCE(?, closed_at)
        WHERE id=? AND workshop_id=?`,
        [client_id, vehicle_id, type, title, str(b.descr, 2000) || null, status, closed_at, id, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo actualizar la orden') }); } /* 2.23 */
  });

  app.delete('/api/orders/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    try {
      const info = await db.run('DELETE FROM work_orders WHERE id=? AND workshop_id=?', [id, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo borrar la orden') }); } /* 2.23 */
  });

  /* 2.18: solo lee. El total que se devuelve es el que quedó sellado por la
     última mutación; ya no se recalcula aquí (leer no escribe). */
  app.get('/api/orders/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const order = await db.get('SELECT * FROM work_orders WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!order) return res.status(404).json({ error: 'No encontrado' });
    const items = await db.all('SELECT * FROM work_order_items WHERE order_id=? AND workshop_id=?', [id, req.workshopId]);
    const photos = await db.all('SELECT id, caption, created_at FROM work_order_photos WHERE order_id=? AND workshop_id=?', [id, req.workshopId]);
    res.set('Cache-Control', 'no-store').json({ ...order, items, photos });
  });

  // Items de una orden: al agregar se descuenta stock (kind 'orden')
  app.post('/api/orders/:id/items', requireWorkshop, async (req, res) => {
    const oid = idDe(req); /* 2.21 */
    if (oid === null) return res.status(404).json({ error: 'Orden no encontrada' });
    const b = req.body || {};
    const descr = str(b.descr, 200);
    if (!descr) return res.status(400).json({ error: 'Descripción requerida' });
    const order = await db.get('SELECT id, status FROM work_orders WHERE id=? AND workshop_id=?', [oid, req.workshopId]);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    const qty = num(b.qty) ?? 1;
    /* 2.14: la cantidad de una partida va de 0.01 a 1e6; fuera de rango, 400. */
    if (!enRango(qty, 0.01, TOPE_QTY)) {
      return res.status(400).json({ error: 'Cantidad fuera de rango (0.01 a 1000000)' });
    }
    const unit_price = num(b.unit_price) ?? 0;
    /* 2.14: el precio unitario también va topeado (0..1e8), como en documentos;
       si no, un unit_price absurdo envenena el total de la orden. */
    if (!enRango(unit_price, 0, TOPE_PRECIO)) {
      return res.status(400).json({ error: 'Precio unitario fuera de rango (0 a 100000000)' });
    }
    const line_total = +(qty * unit_price).toFixed(2);
    const item_id = toInt(b.item_id, 1, 1e9);
    /* 2.15 (B43): antes se recortaba a 0 en silencio y la pieza salía del
       inventario sin existir. Si se pide más de lo que hay, se rechaza con 409
       y el mecánico decide (comprar, bajar la cantidad o quitar la pieza). */
    const item = item_id
      ? await db.get('SELECT qty FROM inventory_items WHERE id=? AND workshop_id=?', [item_id, req.workshopId])
      : null;
    if (item && qty > item.qty) {
      return res.status(409).json({ error: `No hay existencia suficiente: quedan ${item.qty} y se piden ${qty}` });
    }
    let iid;
    try {
      await enTransaccion(async () => {
        iid = await db.insertReturningId(`INSERT INTO work_order_items (workshop_id, order_id, item_id, descr, qty, unit_price, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, [req.workshopId, oid, item_id, descr, qty, unit_price, line_total]);
        if (item) {
          await db.run('UPDATE inventory_items SET qty=? WHERE id=? AND workshop_id=?', [item.qty - qty, item_id, req.workshopId]);
          await db.run(`INSERT INTO inventory_moves (workshop_id, item_id, delta, kind, order_id, note)
          VALUES (?, ?, ?, 'orden', ?, ?)`, [req.workshopId, item_id, -qty, oid, `Consumo en orden #${oid}`]);
        }
        await recalcularTotalOrden(oid, req.workshopId); /* 2.18 */
      });
      res.status(201).json({ id: iid });
    } catch (e) {
      return res.status(400).json({ error: errorAccionable(e, 'No se pudo agregar la partida') }); /* 2.23 */
    }
  });

  app.delete('/api/orders/:id/items/:iid', requireWorkshop, async (req, res) => {
    const oid = idDe(req); /* 2.21 */
    const iid = idDe(req, 'iid'); /* 2.21 */
    if (oid === null || iid === null) return res.status(404).json({ error: 'No encontrado' });
    const it = await db.get('SELECT * FROM work_order_items WHERE id=? AND order_id=? AND workshop_id=?', [iid, oid, req.workshopId]);
    if (!it) return res.status(404).json({ error: 'No encontrado' });
    const orden = await db.get('SELECT status FROM work_orders WHERE id=? AND workshop_id=?', [oid, req.workshopId]);
    /* 2.15: solo se devuelve stock si la orden sigue abierta. En una orden ya
       ENTREGADA o CANCELADA la pieza salió del taller: devolverla al anaquel
       inventaría existencia que no está ahí. */
    const devolverStock = !!it.item_id && !!orden && orden.status !== 'Entregado' && orden.status !== 'Cancelado';
    try {
      await enTransaccion(async () => {
        await db.run('DELETE FROM work_order_items WHERE id=? AND workshop_id=?', [iid, req.workshopId]);
        if (devolverStock) {
          await db.run('UPDATE inventory_items SET qty = qty + ? WHERE id=? AND workshop_id=?', [it.qty, it.item_id, req.workshopId]);
          await db.run(`INSERT INTO inventory_moves (workshop_id, item_id, delta, kind, order_id, note)
          VALUES (?, ?, ?, 'ajuste', ?, ?)`, [req.workshopId, it.item_id, it.qty, oid, `Devolución item #${iid} de orden #${oid}`]);
        }
        await recalcularTotalOrden(oid, req.workshopId); /* 2.18 */
      });
    } catch (e) {
      return res.status(400).json({ error: errorAccionable(e, 'No se pudo borrar la partida') }); /* 2.23 */
    }
    res.json({ ok: true });
  });

  // Evidencia (fotos) de una orden — límite 400kb vía json400kb (ver middleware).
  app.post('/api/orders/:id/photos', requireWorkshop, async (req, res) => {
    const oid = idDe(req); /* 2.21 */
    if (oid === null) return res.status(404).json({ error: 'Orden no encontrada' });
    const b = req.body || {};
    const photo = typeof b.photo === 'string' ? b.photo : '';
    if (!photo || !esDataUrlImagenPermitida(photo)) return res.status(400).json({ error: 'Foto inválida (solo PNG/JPEG/WEBP en data URL)' });
    if (photo.length > 350_000) return res.status(400).json({ error: 'Foto demasiado grande (máx ~260 KB base64)' });
    try {
      const cnt = (await db.get('SELECT COUNT(*) c FROM work_order_photos WHERE order_id=? AND workshop_id=?', [oid, req.workshopId]))?.c || 0;
      if (cnt >= 6) return res.status(400).json({ error: 'Máximo 6 fotos por orden' });
      const order = await db.get('SELECT id FROM work_orders WHERE id=? AND workshop_id=?', [oid, req.workshopId]);
      if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
      const pid = await db.insertReturningId(`INSERT INTO work_order_photos (workshop_id, order_id, photo, caption) VALUES (?, ?, ?, ?)`,
        [req.workshopId, oid, photo, str(b.caption, 200) || null]);
      res.status(201).json({ id: pid });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo adjuntar la foto') }); } /* 2.23 */
  });

  app.delete('/api/orders/:id/photos/:pid', requireWorkshop, async (req, res) => {
    const oid = idDe(req); /* 2.21 */
    const pid = idDe(req, 'pid'); /* 2.21 */
    if (oid === null || pid === null) return res.status(404).json({ error: 'No encontrado' });
    try {
      const info = await db.run('DELETE FROM work_order_photos WHERE id=? AND order_id=? AND workshop_id=?', [pid, oid, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo borrar la foto') }); } /* 2.23 */
  });

  app.post('/api/orders/:id/status', requireWorkshop, async (req, res) => {
    const oid = idDe(req); /* 2.21 */
    if (oid === null) return res.status(404).json({ error: 'No encontrado' });
    const status = ORDER_STATUS.includes(req.body?.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: 'Estado inválido' });
    const closed_at = status === 'Entregado' ? new Date().toISOString() : null;
    try {
      const info = await db.run(`UPDATE work_orders SET status=?, closed_at=COALESCE(?, closed_at) WHERE id=? AND workshop_id=?`,
        [status, closed_at, oid, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo cambiar el estado') }); } /* 2.23 */
  });

}

module.exports = { montarOrders, ORDER_TYPES, ORDER_STATUS };
