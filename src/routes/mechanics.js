'use strict';
/* ============================================================================
   src/routes/mechanics.js — Personal del taller (mecánicos y ayudantes).

   Antes la orden solo tenía `assigned_mechanic`, un texto libre: no se podía
   filtrar por persona, ni contar la carga de cada una, ni saber a quién le
   pertenece el trabajo si el nombre se escribía distinto. Ahora el taller da
   de alta a su gente una vez y asigna por id; `assigned_mechanic` queda como
   etiqueta para imprimir.

   CÓMO SE MONTA
   server-pg.js llama montarMechanics(app, { ... }) antes de montarOrders
   (las órdenes hacen JOIN con esta tabla).
   ========================================================================= */
const MECHANIC_ROLES = ['mecanico', 'ayudante', 'administrador'];
/* Estados en los que una orden sigue contando como carga abierta. */
const ORDENES_ABIERTAS = ['Pendiente', 'Recibido', 'En diagnóstico', 'Esperando repuesto', 'En proceso', 'Listo'];

function montarMechanics(app, deps) {
  const { db, requireWorkshop, idDe, str, errorAccionable } = deps;

  app.get('/api/mechanics', requireWorkshop, async (req, res) => {
    const rows = await db.all(`SELECT m.*,
        (SELECT COUNT(*) FROM work_orders o WHERE o.workshop_id = m.workshop_id AND o.mechanic_id = m.id AND o.status IN (${ORDENES_ABIERTAS.map(() => '?').join(',')})) AS open_orders
      FROM mechanics m WHERE m.workshop_id = ? ORDER BY m.active DESC, m.name`,
      [...ORDENES_ABIERTAS, req.workshopId]);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  app.post('/api/mechanics', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const name = str(b.name, 120);
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const role = MECHANIC_ROLES.includes(b.role) ? b.role : 'mecanico';
    try {
      const id = await db.insertReturningId(
        'INSERT INTO mechanics (workshop_id, name, phone, role, active) VALUES (?, ?, ?, ?, ?)',
        [req.workshopId, name, str(b.phone, 40) || null, role, b.active === false ? 0 : 1]);
      res.status(201).json({ id });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo dar de alta al mecánico') }); } /* 2.23 */
  });

  app.put('/api/mechanics/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const b = req.body || {};
    const name = str(b.name, 120);
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const role = MECHANIC_ROLES.includes(b.role) ? b.role : 'mecanico';
    try {
      const info = await db.run('UPDATE mechanics SET name=?, phone=?, role=?, active=? WHERE id=? AND workshop_id=?',
        [name, str(b.phone, 40) || null, role, b.active === false ? 0 : 1, id, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo actualizar al mecánico') }); } /* 2.23 */
  });

  app.delete('/api/mechanics/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    try {
      /* Las órdenes asignadas quedan con mechanic_id = NULL (FK ON DELETE SET
         NULL); la etiqueta impresa assigned_mechanic se conserva. */
      const info = await db.run('DELETE FROM mechanics WHERE id=? AND workshop_id=?', [id, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo eliminar al mecánico') }); } /* 2.23 */
  });
}

module.exports = { montarMechanics, MECHANIC_ROLES };
