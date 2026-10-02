'use strict';
/* ============================================================================
   src/routes/appointments.js — Agenda de citas del taller.

   La agenda vivía en localStorage (`ft_appointments`): cada navegador tenía la
   suya, no había historial ni seguimiento y el celular del dueño no veía lo
   que agendó el de recepción. Ahora es una tabla por taller, con el mismo
   aislamiento que el resto de los datos del negocio.

   POR QUÉ AQUÍ Y NO EN lib/
   Habla con la base y con express: es servidor, no regla del taller (DECISIONES.md
   §3). lib/ sigue siendo puro.

   CÓMO SE MONTA
   server-pg.js llama montarAppointments(app, { ... }) junto a los demás
   dominios de datos, ANTES de montarMisc (el 404 de /api va al final).
   ========================================================================= */
const APPT_STATUS = ['pendiente', 'confirmada', 'atendida', 'cancelada'];
/* Tipos de cita. Es una lista blanca y no texto libre porque el tipo decide el
   COLOR de la cita en la rejilla: si cada taller escribe 'servicio', 'Servicio'
   y 'serviço', el color deja de querer decir nada. */
const APPT_TIPOS = ['servicio', 'reparacion', 'entrega', 'diagnostico', 'otro'];
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
/* El regex solo comprueba la FORMA: "2026-13-99" lo pasa y luego la rejilla
   dibuja un mes que no existe. fechaReal comprueba además que ese día exista
   de verdad (incluido el 29 de febrero de un bisiesto). */
