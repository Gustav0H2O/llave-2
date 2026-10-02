'use strict';
/* ============================================================================
   src/routes/orders.js — matriz 4.8 / AR-F4: Órdenes de trabajo.

   Rutas extraídas VERBATIM de server-pg.js (misma respuesta, mismos status y
   mismos campos): GET/POST /api/orders, PUT/DELETE /api/orders/:id, GET /api/orders/:id, POST /api/orders/:id/items, DELETE /api/orders/:id/items/:iid, POST /api/orders/:id/photos, DELETE /api/orders/:id/photos/:pid y POST /api/orders/:id/status.

   POR QUÉ AQUÍ Y NO EN lib/
   Esto habla con la base de datos y con express: es servidor, no regla del
   taller (DECISIONES.md §3). lib/ sigue siendo puro.

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
const { crearAlertaStock } = require('../services/stock');

const ORDER_TYPES = ['reparacion', 'servicio', 'garantia', 'promocion', 'otro'];
const ORDER_STATUS = ['Recibido', 'En diagnóstico', 'Esperando repuesto', 'En proceso', 'Listo', 'Entregado', 'Cancelado', 'Pendiente'];
const FUEL_LEVELS = ['vacio', '1/4', '1/2', '3/4', 'lleno'];
const SERVICE_TYPES = ['correctivo', 'preventivo'];
const ITEM_TYPES = ['part', 'labor'];

function montarOrders(app, deps) {
  const { db, requireWorkshop, idDe, str, num, toInt, enRango, TOPE_QTY, TOPE_PRECIO, errorAccionable, enTransaccion, esDataUrlImagenPermitida, esc } = deps;
  const evaluarAlertaStock = crearAlertaStock(db);

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
    if (req.query.service_type && SERVICE_TYPES.includes(req.query.service_type)) { where.push('o.service_type = ?'); args.push(req.query.service_type); }
    if (req.query.client_id) {
      const cid = toInt(req.query.client_id, 1, 1e9);
      if (cid) { where.push('o.client_id = ?'); args.push(cid); }
    }
    if (req.query.vehicle_id) {
      const vid = toInt(req.query.vehicle_id, 1, 1e9);
      if (vid) { where.push('o.vehicle_id = ?'); args.push(vid); }
    }
    const rows = await db.all(`SELECT o.*, c.name AS client_name, cv.model AS vehicle_model, cv.plate, m.name AS mechanic_name
      FROM work_orders o
      LEFT JOIN clients c ON c.id = o.client_id
      LEFT JOIN client_vehicles cv ON cv.id = o.vehicle_id
      LEFT JOIN mechanics m ON m.id = o.mechanic_id
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
    const odometer = toInt(b.odometer, 0, 2_000_000);
    const fuel_level = FUEL_LEVELS.includes(b.fuel_level) ? b.fuel_level : null;
    const reception_notes = str(b.reception_notes, 2000) || null;
    const service_type = SERVICE_TYPES.includes(b.service_type) ? b.service_type : null;
    const assigned_mechanic = str(b.assigned_mechanic, 120) || null;
    const mechanic_id = toInt(b.mechanic_id, 1, 1e9);
    try {
      if (client_id && !(await db.get('SELECT id FROM clients WHERE id=? AND workshop_id=?', [client_id, req.workshopId]))) {
        return res.status(400).json({ error: 'Cliente no válido' });
      }
      if (vehicle_id && !(await db.get('SELECT id FROM client_vehicles WHERE id=? AND workshop_id=?', [vehicle_id, req.workshopId]))) {
        return res.status(400).json({ error: 'Vehículo no válido' });
      }
      if (mechanic_id && !(await db.get('SELECT id FROM mechanics WHERE id=? AND workshop_id=?', [mechanic_id, req.workshopId]))) {
        return res.status(400).json({ error: 'Mecánico no válido' });
      }
      const id = await db.insertReturningId(`INSERT INTO work_orders (workshop_id, client_id, vehicle_id, type, title, descr, status, odometer, fuel_level, reception_notes, service_type, assigned_mechanic, mechanic_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.workshopId, client_id, vehicle_id, type, title, str(b.descr, 2000) || null, status, odometer, fuel_level, reception_notes, service_type, assigned_mechanic, mechanic_id]);
      if (odometer && vehicle_id) {
        await db.run('UPDATE client_vehicles SET mileage=? WHERE id=? AND workshop_id=?', [odometer, vehicle_id, req.workshopId]);
      }
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
    const odometer = toInt(b.odometer, 0, 2_000_000);
    const fuel_level = FUEL_LEVELS.includes(b.fuel_level) ? b.fuel_level : null;
    const reception_notes = str(b.reception_notes, 2000) || null;
    const service_type = SERVICE_TYPES.includes(b.service_type) ? b.service_type : null;
    const assigned_mechanic = str(b.assigned_mechanic, 120) || null;
    const mechanic_id = toInt(b.mechanic_id, 1, 1e9);
    try {
      const actual = await db.get('SELECT status FROM work_orders WHERE id=? AND workshop_id=?', [id, req.workshopId]);
      if (!actual) return res.status(404).json({ error: 'No encontrado' });
      /* Una orden entregada está cerrada: el inventario ya descontó, el
         documento se emitió y la inspección de salida selló la calidad. Se
         reabre desde el estado (POST /:id/status) antes de editarla. */
      if (actual.status === 'Entregado') return res.status(409).json({ error: 'La orden está entregada y no se puede editar: réabrila desde su estado primero' });
      if (client_id && !(await db.get('SELECT id FROM clients WHERE id=? AND workshop_id=?', [client_id, req.workshopId]))) {
        return res.status(400).json({ error: 'Cliente no válido' });
      }
      if (vehicle_id && !(await db.get('SELECT id FROM client_vehicles WHERE id=? AND workshop_id=?', [vehicle_id, req.workshopId]))) {
        return res.status(400).json({ error: 'Vehículo no válido' });
      }
      if (mechanic_id && !(await db.get('SELECT id FROM mechanics WHERE id=? AND workshop_id=?', [mechanic_id, req.workshopId]))) {
        return res.status(400).json({ error: 'Mecánico no válido' });
      }
      const closed_at = status === 'Entregado' ? (new Date().toISOString()) : null;
      const info = await db.run(`UPDATE work_orders SET client_id=?, vehicle_id=?, type=?, title=?, descr=?, status=?, odometer=?, fuel_level=?, reception_notes=?, service_type=?, assigned_mechanic=?, mechanic_id=?, closed_at=COALESCE(?, closed_at)
        WHERE id=? AND workshop_id=?`,
        [client_id, vehicle_id, type, title, str(b.descr, 2000) || null, status, odometer, fuel_level, reception_notes, service_type, assigned_mechanic, mechanic_id, closed_at, id, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      if (odometer && vehicle_id) {
        await db.run('UPDATE client_vehicles SET mileage=? WHERE id=? AND workshop_id=?', [odometer, vehicle_id, req.workshopId]);
      }
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
    const photos = await db.all('SELECT id, photo, caption, created_at FROM work_order_photos WHERE order_id=? AND workshop_id=?', [id, req.workshopId]);
    res.set('Cache-Control', 'no-store').json({ ...order, items, photos });
  });

  // Items de una orden: al agregar se descuenta stock si es 'part'; 'labor' no descuenta inventario
  app.post('/api/orders/:id/items', requireWorkshop, async (req, res) => {
    const oid = idDe(req); /* 2.21 */
    if (oid === null) return res.status(404).json({ error: 'Orden no encontrada' });
    const b = req.body || {};
    const descr = str(b.descr, 200);
    if (!descr) return res.status(400).json({ error: 'Descripción requerida' });
    const order = await db.get('SELECT id, status FROM work_orders WHERE id=? AND workshop_id=?', [oid, req.workshopId]);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    /* 4.10: una orden entregada ya no admite partidas: el descuento de
       inventario y la nota de entrega quedaron sellados. */
    if (order.status === 'Entregado') return res.status(409).json({ error: 'La orden está entregada: no se le pueden agregar partidas' });
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
    const item_type = b.item_type === 'labor' ? 'labor' : 'part';
    const isLabor = item_type === 'labor';
    const item_id = isLabor ? null : toInt(b.item_id, 1, 1e9);
    /* 2.15 (B43): repuestos descuentan inventario; mano de obra (labor) no descuenta stock. */
    const item = (!isLabor && item_id)
      ? await db.get('SELECT qty FROM inventory_items WHERE id=? AND workshop_id=?', [item_id, req.workshopId])
      : null;
    if (item && qty > item.qty) {
      return res.status(409).json({ error: `No hay existencia suficiente: quedan ${item.qty} y se piden ${qty}` });
    }
    let iid;
    try {
      await enTransaccion(async () => {
        iid = await db.insertReturningId(`INSERT INTO work_order_items (workshop_id, order_id, item_id, item_type, descr, qty, unit_price, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [req.workshopId, oid, item_id, item_type, descr, qty, unit_price, line_total]);
        if (item && !isLabor) {
          await db.run('UPDATE inventory_items SET qty=? WHERE id=? AND workshop_id=?', [item.qty - qty, item_id, req.workshopId]);
          await db.run(`INSERT INTO inventory_moves (workshop_id, item_id, delta, kind, order_id, note)
          VALUES (?, ?, ?, 'orden', ?, ?)`, [req.workshopId, item_id, -qty, oid, `Consumo en orden #${oid}`]);
          await evaluarAlertaStock(item_id, req.workshopId);
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
    if (orden?.status === 'Entregado') return res.status(409).json({ error: 'La orden está entregada: no se le pueden quitar partidas' });
    /* 2.15: solo se devuelve stock si la orden sigue abierta y no es mano de obra (labor). */
    const devolverStock = it.item_type !== 'labor' && !!it.item_id && !!orden && orden.status !== 'Entregado' && orden.status !== 'Cancelado';
    try {
      await enTransaccion(async () => {
        await db.run('DELETE FROM work_order_items WHERE id=? AND workshop_id=?', [iid, req.workshopId]);
        if (devolverStock) {
          await db.run('UPDATE inventory_items SET qty = qty + ? WHERE id=? AND workshop_id=?', [it.qty, it.item_id, req.workshopId]);
          await db.run(`INSERT INTO inventory_moves (workshop_id, item_id, delta, kind, order_id, note)
          VALUES (?, ?, ?, 'ajuste', ?, ?)`, [req.workshopId, it.item_id, it.qty, oid, `Devolución item #${iid} de orden #${oid}`]);
          await evaluarAlertaStock(it.item_id, req.workshopId);
        }
        await recalcularTotalOrden(oid, req.workshopId); /* 2.18 */
      });
    } catch (e) {
      return res.status(400).json({ error: errorAccionable(e, 'No se pudo borrar la partida') }); /* 2.23 */
    }
    res.json({ ok: true });
  });

  /* Editar una partida ya puesta (precio, cantidad o descripción). Antes solo
     se podía borrar y volver a crear, lo que perdía la referencia del repuesto
     y recontaba el descuento de stock. Si la partida apunta a una pieza del
     anaquel, el movimiento de stock se recalcula como si se quitara y se
     volviera a consumir. */
  app.put('/api/orders/:id/items/:iid', requireWorkshop, async (req, res) => {
    const oid = idDe(req); /* 2.21 */
    const iid = idDe(req, 'iid'); /* 2.21 */
    if (oid === null || iid === null) return res.status(404).json({ error: 'No encontrado' });
    const it = await db.get('SELECT * FROM work_order_items WHERE id=? AND order_id=? AND workshop_id=?', [iid, oid, req.workshopId]);
    if (!it) return res.status(404).json({ error: 'No encontrado' });
    const orden = await db.get('SELECT status FROM work_orders WHERE id=? AND workshop_id=?', [oid, req.workshopId]);
    if (orden?.status === 'Entregado') return res.status(409).json({ error: 'La orden está entregada: no se le pueden editar partidas' });
    const b = req.body || {};
    const descr = 'descr' in b ? str(b.descr, 200) : it.descr;
    if (!descr) return res.status(400).json({ error: 'Descripción requerida' });
    const qty = 'qty' in b ? (num(b.qty) ?? 1) : it.qty;
    if (!enRango(qty, 0.01, TOPE_QTY)) return res.status(400).json({ error: 'Cantidad fuera de rango (0.01 a 1000000)' });
    const unit_price = 'unit_price' in b ? (num(b.unit_price) ?? 0) : it.unit_price;
    if (!enRango(unit_price, 0, TOPE_PRECIO)) return res.status(400).json({ error: 'Precio unitario fuera de rango (0 a 100000000)' });
    const line_total = +(qty * unit_price).toFixed(2);
    const item_type = b.item_type === 'labor' ? 'labor' : (b.item_type === 'part' ? 'part' : it.item_type);
    const item_id = item_type === 'labor' ? null : (b.item_id !== undefined ? toInt(b.item_id, 1, 1e9) : it.item_id);
    const pieza = (item_id && item_type !== 'labor')
      ? await db.get('SELECT id, qty FROM inventory_items WHERE id=? AND workshop_id=?', [item_id, req.workshopId])
      : null;
    if (item_id && item_type !== 'labor' && !pieza) return res.status(400).json({ error: 'Repuesto no válido' });
    try {
      await enTransaccion(async () => {
        /* Devuelve el consumo anterior (si era repuesto y la orden sigue
           abierta) y vuelve a consumir con la cantidad nueva: así la
           existencia no queda ni corta ni de más cuando se corrige una
           cantidad desde la misma pantalla de la orden. */
        const abierta = orden?.status !== 'Cancelado';
        if (abierta && it.item_id && it.item_type !== 'labor') {
          await db.run('UPDATE inventory_items SET qty = qty + ? WHERE id=? AND workshop_id=?', [it.qty, it.item_id, req.workshopId]);
          await db.run(`INSERT INTO inventory_moves (workshop_id, item_id, delta, kind, order_id, note)
            VALUES (?, ?, ?, 'ajuste', ?, ?)`, [req.workshopId, it.item_id, it.qty, oid, `Ajuste de partida #${iid} de orden #${oid}`]);
          await evaluarAlertaStock(it.item_id, req.workshopId);
        }
        if (pieza && abierta && item_type !== 'labor') {
          const saldo = await db.get('SELECT qty FROM inventory_items WHERE id=? AND workshop_id=?', [pieza.id, req.workshopId]);
          if (qty > (saldo?.qty ?? 0)) throw Object.assign(new Error(`No hay existencia suficiente: quedan ${saldo?.qty ?? 0} y se piden ${qty}`), { status: 409 });
          await db.run('UPDATE inventory_items SET qty=? WHERE id=? AND workshop_id=?', [saldo.qty - qty, pieza.id, req.workshopId]);
          await db.run(`INSERT INTO inventory_moves (workshop_id, item_id, delta, kind, order_id, note)
            VALUES (?, ?, ?, 'orden', ?, ?)`, [req.workshopId, pieza.id, -qty, oid, `Consumo en orden #${oid}`]);
          await evaluarAlertaStock(pieza.id, req.workshopId);
        }
        await db.run(`UPDATE work_order_items SET item_id=?, item_type=?, descr=?, qty=?, unit_price=?, line_total=? WHERE id=? AND workshop_id=?`,
          [item_id, item_type, descr, qty, unit_price, line_total, iid, req.workshopId]);
        await recalcularTotalOrden(oid, req.workshopId); /* 2.18 */
      });
      res.json({ ok: true });
    } catch (e) {
      if (e && e.status === 409) return res.status(409).json({ error: e.message });
      return res.status(400).json({ error: errorAccionable(e, 'No se pudo editar la partida') }); /* 2.23 */
    }
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
      const order = await db.get('SELECT * FROM work_orders WHERE id=? AND workshop_id=?', [oid, req.workshopId]);
      if (!order) return res.status(404).json({ error: 'No encontrado' });
      /* Puerta de entrega: si la orden entró con checklist de recepción,
         no se entrega sin el checklist de salida COMPLETO. Si nunca hubo
         inspección de entrada (orden vieja o flujos ligeros), no se bloquea:
         el taller decide si abre el control de calidad. */
      if (status === 'Entregado') {
        const entrada = await db.get("SELECT id FROM inspections WHERE workshop_id=? AND order_id=? AND tipo='entrada'", [req.workshopId, oid]);
        if (entrada) {
          const salida = await db.get("SELECT status FROM inspections WHERE workshop_id=? AND order_id=? AND tipo='salida'", [req.workshopId, oid]);
          if (!salida || salida.status !== 'completa') {
            return res.status(409).json({ error: 'Falta la inspección de salida: termina el checklist antes de entregar' });
          }
        }
      }
      await enTransaccion(async () => {
        await db.run(`UPDATE work_orders SET status=?, closed_at=COALESCE(?, closed_at) WHERE id=? AND workshop_id=?`,
          [status, closed_at, oid, req.workshopId]);

        if (status === 'Cancelado' && order.status !== 'Cancelado' && order.status !== 'Entregado') {
          const items = await db.all("SELECT * FROM work_order_items WHERE order_id=? AND workshop_id=? AND item_id IS NOT NULL AND item_type != 'labor'", [oid, req.workshopId]);
          for (const it of items) {
            await db.run('UPDATE inventory_items SET qty = qty + ? WHERE id=? AND workshop_id=?', [it.qty, it.item_id, req.workshopId]);
            await db.run(`INSERT INTO inventory_moves (workshop_id, item_id, delta, kind, order_id, note)
              VALUES (?, ?, ?, 'ajuste', ?, ?)`, [req.workshopId, it.item_id, it.qty, oid, `Restitución por cancelación de orden #${oid}`]);
            await evaluarAlertaStock(it.item_id, req.workshopId);
          }
        }

        if (status === 'Entregado' && (req.body?.register_cash || req.body?.auto_cash || req.body?.payment_method || req.body?.method)) {
          const amt = Number(order.total) || 0;
          if (amt > 0) {
            const validMethods = ['cash', 'card', 'transfer', 'other', 'efectivo_usd', 'efectivo_bs', 'pago_movil', 'zelle'];
            const rawMethod = req.body?.method || req.body?.payment_method;
            const method = validMethods.includes(rawMethod) ? rawMethod : 'cash';
            await db.insertReturningId(
              'INSERT INTO cash_moves (workshop_id, concept, amount, type, method) VALUES (?, ?, ?, ?, ?)',
              [req.workshopId, `Cobro orden #${oid}${order.title ? ' - ' + order.title : ''}`, amt, 'ingreso', method]
            );
          }
        }
      });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo cambiar el estado') }); } /* 2.23 */
  });

  // Vista imprimible de orden de trabajo y hoja de recepción
  app.get('/api/orders/:id/print', requireWorkshop, async (req, res) => {
    const id = idDe(req);
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const order = await db.get('SELECT * FROM work_orders WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!order) return res.status(404).json({ error: 'No encontrado' });
    const items = await db.all('SELECT * FROM work_order_items WHERE order_id=? AND workshop_id=?', [id, req.workshopId]);
    const client = order.client_id ? await db.get('SELECT * FROM clients WHERE id=? AND workshop_id=?', [order.client_id, req.workshopId]) : null;
    const vehicle = order.vehicle_id ? await db.get('SELECT * FROM client_vehicles WHERE id=? AND workshop_id=?', [order.vehicle_id, req.workshopId]) : null;
    const ws = await db.get('SELECT name, phone, address, doc_id FROM workshops WHERE id=?', req.workshopId);
    const rate = Number(req.query.rate) || 1.0;
    const escv = esc || ((s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')));
    const rowsHtml = items.map((i, idx) => {
      const uPrice = Number(i.unit_price || 0);
      const lTotal = Number(i.line_total || 0);
      const dualU = rate > 1 ? `<br><small style="color:#666">${(uPrice * rate).toLocaleString('es', { minimumFractionDigits: 2 })}</small>` : '';
      const dualT = rate > 1 ? `<br><small style="color:#666">${(lTotal * rate).toLocaleString('es', { minimumFractionDigits: 2 })}</small>` : '';
      const tipo = i.item_type === 'labor' ? 'Labor' : 'Repuesto';
      return `<tr>
        <td>${idx + 1}</td><td><span style="font-weight:700;color:#3F5132;">[${tipo}]</span> ${escv(i.descr)}</td><td>${escv(i.qty)}</td>
        <td>$${uPrice.toFixed(2)}${dualU}</td><td>$${lTotal.toFixed(2)}${dualT}</td>
      </tr>`;
    }).join('');
    const totalVal = Number(order.total || 0);
    const totalBsHtml = rate > 1 ? `<div style="font-size:14px;color:#555;margin-top:4px">Equivalente: <strong>${(totalVal * rate).toLocaleString('es', { minimumFractionDigits: 2 })} (Tasa: ${rate.toFixed(2)})</strong></div>` : '';
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
      <title>Orden de Trabajo #${order.id}</title>
      <style>
        * { box-sizing: border-box; } body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 32px; }
        .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #3F5132; padding-bottom: 14px; margin-bottom: 20px; }
        .head h1 { font-size: 22px; margin: 0; letter-spacing: 1px; } .head .num { font-size: 24px; font-weight: 800; text-align: right; }
        .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin-bottom: 18px; font-size: 13px; }
        .meta b { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 2px; }
        .box { background: #f8f9fa; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; font-size: 12.5px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
        th { background: #0F1113; color: #fff; text-align: left; padding: 8px; }
        td { padding: 8px; border-bottom: 1px solid #ddd; }
        .tot { text-align: right; margin-top: 16px; font-size: 18px; font-weight: 800; }
        .firmas { margin-top: 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; font-size: 11px; color: #555; }
        .no-print { margin-bottom: 16px; display: flex; justify-content: flex-end; }
        .btn-print { background: #3F5132; color: #fff; border: 0; padding: 8px 16px; border-radius: 6px; font-weight: 700; cursor: pointer; }
        @media print { body { margin: 12px; } .no-print { display: none; } }
      </style></head><body>
        <div class="no-print"><button type="button" class="btn-print" onclick="window.print()">Imprimir / Guardar PDF</button></div>
        <div class="head">
          <div><h1>${escv(ws?.name || 'Taller')}</h1><div style="font-size:11px;color:#666">${ws?.doc_id ? 'ID: ' + escv(ws.doc_id) + ' · ' : ''}${ws?.address ? escv(ws.address) + ' · ' : ''}llave</div></div>
          <div class="num">ORDEN DE TRABAJO<br>#${order.id}</div>
        </div>
        <div class="meta">
          <div><b>Cliente</b>${escv(client?.name || '—')}<br>${client?.doc_id ? 'Doc: ' + escv(client.doc_id) + '<br>' : ''}${escv(client?.phone || '')}</div>
          <div><b>Vehículo</b>${escv([vehicle?.brand, vehicle?.model, vehicle?.year].filter(Boolean).join(' ') || '—')}<br>${vehicle?.plate ? 'Placa: ' + escv(vehicle.plate) + '<br>' : ''}${vehicle?.vin ? 'VIN: ' + escv(vehicle.vin) : ''}</div>
          <div><b>Odómetro</b>${order.odometer != null ? escv(order.odometer.toLocaleString('es')) + ' km' : '—'}<br><b>Combustible</b>${escv(order.fuel_level || '—')}</div>
          <div><b>Fecha</b>${order.created_at ? new Date(order.created_at).toLocaleString('es') : ''}<br><b>Estado:</b> ${escv(order.status)}${order.assigned_mechanic ? '<br><b>Mecánico:</b> ' + escv(order.assigned_mechanic) : ''}</div>
        </div>
        <div class="box">
          <b>Motivo / Fallas reportadas:</b> ${escv(order.descr || order.title)}
          ${order.reception_notes ? `<br><b style="margin-top:4px;display:inline-block;">Notas de recepción / Inspección:</b> ${escv(order.reception_notes)}` : ''}
        </div>
        <table><thead><tr><th>#</th><th>Partida / Trabajo</th><th>Cant.</th><th>P. Unit.</th><th>Total</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="5" style="text-align:center;color:#888;">Sin partidas registradas</td></tr>'}</tbody></table>
        <div class="tot">Total: $${totalVal.toFixed(2)}${totalBsHtml}</div>
        <div class="firmas">
          <div style="border-top:1px solid #888;padding-top:8px;">Firma del Responsable del Taller</div>
          <div style="border-top:1px solid #888;padding-top:8px;">Firma de Conformidad del Cliente</div>
        </div>
      </body></html>`;
    res.send(html);
  });

}

module.exports = { montarOrders, ORDER_TYPES, ORDER_STATUS, FUEL_LEVELS, SERVICE_TYPES, ITEM_TYPES };
