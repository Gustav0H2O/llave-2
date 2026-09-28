'use strict';
/* ============================================================================
   src/routes/appointments.js — Agenda de citas del taller.

   La agenda vivía en localStorage (`ft_appointments`): cada navegador tenía la
   suya, no había historial ni seguimiento y el celular del dueño no veía lo
   que agendó el de recepción. Ahora es una tabla por taller, con el mismo
   aislamiento que el resto de los datos del negocio.

   POR QUÉ AQUÍ Y NO EN lib/
   Habla con la base y con express: es servidor, no regla del taller (AGENTS.md
   §3). lib/ sigue siendo puro.

   CÓMO SE MONTA
   server-pg.js llama montarAppointments(app, { ... }) junto a los demás
   dominios de datos, ANTES de montarMisc (el 404 de /api va al final).
   ========================================================================= */
const APPT_STATUS = ['pendiente', 'confirmada', 'atendida', 'cancelada'];
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^\d{2}:\d{2}$/;

function montarAppointments(app, deps) {
  const { db, requireWorkshop, idDe, str, toInt, errorAccionable } = deps;

  /* Trae nombre del cliente y referencia del vehículo cuando el cuerpo no los
     trae: la agenda se lee en un vistazo y un id no dice nada en la lista. */
  const contexto = async (b, ws) => {
    const client_id = toInt(b.client_id, 1, 1e9);
    const vehicle_id = toInt(b.vehicle_id, 1, 1e9);
    let client_name = str(b.client_name, 120) || null;
    let vehicle_ref = str(b.vehicle_ref, 120) || null;
    if (client_id) {
      if (!(await db.get('SELECT id FROM clients WHERE id=? AND workshop_id=?', [client_id, ws]))) {
        return { error: 'Cliente no válido' };
      }
      if (!client_name) {
        const c = await db.get('SELECT name FROM clients WHERE id=? AND workshop_id=?', [client_id, ws]);
        client_name = c?.name || null;
      }
    }
    if (vehicle_id) {
      const v = await db.get('SELECT brand, model, plate FROM client_vehicles WHERE id=? AND workshop_id=?', [vehicle_id, ws]);
      if (!v) return { error: 'Vehículo no válido' };
      if (!vehicle_ref) vehicle_ref = [v.brand, v.model].filter(Boolean).join(' ') + (v.plate ? ` · ${v.plate}` : '');
    }
    return { client_id, vehicle_id, client_name, vehicle_ref };
  };

  app.get('/api/appointments', requireWorkshop, async (req, res) => {
    const where = ['a.workshop_id = ?'];
    const args = [req.workshopId];
    if (req.query.desde && FECHA_RE.test(String(req.query.desde))) { where.push('a.fecha >= ?'); args.push(req.query.desde); }
    if (req.query.hasta && FECHA_RE.test(String(req.query.hasta))) { where.push('a.fecha <= ?'); args.push(req.query.hasta); }
    if (APPT_STATUS.includes(req.query.status)) { where.push('a.status = ?'); args.push(req.query.status); }
    if (req.query.client_id) {
      const cid = toInt(req.query.client_id, 1, 1e9);
      if (cid) { where.push('a.client_id = ?'); args.push(cid); }
    }
    const rows = await db.all(`SELECT a.*, c.name AS client_name_live
      FROM appointments a LEFT JOIN clients c ON c.id = a.client_id
      WHERE ${where.join(' AND ')} ORDER BY a.fecha, a.hora, a.id LIMIT 500`, args);
    res.set('Cache-Control', 'no-store').json(rows.map(r => ({ ...r, client_name: r.client_name || r.client_name_live })));
  });

  app.post('/api/appointments', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const fecha = str(b.fecha, 10);
    if (!FECHA_RE.test(fecha)) return res.status(400).json({ error: 'Fecha inválida (use AAAA-MM-DD)' });
    const hora = str(b.hora, 5);
    if (hora && !HORA_RE.test(hora)) return res.status(400).json({ error: 'Hora inválida (use HH:MM)' });
    const status = APPT_STATUS.includes(b.status) ? b.status : 'pendiente';
    const ctx = await contexto(b, req.workshopId);
    if (ctx.error) return res.status(400).json({ error: ctx.error });
    try {
      const id = await db.insertReturningId(`INSERT INTO appointments (workshop_id, client_id, vehicle_id, fecha, hora, client_name, vehicle_ref, servicio, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.workshopId, ctx.client_id, ctx.vehicle_id, fecha, hora || null, ctx.client_name, ctx.vehicle_ref,
          str(b.servicio, 200) || null, status, str(b.notes, 1000) || null]);
      res.status(201).json({ id });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo agendar la cita') }); } /* 2.23 */
  });

  app.put('/api/appointments/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const b = req.body || {};
    const fecha = str(b.fecha, 10);
    if (!FECHA_RE.test(fecha)) return res.status(400).json({ error: 'Fecha inválida (use AAAA-MM-DD)' });
    const hora = str(b.hora, 5);
    if (hora && !HORA_RE.test(hora)) return res.status(400).json({ error: 'Hora inválida (use HH:MM)' });
    const status = APPT_STATUS.includes(b.status) ? b.status : 'pendiente';
    const ctx = await contexto(b, req.workshopId);
    if (ctx.error) return res.status(400).json({ error: ctx.error });
    try {
      const info = await db.run(`UPDATE appointments SET client_id=?, vehicle_id=?, fecha=?, hora=?, client_name=?, vehicle_ref=?, servicio=?, status=?, notes=?
        WHERE id=? AND workshop_id=?`,
        [ctx.client_id, ctx.vehicle_id, fecha, hora || null, ctx.client_name, ctx.vehicle_ref,
          str(b.servicio, 200) || null, status, str(b.notes, 1000) || null, id, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo actualizar la cita') }); } /* 2.23 */
  });

  app.delete('/api/appointments/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    try {
      const info = await db.run('DELETE FROM appointments WHERE id=? AND workshop_id=?', [id, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo eliminar la cita') }); } /* 2.23 */
  });
}

module.exports = { montarAppointments, APPT_STATUS };
