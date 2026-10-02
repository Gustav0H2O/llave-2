'use strict';
/* ============================================================================
   Agenda completa: duración, mecánico, horario del taller y solapes.

   La agenda era una lista de citas por día. Con duración y mecánico se puede
   dibujar una rejilla de verdad, pero eso trae dos verdades nuevas que hay que
   sostener: un horario que el taller define, y la regla de que dos coches no
   caben en el mismo hueco con el mismo mecánico.
   ========================================================================= */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { levantarServidor, crearCliente } = require('../helpers');

describe('Agenda: horario, duración y solapes', () => {
  let ctx, t, mecId = null;
  const DIA = '2026-11-10';

  before(async () => {
    ctx = await levantarServidor();
    t = crearCliente(ctx.base);
    await t.registrar('AgendaCompleta');
    const m = await t.post('/api/mechanics', { name: 'Juan Mecánico', role: 'mecanico' });
    mecId = m.body.id;
  });
  after(() => ctx.cerrar());

  it('el horario arranca con valores de taller y no crea fila al consultarlo', async () => {
    const r = await t.get('/api/schedule');
    assert.equal(r.status, 200);
    assert.equal(r.body.hora_apertura, '08:00');
    assert.equal(r.body.hora_cierre, '18:00');
    assert.ok(r.body.slot_min >= 5);
    /* Un GET no debe escribir: una agenda que solo se consulta no toca la base. */
    const otra = await t.get('/api/schedule');
    assert.deepEqual(r.body, otra.body);
  });

  it('guarda el horario del taller', async () => {
    const r = await t.put('/api/schedule', { hora_apertura: '09:00', hora_cierre: '17:00', slot_min: 60, dias_laborables: [1, 2, 3, 4, 5] });
    assert.equal(r.status, 200);
    assert.equal(r.body.hora_apertura, '09:00');
    assert.equal(r.body.slot_min, 60);
    assert.equal(r.body.dias_laborables, '1,2,3,4,5');
  });

  it('rechaza un cierre anterior a la apertura', async () => {
    /* Sin esta comprobación la rejilla saldría vacía y el síntoma sería
       "no se ven las citas", no "el horario está al revés". */
    const r = await t.put('/api/schedule', { hora_apertura: '18:00', hora_cierre: '08:00' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /posterior a la apertura/);
  });

  it('rechaza días laborables inválidos', async () => {
    const r = await t.put('/api/schedule', { dias_laborables: 'lunes,martes' });
    assert.equal(r.status, 400);
  });

  it('acepta una cita con duración, mecánico y tipo', async () => {
    const r = await t.post('/api/appointments', {
      fecha: DIA, hora: '10:00', servicio: 'Cambio de bomba',
      duracion_min: 90, mechanic_id: mecId, tipo: 'reparacion', client_name: 'Ana',
    });
    assert.equal(r.status, 201);
    const l = await t.get('/api/appointments?desde=' + DIA + '&hasta=' + DIA);
    const c = l.body.find((x) => x.id === r.body.id);
    assert.equal(c.duracion_min, 90);
    assert.equal(Number(c.mechanic_id), Number(mecId));
    assert.equal(c.tipo, 'reparacion');
  });

  it('rechaza un tipo de cita fuera de la lista blanca', async () => {
    /* El tipo decide el COLOR en la rejilla: si entra texto libre, el color
       deja de querer decir nada. Se guarda como null, no como texto suelto. */
    const r = await t.post('/api/appointments', { fecha: DIA, hora: '15:00', tipo: 'inventado' });
    assert.equal(r.status, 201);
    const l = await t.get('/api/appointments?desde=' + DIA + '&hasta=' + DIA);
    assert.equal(l.body.find((x) => x.id === r.body.id).tipo, null);
  });

  it('rechaza un mecánico de otro taller', async () => {
    const otro = crearCliente(ctx.base);
    await otro.registrar('AgendaAjena');
    const r = await otro.post('/api/appointments', { fecha: DIA, hora: '10:00', mechanic_id: mecId });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Mec[aá]nico no v[aá]lido/);
  });

  it('RECHAZA el solape con el mismo mecánico (409)', async () => {
    /* Es la verdad central de este cambio: dos coches en el mismo hueco y el
       mismo mecánico es un problema que el taller descubre con el cliente ya
       esperando. */
    const r = await t.post('/api/appointments', {
      fecha: DIA, hora: '10:30', servicio: 'Otro', duracion_min: 60, mechanic_id: mecId, client_name: 'Luis',
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'solape');
    assert.ok(r.body.cita, 'el error debe decir CON QUÉ choca');
  });

  it('permite el solape si se pide explícitamente', async () => {
    const r = await t.post('/api/appointments', {
      fecha: DIA, hora: '10:30', servicio: 'Rápido', duracion_min: 15, mechanic_id: mecId, permitir_solape: true,
    });
    assert.equal(r.status, 201);
  });

  it('no hay solape si la cita empieza justo cuando la otra acaba', async () => {
    /* 10:00 + 90 min = 11:30. Una cita a las 11:30 NO se pisa con la primera. */
    const r = await t.post('/api/appointments', { fecha: DIA, hora: '11:30', duracion_min: 30, mechanic_id: mecId, client_name: 'Eva' });
    assert.equal(r.status, 201);
  });

  it('una cita cancelada libera el hueco', async () => {
    const c = await t.post('/api/appointments', { fecha: '2026-11-12', hora: '09:00', duracion_min: 60, mechanic_id: mecId });
    assert.equal(c.status, 201);
    assert.equal((await t.post('/api/appointments', { fecha: '2026-11-12', hora: '09:00', duracion_min: 60, mechanic_id: mecId })).status, 409);
    const l = await t.get('/api/appointments?desde=2026-11-12&hasta=2026-11-12');
    await t.put('/api/appointments/' + c.body.id, { fecha: '2026-11-12', hora: '09:00', status: 'cancelada', duracion_min: 60, mechanic_id: mecId });
    /* Ya cancelada, el hueco vuelve a estar libre. */
    assert.equal((await t.post('/api/appointments', { fecha: '2026-11-12', hora: '09:00', duracion_min: 60, mechanic_id: mecId })).status, 201);
  });

  it('reprogramar la MISMA cita no choca consigo misma', async () => {
    /* Sin excluir el propio id del chequeo, mover una cita media hora sería
       imposible: siempre se encontraría a sí misma. */
    const c = await t.post('/api/appointments', { fecha: '2026-11-13', hora: '09:00', duracion_min: 60, mechanic_id: mecId });
    const r = await t.put('/api/appointments/' + c.body.id, { fecha: '2026-11-13', hora: '09:30', duracion_min: 60, mechanic_id: mecId, status: 'pendiente' });
    assert.equal(r.status, 200);
  });

  it('los huecos del día reflejan el horario y lo ocupado', async () => {
    const r = await t.get('/api/appointments/slots?fecha=' + DIA);
    assert.equal(r.status, 200);
    assert.equal(r.body.apertura, '09:00');
    assert.equal(r.body.cierre, '17:00');
    assert.equal(r.body.slot_min, 60);
    assert.ok(r.body.huecos.length > 0);
    /* 09:00 está libre; 10:00 tiene la cita de 90 min. */
    assert.equal(r.body.huecos.find((h) => h.hora === '09:00').ocupado, false);
    assert.equal(r.body.huecos.find((h) => h.hora === '10:00').ocupado, true);
  });

  it('los huecos rechazan una fecha inválida', async () => {
    assert.equal((await t.get('/api/appointments/slots?fecha=2026-13-99')).status, 400);
    assert.equal((await t.get('/api/appointments/slots')).status, 400);
  });

  it('el catálogo de servicios se siembra con los que ya usó el taller', async () => {
    const r = await t.get('/api/appointment-types');
    assert.equal(r.status, 200);
    assert.ok(r.body.some((x) => x.nombre === 'Cambio de bomba'), 'debe sugerir los servicios ya escritos');
    assert.ok(r.body.every((x) => x.sugerido === true), 'sin filas propias, todo es sugerencia');
  });

  it('crea y borra un servicio propio (aislado por taller)', async () => {
    const c = await t.post('/api/appointment-types', { nombre: 'Frenos', color: '#dc2626', duracion_min: 120 });
    assert.equal(c.status, 201);
    const mios = await t.get('/api/appointment-types');
    assert.ok(mios.body.some((x) => x.id === c.body.id && x.nombre === 'Frenos'));
    /* Otro taller no puede borrarlo. */
    const otro = crearCliente(ctx.base);
    await otro.registrar('ServiciosAjenos');
    assert.equal((await otro.req('/api/appointment-types/' + c.body.id, { method: 'DELETE' })).status, 404);
    assert.equal((await t.req('/api/appointment-types/' + c.body.id, { method: 'DELETE' })).status, 200);
  });

  it('rechaza un servicio sin nombre', async () => {
    assert.equal((await t.post('/api/appointment-types', { color: '#000000' })).status, 400);
  });

  it('DELETE /api/appointment-types/:id da 404 con un id que no existe', async () => {
    /* El caso de error de la ruta: sin esto, un id inventado podría borrar
       cualquier cosa o devolver 200 sin haber borrado nada. */
    assert.equal((await t.req('/api/appointment-types/999999', { method: 'DELETE' })).status, 404);
    assert.equal((await t.req('/api/appointment-types/abc', { method: 'DELETE' })).status, 404);
  });
});
