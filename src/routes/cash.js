'use strict';
/* ============================================================================
   src/routes/cash.js — matriz 4.8 / AR-F4: Caja.

   Rutas extraídas VERBATIM de server-pg.js (misma respuesta, mismos status y
   mismos campos): GET/POST /api/cash y DELETE /api/cash/:id.

   POR QUÉ AQUÍ Y NO EN lib/
   Esto habla con la base de datos y con express: es servidor, no regla del
   taller (AGENTS.md §3). lib/ sigue siendo puro.

   CÓMO SE MONTA
   server-pg.js llama montarCash(app, { ... }) en la MISMA posición en la que
   estaba el bloque, para no cambiar el orden de registro de las rutas. Recibe
   por `deps` exactamente lo que necesita. Ver src/routes/README.md.
   ========================================================================= */
function montarCash(app, deps) {
  const { db, requireWorkshop, idDe, str, num, enRango, TOPE_QTY, errorAccionable, fechaISO } = deps;

  /* ---- Caja ---- */
  app.get('/api/cash', requireWorkshop, async (req, res) => {
    const rows = await db.all('SELECT * FROM cash_moves WHERE workshop_id = ? ORDER BY id DESC LIMIT 500', req.workshopId);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  app.post('/api/cash', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const concept = str(b.concept, 200);
    const amount = num(b.amount);
    const type = b.type === 'egreso' ? 'egreso' : 'ingreso';
    /* 2.14 (V-A2/B41): el monto de caja va de 0.01 a 1e6. Antes solo se exigía
       mayor que cero: un dedazo de 999999999 descuadraba el corte del día. */
    if (!concept || !enRango(amount, 0.01, TOPE_QTY)) {
      return res.status(400).json({ error: 'Concepto y monto válido requeridos (0.01 a 1000000)' });
    }
    const CASH_METHODS = ['cash', 'card', 'transfer', 'other', 'efectivo_usd', 'efectivo_bs', 'pago_movil', 'zelle'];
    const method = CASH_METHODS.includes(b.method) ? b.method : 'cash';
    const id = await db.insertReturningId('INSERT INTO cash_moves (workshop_id, concept, amount, type, method) VALUES (?, ?, ?, ?, ?)',
      [req.workshopId, concept, amount, type, method]);
    res.status(201).json({ id });
  });

  /* ---- Cortes de caja (arqueo del día) ----

     El corte se calcula SOLO con los movimientos del día pedido y se guarda
     congelado (una foto): si mañana alguien corrige un movimiento, el corte de
     ayer sigue diciendo lo que se contó ese día. La comparación es por fecha
     ISO del propio servidor (fechaISO), no por el texto de la base, para que
     funcione igual en SQLite y en PostgreSQL. */

  const METODOS_EFECTIVO = ['cash', 'efectivo_usd', 'efectivo_bs'];

  app.get('/api/cash/closings', requireWorkshop, async (req, res) => {
    const rows = await db.all('SELECT * FROM cash_closings WHERE workshop_id = ? ORDER BY id DESC LIMIT 200', req.workshopId);
    res.set('Cache-Control: no-store').json(rows.map((r) => {
      let por_metodo = {};
      try { por_metodo = JSON.parse(r.por_metodo || '{}'); } catch { por_metodo = {}; }
      return { ...r, por_metodo };
    }));
  });

  app.post('/api/cash/closings', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    /* "Hoy" en UTC: created_at se guarda en UTC (CURRENT_TIMESTAMP) y fechaISO
       lo devuelve en UTC, así que el corte del día y las fechas de los
       movimientos hablan el mismo idioma. */
    const hoy = new Date().toISOString().slice(0, 10);
    const fecha = str(b.fecha, 10) || hoy;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: 'Fecha inválida (use AAAA-MM-DD)' });
    const conteo = (b.conteo === undefined || b.conteo === null || b.conteo === '') ? null : num(b.conteo);
    if (conteo !== null && !enRango(conteo, 0, 100000000)) {
      return res.status(400).json({ error: 'El conteo debe ir entre 0 y 100000000' });
    }
    try {
      const movs = await db.all('SELECT amount, type, method, created_at FROM cash_moves WHERE workshop_id = ? ORDER BY id DESC LIMIT 5000', req.workshopId);
      let ingresos = 0, egresos = 0, efectivo = 0, movimientos = 0;
      const por_metodo = {};
      for (const m of movs) {
        if ((fechaISO(m.created_at) || '').slice(0, 10) !== fecha) continue;
        const importe = Number(m.amount) || 0;
        const met = m.method || 'cash';
        const esEgreso = m.type === 'egreso';
        if (!por_metodo[met]) por_metodo[met] = { ingresos: 0, egresos: 0 };
        if (esEgreso) { egresos += importe; por_metodo[met].egresos += importe; }
        else { ingresos += importe; por_metodo[met].ingresos += importe; }
        if (METODOS_EFECTIVO.includes(met)) efectivo += esEgreso ? -importe : importe;
        movimientos += 1;
      }
      const r2 = (x) => +((Number(x) || 0).toFixed(2));
      for (const met of Object.keys(por_metodo)) {
        por_metodo[met] = { ingresos: r2(por_metodo[met].ingresos), egresos: r2(por_metodo[met].egresos) };
      }
      const saldo = r2(ingresos - egresos);
      const diferencia = conteo === null ? null : r2(conteo - r2(efectivo));
      const id = await db.insertReturningId(`INSERT INTO cash_closings
        (workshop_id, fecha, ingresos, egresos, saldo, por_metodo, movimientos, conteo, diferencia, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.workshopId, fecha, r2(ingresos), r2(egresos), saldo, JSON.stringify(por_metodo), movimientos, conteo, diferencia, str(b.notes, 1000) || null]);
      res.status(201).json({ id, fecha, ingresos: r2(ingresos), egresos: r2(egresos), saldo, efectivo: r2(efectivo), movimientos, conteo, diferencia, por_metodo });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo cerrar la caja') }); }
  });

  app.delete('/api/cash/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const info = await db.run('DELETE FROM cash_moves WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

  /* Editar un movimiento de caja. Faltaba por completo: un monto mal tecleado
     obligaba a borrar el movimiento y volver a crearlo, con lo que se perdía
     su fecha original y el orden del arqueo. Se revalida todo igual que en el
     POST para que no entre por aquí un monto fuera de rango. */
  app.put('/api/cash/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const b = req.body || {};
    const concept = str(b.concept, 200);
    const amount = num(b.amount);
    const type = b.type === 'egreso' ? 'egreso' : 'ingreso';
    if (!concept || !enRango(amount, 0.01, TOPE_QTY)) {
      return res.status(400).json({ error: 'Concepto y monto válido requeridos (0.01 a 1000000)' });
    }
    const METODOS_VALIDOS = ['cash', 'card', 'transfer', 'other', 'efectivo_usd', 'efectivo_bs', 'pago_movil', 'zelle'];
    const method = METODOS_VALIDOS.includes(b.method) ? b.method : 'cash';
    const info = await db.run('UPDATE cash_moves SET concept=?, amount=?, type=?, method=? WHERE id=? AND workshop_id=?',
      [concept, amount, type, method, id, req.workshopId]);
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

  /* Borrar un corte equivocado. Era imposible: un arqueo mal contado quedaba
     congelado para siempre y descuadraba el historial. Solo borra la foto del
     corte, nunca los movimientos del dia. */
  app.delete('/api/cash/closings/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const info = await db.run('DELETE FROM cash_closings WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

}

module.exports = { montarCash };
