'use strict';
/* ============================================================================
   src/routes/inventory.js — matriz 4.8 / AR-F4: Inventario.

   Rutas extraídas VERBATIM de server-pg.js (misma respuesta, mismos status y
   mismos campos): GET/POST /api/inventory, PUT/DELETE /api/inventory/:id, POST /api/inventory/:id/moves, GET /api/inventory/moves y GET /api/inventory/export.

   POR QUÉ AQUÍ Y NO EN lib/
   Esto habla con la base de datos y con express: es servidor, no regla del
   taller (AGENTS.md §3). lib/ sigue siendo puro.

   CÓMO SE MONTA
   server-pg.js llama montarInventory(app, { ... }) en la MISMA posición en la que
   estaba el bloque, para no cambiar el orden de registro de las rutas. Recibe
   por `deps` exactamente lo que necesita. Ver src/routes/README.md.
   ========================================================================= */
function montarInventory(app, deps) {
  const { db, requireWorkshop, idDe, str, num, enRango, TOPE_QTY, TOPE_PRECIO, FUERA_CANTIDAD, FUERA_PRECIO, errorAccionable, enTransaccion, csvEscape } = deps;

  /* ---- Inventario ---- */
  app.get('/api/inventory', requireWorkshop, async (req, res) => {
    // Tope 500 = mismo criterio que órdenes y caja (robot carga: sin tope devolvía 800+)
    const rows = await db.all('SELECT * FROM inventory_items WHERE workshop_id = ? ORDER BY name LIMIT 500', req.workshopId);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  app.post('/api/inventory', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const name = str(b.name, 120);
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    /* 2.14 (V-A2/B41): qty y min_qty 0..1e6, unit_price 0..1e8. */
    const qty = num(b.qty) ?? 0;
    const min_qty = num(b.min_qty) ?? 0;
    const unit_price = num(b.unit_price) ?? 0;
    if (!enRango(qty, 0, TOPE_QTY) || !enRango(min_qty, 0, TOPE_QTY)) {
      return res.status(400).json({ error: FUERA_CANTIDAD });
    }
    if (!enRango(unit_price, 0, TOPE_PRECIO)) {
      return res.status(400).json({ error: FUERA_PRECIO });
    }
    try {
      const id = await db.insertReturningId(`INSERT INTO inventory_items
        (workshop_id, name, sku, category, qty, min_qty, unit_price, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.workshopId, name, str(b.sku, 60) || null, str(b.category, 60) || null,
         qty, min_qty, unit_price, str(b.notes, 500) || null]);
      res.status(201).json({ id });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo guardar la pieza') }); } /* 2.23 */
  });

  app.put('/api/inventory/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const b = req.body || {};
    const name = str(b.name, 120);
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    /* 2.14: mismo tope en la edición. `qty` no se escribe aquí —la existencia se
       mueve con /moves, que deja historial— pero si viene con un valor absurdo se
       rechaza en vez de ignorarlo en silencio. */
    const min_qty = num(b.min_qty) ?? 0;
    const unit_price = num(b.unit_price) ?? 0;
    const qtyRecibida = b.qty === undefined ? null : (num(b.qty) ?? 0);
    if (!enRango(min_qty, 0, TOPE_QTY) || (qtyRecibida !== null && !enRango(qtyRecibida, 0, TOPE_QTY))) {
      return res.status(400).json({ error: FUERA_CANTIDAD });
    }
    if (!enRango(unit_price, 0, TOPE_PRECIO)) {
      return res.status(400).json({ error: FUERA_PRECIO });
    }
    try {
      const info = await db.run(`UPDATE inventory_items SET name=?, sku=?, category=?, min_qty=?, unit_price=?, notes=?
        WHERE id=? AND workshop_id=?`,
        [name, str(b.sku, 60) || null, str(b.category, 60) || null,
         min_qty, unit_price, str(b.notes, 500) || null, id, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo actualizar la pieza') }); } /* 2.23 */
  });

  app.delete('/api/inventory/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    try {
      const info = await db.run('DELETE FROM inventory_items WHERE id=? AND workshop_id=?', [id, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo borrar la pieza') }); } /* 2.23 */
  });

  // Movimiento (entrada/salida/ajuste): registra y actualiza stock
  app.post('/api/inventory/:id/moves', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const b = req.body || {};
    const delta = num(b.delta);
    const kind = ['entrada', 'salida', 'ajuste'].includes(b.kind) ? b.kind : 'ajuste';
    if (delta === null) return res.status(400).json({ error: 'Delta requerido' });
    /* 2.14: el delta va de -1e6 a +1e6 y su SIGNO tiene que cuadrar con el tipo
       de movimiento. Un "entrada" con delta negativo (o al revés) descuadra el
       kardex: el historial diría lo contrario de lo que pasó con la existencia. */
    if (!enRango(delta, -TOPE_QTY, TOPE_QTY)) {
      return res.status(400).json({ error: `Delta fuera de rango (-${TOPE_QTY} a ${TOPE_QTY})` });
    }
    if (kind === 'entrada' && delta <= 0) {
      return res.status(400).json({ error: 'Una entrada necesita un delta positivo' });
    }
    if (kind === 'salida' && delta >= 0) {
      return res.status(400).json({ error: 'Una salida necesita un delta negativo' });
    }
    const item = await db.get('SELECT qty FROM inventory_items WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!item) return res.status(404).json({ error: 'No encontrado' });
    const newQty = Math.max(0, item.qty + delta);
    try {
      await enTransaccion(async () => {
        await db.run(`UPDATE inventory_items SET qty=? WHERE id=? AND workshop_id=?`, [newQty, id, req.workshopId]);
        await db.run(`INSERT INTO inventory_moves (workshop_id, item_id, delta, kind, note) VALUES (?,?,?,?,?)`,
          [req.workshopId, id, delta, kind, str(b.note, 300) || null]);
      });
    } catch (e) {
      return res.status(400).json({ error: errorAccionable(e, 'No se pudo registrar el movimiento') }); /* 2.23 */
    }
    res.json({ ok: true, qty: newQty });
  });

  app.get('/api/inventory/moves', requireWorkshop, async (req, res) => {
    const rows = await db.all(`SELECT m.*, i.name AS item_name FROM inventory_moves m
      JOIN inventory_items i ON i.id = m.item_id
      WHERE m.workshop_id = ? ORDER BY m.id DESC LIMIT 500`, req.workshopId);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  app.get('/api/inventory/export', requireWorkshop, async (req, res) => {
    const rows = await db.all('SELECT name, sku, category, qty, min_qty, unit_price, notes FROM inventory_items WHERE workshop_id = ? ORDER BY name', req.workshopId);
    if (req.query.format === 'csv') {
      const head = ['Nombre', 'SKU', 'Categoría', 'Cantidad', 'Mínimo', 'Precio', 'Notas'];
      /* 4.6: csvEscape real (no el esc de HTML): dobla comillas y encierra el
         campo con coma/comilla/salto. */
      const csv = [head.map(csvEscape).join(','), ...rows.map(r => [r.name, r.sku, r.category, r.qty, r.min_qty, r.unit_price, r.notes].map(csvEscape).join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="inventario.csv"');
      return res.send(csv);
    }
    res.json(rows);
  });

}

module.exports = { montarInventory };