const fechaReal = (s) => {
  if (!FECHA_RE.test(String(s || ''))) return false;
  const [y, m, d] = String(s).split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
const HORA_RE = /^\d{2}:\d{2}$/;
const TOPE_DURACION = 8 * 60; /* una cita no puede durar mas de una jornada */

/* Paleta de la rejilla. Colores separados a proposito: dos servicios distintos
   tienen que distinguirse de un vistazo, no ser bonitos juntos. */
const COLORES_TIPO = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

/* 'HH:MM' a minutos desde medianoche. Devuelve null si no es una hora valida:
   pasar basura a los calculos de solape daria NaN y dos citas se considerarian
   compatibles sin serlo. */
const aMinutos = (hhmm) => {
  if (!HORA_RE.test(String(hhmm || ''))) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
};
const deMinutos = (min) => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');

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

  /* Horario del taller. Si no existe la fila se devuelven los valores por
     defecto SIN escribirla: crear la fila en un GET convertiría una lectura en
     una escritura, y una agenda que solo se consulta no debe tocar la base. */
  const HORARIO_DEF = { hora_apertura: '08:00', hora_cierre: '18:00', slot_min: 30, dias_laborables: '1,2,3,4,5,6' };
  const leerHorario = async (ws) => {
    const h = await db.get('SELECT * FROM workshop_schedule WHERE workshop_id=?', [ws]);
    if (!h) return { ...HORARIO_DEF };
    return {
      hora_apertura: HORA_RE.test(h.hora_apertura) ? h.hora_apertura : HORARIO_DEF.hora_apertura,
      hora_cierre: HORA_RE.test(h.hora_cierre) ? h.hora_cierre : HORARIO_DEF.hora_cierre,
      slot_min: Number(h.slot_min) > 0 ? Number(h.slot_min) : HORARIO_DEF.slot_min,
      dias_laborables: h.dias_laborables || HORARIO_DEF.dias_laborables,
    };
  };

  /* ¿Se pisa con otra cita del mismo taller? Dos citas se solapan si una empieza
     antes de que la otra acabe, en la misma fecha. El mecánico es opcional: si
     la cita no tiene mecánico se comprueba contra TODAS (el taller no puede
     atender dos carros a la vez en el mismo hueco), y si lo tiene, contra las
     suyas. Se ignora lo cancelado: cancelar libera el hueco.
     `excepto` es el id que se está editando, para no chocar consigo misma. */
  const buscarSolape = async (ws, fecha, hora, duracion, mechanicId, excepto) => {
    const ini = aMinutos(hora);
    if (ini === null) return null;
    const fin = ini + (duracion || 30);
    const filas = await db.all(
      `SELECT id, hora, duracion_min, mechanic_id FROM appointments
        WHERE workshop_id=? AND fecha=? AND status <> 'cancelada' AND hora IS NOT NULL`,
      [ws, fecha]);
    for (const c of filas) {
      if (excepto && Number(c.id) === Number(excepto)) continue;
      /* Un mecánico solo choca con SUS citas. Sin mecánico asignado, se
         considera que ocupa el taller entero. */
      if (mechanicId && c.mechanic_id && Number(c.mechanic_id) !== Number(mechanicId)) continue;
      if (!mechanicId && c.mechanic_id) continue;
      const cIni = aMinutos(c.hora);
      if (cIni === null) continue;
      const cFin = cIni + (Number(c.duracion_min) || 30);
      if (ini < cFin && cIni < fin) return { id: c.id, hora: c.hora, duracion_min: Number(c.duracion_min) || 30 };
    }
    return null;
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

  /* Campos comunes de una cita. Se separan del POST/PUT para que las dos rutas
     validen EXACTAMENTE lo mismo: cuando estaban duplicados, el PUT aceptaba
     cosas que el POST rechazaba. */
  const camposCita = async (b, ws) => {
    const fecha = str(b.fecha, 10);
    if (!fechaReal(fecha)) return { error: 'Fecha inválida (use AAAA-MM-DD)' };
    const hora = str(b.hora, 5);
    if (hora && !HORA_RE.test(hora)) return { error: 'Hora inválida (use HH:MM)' };
    const status = APPT_STATUS.includes(b.status) ? b.status : 'pendiente';
    const tipo = APPT_TIPOS.includes(b.tipo) ? b.tipo : null;
    let duracion = toInt(b.duracion_min, 5, TOPE_DURACION);
    if (duracion === null) duracion = 30; /* media hora: lo que dura un servicio tipico */
    const mechanic_id = toInt(b.mechanic_id, 1, 1e9);
    if (mechanic_id) {
      const m = await db.get('SELECT id FROM mechanics WHERE id=? AND workshop_id=?', [mechanic_id, ws]);
      if (!m) return { error: 'Mecánico no válido' };
    }
    const ctx = await contexto(b, ws);
    if (ctx.error) return { error: ctx.error };
    return { fecha, hora: hora || null, status, tipo, duracion, mechanic_id, ctx };
  };

  app.post('/api/appointments', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const v = await camposCita(b, req.workshopId);
    if (v.error) return res.status(400).json({ error: v.error });
    /* El solape se RECHAZA, no se avisa: dos coches en el mismo hueco con el
       mismo mecanico es un problema que el taller descubre cuando el cliente
       ya esta esperando. 'permitir_solape' existe para el caso legitimo de
       meter dos trabajos cortos a proposito. */
    if (v.hora && b.permitir_solape !== true) {
      const choca = await buscarSolape(req.workshopId, v.fecha, v.hora, v.duracion, v.mechanic_id, null);
      if (choca) {
        return res.status(409).json({
          code: 'solape',
          error: 'Ese hueco ya está ocupado por una cita de las ' + choca.hora + ' (' + choca.duracion_min + ' min).',
          cita: choca,
        });
      }
    }
    try {
      const id = await db.insertReturningId(`INSERT INTO appointments (workshop_id, client_id, vehicle_id, fecha, hora, client_name, vehicle_ref, servicio, status, notes, duracion_min, mechanic_id, tipo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.workshopId, v.ctx.client_id, v.ctx.vehicle_id, v.fecha, v.hora, v.ctx.client_name, v.ctx.vehicle_ref,
          str(b.servicio, 200) || null, v.status, str(b.notes, 1000) || null, v.duracion, v.mechanic_id, v.tipo]);
      res.status(201).json({ id });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo agendar la cita') }); }
  });

  app.put('/api/appointments/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const b = req.body || {};
    const v = await camposCita(b, req.workshopId);
    if (v.error) return res.status(400).json({ error: v.error });
    /* Se excluye la propia cita del chequeo de solape: si no, reprogramar una
       cita media hora mas tarde chocaria consigo misma y seria imposible. */
    if (v.hora && b.permitir_solape !== true) {
      const choca = await buscarSolape(req.workshopId, v.fecha, v.hora, v.duracion, v.mechanic_id, id);
      if (choca) {
        return res.status(409).json({
          code: 'solape',
          error: 'Ese hueco ya está ocupado por una cita de las ' + choca.hora + ' (' + choca.duracion_min + ' min).',
          cita: choca,
        });
      }
    }
    try {
      const info = await db.run(`UPDATE appointments SET client_id=?, vehicle_id=?, fecha=?, hora=?, client_name=?, vehicle_ref=?, servicio=?, status=?, notes=?, duracion_min=?, mechanic_id=?, tipo=?
        WHERE id=? AND workshop_id=?`,
        [v.ctx.client_id, v.ctx.vehicle_id, v.fecha, v.hora, v.ctx.client_name, v.ctx.vehicle_ref,
          str(b.servicio, 200) || null, v.status, str(b.notes, 1000) || null, v.duracion, v.mechanic_id, v.tipo,
          id, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo actualizar la cita') }); }
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

  /* ---------- horario del taller ---------- */
  app.get('/api/schedule', requireWorkshop, async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await leerHorario(req.workshopId));
  });

  app.put('/api/schedule', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const apertura = str(b.hora_apertura, 5) || HORARIO_DEF.hora_apertura;
    const cierre = str(b.hora_cierre, 5) || HORARIO_DEF.hora_cierre;
    if (!HORA_RE.test(apertura)) return res.status(400).json({ error: 'Hora de apertura inválida (use HH:MM)' });
    if (!HORA_RE.test(cierre)) return res.status(400).json({ error: 'Hora de cierre inválida (use HH:MM)' });
    /* Un taller que cierra antes de abrir dejaria la rejilla vacia y el sintoma
       seria 'no se ven las citas', no 'el horario esta al reves'. */
    if (aMinutos(cierre) <= aMinutos(apertura)) return res.status(400).json({ error: 'El cierre tiene que ser posterior a la apertura' });
    const slot = toInt(b.slot_min, 5, 240) || HORARIO_DEF.slot_min;
    const dias = Array.isArray(b.dias_laborables) ? b.dias_laborables.join(',') : str(b.dias_laborables, 20) || HORARIO_DEF.dias_laborables;
    if (!/^[1-7](,[1-7])*$/.test(dias)) return res.status(400).json({ error: 'Días laborables inválidos' });
    try {
      const ya = await db.get('SELECT workshop_id FROM workshop_schedule WHERE workshop_id=?', [req.workshopId]);
      if (ya) {
        await db.run('UPDATE workshop_schedule SET hora_apertura=?, hora_cierre=?, slot_min=?, dias_laborables=?, updated_at=CURRENT_TIMESTAMP WHERE workshop_id=?',
          [apertura, cierre, slot, dias, req.workshopId]);
      } else {
        await db.run('INSERT INTO workshop_schedule (workshop_id, hora_apertura, hora_cierre, slot_min, dias_laborables) VALUES (?, ?, ?, ?, ?)',
          [req.workshopId, apertura, cierre, slot, dias]);
      }
      res.json(await leerHorario(req.workshopId));
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo guardar el horario') }); }
  });

  /* ---------- disponibilidad de un dia ----------
     Devuelve los huecos entre apertura y cierre con lo que ya esta ocupado en
     cada uno. Es lo que dibuja la rejilla de la vista de dia/semana: el
     frontend no tiene que recalcular el horario ni los solapes. */
  app.get('/api/appointments/slots', requireWorkshop, async (req, res) => {
    const fecha = str(req.query.fecha, 10);
    if (!fechaReal(fecha)) return res.status(400).json({ error: 'Fecha inválida (use AAAA-MM-DD)' });
    const h = await leerHorario(req.workshopId);
    const ini = aMinutos(h.hora_apertura), fin = aMinutos(h.hora_cierre);
    const paso = h.slot_min;
    const citas = await db.all(
      "SELECT a.id, a.hora, a.duracion_min, a.status, a.servicio, a.tipo, a.client_name, a.vehicle_ref, a.mechanic_id, m.name AS mechanic_name " +
      "FROM appointments a LEFT JOIN mechanics m ON m.id = a.mechanic_id " +
      "WHERE a.workshop_id=? AND a.fecha=? AND a.status <> 'cancelada' ORDER BY a.hora",
      [req.workshopId, fecha]);
    const huecos = [];
    for (let t = ini; t + paso <= fin; t += paso) {
      const ocupadas = citas.filter((c) => {
        const ci = aMinutos(c.hora);
        if (ci === null) return false;
        return t < ci + (Number(c.duracion_min) || 30) && ci < t + paso;
      });
      huecos.push({ hora: deMinutos(t), ocupado: ocupadas.length > 0, citas: ocupadas.map((c) => c.id) });
    }
    res.set('Cache-Control', 'no-store').json({
      fecha, horario: h, apertura: h.hora_apertura, cierre: h.hora_cierre, slot_min: paso,
      huecos, citas, libres: huecos.filter((x) => !x.ocupado).length,
    });
  });

  /* ---------- catalogo de servicios con color ----------
     Nace VACIO y se siembra con los servicios que el taller ya escribio en sus
     citas: inventarle un catalogo que no pidio seria adivinar su negocio. */
  app.get('/api/appointment-types', requireWorkshop, async (req, res) => {
    const propios = await db.all('SELECT * FROM appointment_types WHERE workshop_id=? ORDER BY nombre', [req.workshopId]);
    if (propios.length) return res.set('Cache-Control', 'no-store').json(propios);
    const usados = await db.all(
      "SELECT DISTINCT servicio FROM appointments WHERE workshop_id=? AND servicio IS NOT NULL AND TRIM(servicio) <> '' ORDER BY servicio LIMIT 20",
      [req.workshopId]);
    res.set('Cache-Control', 'no-store').json(usados.map((u, i) => ({
      id: null, nombre: u.servicio, color: COLORES_TIPO[i % COLORES_TIPO.length], duracion_min: null, sugerido: true,
    })));
  });

  app.post('/api/appointment-types', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const nombre = str(b.nombre, 80);
    if (!nombre) return res.status(400).json({ error: 'Nombre del servicio requerido' });
    const color = /^#[0-9a-fA-F]{6}$/.test(String(b.color || '')) ? b.color : null;
    const dur = toInt(b.duracion_min, 5, TOPE_DURACION);
    try {
      const id = await db.insertReturningId('INSERT INTO appointment_types (workshop_id, nombre, color, duracion_min) VALUES (?, ?, ?, ?)',
        [req.workshopId, nombre, color, dur]);
      res.status(201).json({ id });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo guardar el servicio') }); }
  });

  app.delete('/api/appointment-types/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req);
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    try {
      const info = await db.run('DELETE FROM appointment_types WHERE id=? AND workshop_id=?', [id, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo eliminar el servicio') }); }
  });
}

module.exports = { montarAppointments, APPT_STATUS, APPT_TIPOS };
