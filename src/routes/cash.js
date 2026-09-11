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
  const { db, requireWorkshop, idDe, str, num, enRango, TOPE_QTY } = deps;

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
    const id = await db.insertReturningId('INSERT INTO cash_moves (workshop_id, concept, amount, type) VALUES (?, ?, ?, ?)',
      [req.workshopId, concept, amount, type]);
    res.status(201).json({ id });
  });

  app.delete('/api/cash/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const info = await db.run('DELETE FROM cash_moves WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

}

module.exports = { montarCash };
