'use strict';
/* ============================================================================
   src/routes/notes.js — matriz 4.8 / AR-F4: Notas del taller.

   Rutas extraídas VERBATIM de server-pg.js (misma respuesta, mismos status y
   mismos campos): GET/POST /api/notes y DELETE /api/notes/:id. Se añade
   PUT /api/notes/:id (008) para fijar y corregir, que no existía.

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
    /* 008: las fijadas primero. Sin este criterio el orden de las que están
       arriba sería el de llegada a la base, no el que se espera al leer. */
    const rows = await db.all('SELECT * FROM workshop_notes WHERE workshop_id = ? ORDER BY pinned DESC, id DESC LIMIT 200', req.workshopId);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  app.post('/api/notes', requireWorkshop, async (req, res) => {
    const text = str(req.body?.text, 1000);
    if (!text) return res.status(400).json({ error: 'Texto requerido' });
    const id = await db.insertReturningId('INSERT INTO workshop_notes (workshop_id, text, vehicle_ref) VALUES (?, ?, ?)',
      [req.workshopId, text, str(req.body?.vehicle_ref, 80) || null]);
    res.status(201).json({ id });
  });

  /* Fijar, desfijar o corregir una nota. El SET se arma con literales propios
     (`campos` solo recibe cadenas fijas del servidor), nunca con lo que llega
     del cliente, así que el usuario no mete SQL por el WHERE. */
  app.put('/api/notes/:id', requireWorkshop, async (req, res) => {

    const id = idDe(req); /* 2.21 */

    if (id === null) return res.status(404).json({ error: 'No encontrado' });

    const b = req.body || {};

    const campos = [];

    const vals = [];

    if (b.pinned !== undefined) {

      campos.push('pinned = ?');

      vals.push(b.pinned === true || b.pinned === 1 || b.pinned === '1' ? 1 : 0);

    }

    if (b.text !== undefined) {

      const t = str(b.text, 1000);

      if (!t) return res.status(400).json({ error: 'Texto requerido' });

      campos.push('text = ?');

      vals.push(t);

    }

    if (b.vehicle_ref !== undefined) {

      campos.push('vehicle_ref = ?');

      vals.push(str(b.vehicle_ref, 80) || null);

    }

    if (!campos.length) return res.status(400).json({ error: 'No hay nada que actualizar' });

    const info = await db.run(`UPDATE workshop_notes SET ${campos.join(', ')} WHERE id=? AND workshop_id=?`,
      [...vals, id, req.workshopId]);

    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });

    res.json({ ok: true });

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
