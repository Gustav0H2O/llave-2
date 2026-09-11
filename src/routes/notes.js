'use strict';
/* ============================================================================
   src/routes/notes.js — matriz 4.8 / AR-F4: Notas del taller.

   Rutas extraídas VERBATIM de server-pg.js (misma respuesta, mismos status y
   mismos campos): GET/POST /api/notes y DELETE /api/notes/:id.

   POR QUÉ AQUÍ Y NO EN lib/
   Esto habla con la base de datos y con express: es servidor, no regla del
   taller (AGENTS.md §3). lib/ sigue siendo puro.

   CÓMO SE MONTA
   server-pg.js llama montarNotes(app, { ... }) en la MISMA posición en la que
   estaba el bloque, para no cambiar el orden de registro de las rutas. Recibe
   por `deps` exactamente lo que necesita. Ver src/routes/README.md.
   ========================================================================= */
function montarNotes(app, deps) {
  const { db, requireWorkshop, idDe, str } = deps;

  /* ---- Notas del taller (rápidas) ---- */
  app.get('/api/notes', requireWorkshop, async (req, res) => {
    const rows = await db.all('SELECT * FROM workshop_notes WHERE workshop_id = ? ORDER BY id DESC LIMIT 200', req.workshopId);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  app.post('/api/notes', requireWorkshop, async (req, res) => {
    const text = str(req.body?.text, 1000);
    if (!text) return res.status(400).json({ error: 'Texto requerido' });
    const id = await db.insertReturningId('INSERT INTO workshop_notes (workshop_id, text, vehicle_ref) VALUES (?, ?, ?)',
      [req.workshopId, text, str(req.body?.vehicle_ref, 80) || null]);
    res.status(201).json({ id });
  });

  app.delete('/api/notes/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const info = await db.run('DELETE FROM workshop_notes WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

}

module.exports = { montarNotes };
