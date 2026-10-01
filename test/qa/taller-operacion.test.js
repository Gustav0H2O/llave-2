'use strict';
/* ============================================================================
   QA — Operación diaria del taller: agenda de citas, mecánicos, checklist de
   entrada/salida, alertas de existencia baja, cortes de caja y expediente del
   vehículo.

   Es la suite de las funciones que antes vivían en el navegador (agenda en
   localStorage) o directamente no existían. Cada ruta nueva tiene aquí su caso
   feliz y su caso de error, y hay pruebas de aislamiento entre talleres: la
   cuenta ajena nunca ve ni toca los datos de la otra.
   ========================================================================= */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { levantarServidor, crearCliente } = require('../helpers');

describe('Operación del taller: agenda, mecánicos, inspecciones, alertas y caja', () => {
  let ctx, t, otro;
  const ids = {};

  before(async () => {
    ctx = await levantarServidor();
    t = crearCliente(ctx.base);
    otro = crearCliente(ctx.base);
    await t.registrar('Operacion');
    await otro.registrar('Ajeno');
  });
  after(() => ctx.cerrar());

  /* ---------------- Agenda de citas ---------------- */

  it('agenda una cita y aparece en el rango pedido', async () => {
    const c = await t.post('/api/clients', { name: 'Ana Gil', phone: '5550001111' });
    assert.equal(c.status, 201);
    ids.cliente = c.body.id;
    const r = await t.post('/api/appointments', {
      fecha: '2026-10-05', hora: '09:30', client_id: ids.cliente, servicio: 'Cambio de pila',
    });
    assert.equal(r.status, 201);
    ids.cita = r.body.id;
    const lista = await t.get('/api/appointments?desde=2026-10-01&hasta=2026-10-31');
    assert.equal(lista.status, 200);
    const cita = lista.body.find((x) => x.id === ids.cita);
    assert.ok(cita, 'la cita no aparece en la agenda del mes');
    assert.equal(cita.fecha, '2026-10-05');
    assert.equal(cita.status, 'pendiente');
    /* El nombre se completa solo desde el cliente: la agenda se lee de un vistazo. */
    assert.equal(cita.client_name, 'Ana Gil');
  });

  it('rechaza una fecha que no es AAAA-MM-DD', async () => {
    const r = await t.post('/api/appointments', { fecha: '05/10/2026', client_name: 'Sin Fecha' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Fecha inválida/);
  });

  it('una cita de otro taller no se puede editar ni borrar', async () => {
    assert.equal((await otro.put(`/api/appointments/${ids.cita}`, { fecha: '2026-10-06' })).status, 404);
    assert.equal((await otro.del(`/api/appointments/${ids.cita}`)).status, 404);
  });

  it('edita la cita y la borra', async () => {
    const r = await t.put(`/api/appointments/${ids.cita}`, {
      fecha: '2026-10-06', hora: '10:00', client_name: 'Ana Gil', servicio: 'Cambio de pila', status: 'confirmada',
    });
    assert.equal(r.status, 200);
    const lista = await t.get('/api/appointments?status=confirmada');
    assert.ok(lista.body.some((x) => x.id === ids.cita && x.fecha === '2026-10-06'));
    assert.equal((await t.del(`/api/appointments/${ids.cita}`)).status, 200);
    assert.equal((await t.del(`/api/appointments/${ids.cita}`)).status, 404, 'borrar dos veces la misma cita da 404');
  });

  /* ---------------- Mecánicos ---------------- */

  it('da de alta a un mecánico y le asigna una orden', async () => {
    const r = await t.post('/api/mechanics', { name: 'Carlos Méndez', phone: '5551234567' });
    assert.equal(r.status, 201);
    ids.mecanico = r.body.id;
    const ord = await t.post('/api/orders', {
      title: 'Falla de arranque', client_id: ids.cliente, mechanic_id: ids.mecanico, assigned_mechanic: 'Carlos Méndez',
    });
    assert.equal(ord.status, 201);
    ids.orden = ord.body.id;
    const lista = await t.get('/api/mechanics');
    assert.equal(lista.status, 200);
    const m = lista.body.find((x) => x.id === ids.mecanico);
    assert.ok(m, 'el mecánico no aparece en la plantilla');
    assert.ok(m.open_orders >= 1, 'la orden abierta debe contar como carga del mecánico');
  });

  it('rechaza un mecánico sin nombre', async () => {
    assert.equal((await t.post('/api/mechanics', { phone: '555' })).status, 400);
  });

  it('no deja asignar a un mecánico de otro taller', async () => {
    const ajeno = await otro.post('/api/mechanics', { name: 'Ajeno' });
    assert.equal(ajeno.status, 201);
    const r = await t.post('/api/orders', { title: 'Intruso', mechanic_id: ajeno.body.id });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Mecánico no válido/);
  });

  it('edita y borra un mecánico', async () => {
    assert.equal((await t.put(`/api/mechanics/${ids.mecanico}`, { name: 'Carlos M. Silva', role: 'ayudante' })).status, 200);
    assert.equal((await otro.put(`/api/mechanics/${ids.mecanico}`, { name: 'Robado' })).status, 404);
    assert.equal((await t.post('/api/mechanics', { name: 'Temporal' })).status, 201);
    const temp = (await t.get('/api/mechanics')).body.find((m) => m.name === 'Temporal');
    assert.equal((await t.del(`/api/mechanics/${temp.id}`)).status, 200);
    assert.equal((await t.del(`/api/mechanics/${temp.id}`)).status, 404);
  });

  /* ---------------- Checklist de entrada/salida ---------------- */

  it('crea la inspección de entrada desde la plantilla', async () => {
    const r = await t.post('/api/inspections', { order_id: ids.orden, tipo: 'entrada' });
    assert.equal(r.status, 201);
    ids.inspeccion = r.body.id;
    assert.equal(r.body.status, 'incompleta', 'una inspección recién creada no puede estar completa');
    const lista = await t.get(`/api/inspections?order_id=${ids.orden}`);
    assert.equal(lista.status, 200);
    const insp = lista.body.find((x) => x.id === ids.inspeccion);
    assert.ok(insp, 'la inspección no vuelve al listar por orden');
    assert.ok(insp.items.length >= 10, 'la plantilla debe traer los puntos de revisión');
    assert.ok(insp.items.every((p) => p.estado === 'pendiente'));
  });

  it('no acepta dos inspecciones del mismo tipo para una orden', async () => {
    const r = await t.post('/api/inspections', { order_id: ids.orden, tipo: 'entrada' });
    assert.equal(r.status, 409);
  });

  it('rechaza una inspección sin orden o con tipo inventado', async () => {
    assert.equal((await t.post('/api/inspections', { tipo: 'entrada' })).status, 400);
    assert.equal((await t.post('/api/inspections', { order_id: ids.orden, tipo: 'ojo' })).status, 400);
    assert.equal((await t.get('/api/inspections')).status, 400, 'listar sin order_id no tiene sentido');
  });

  it('la inspección de otra cuenta no se ve ni se toca', async () => {
    assert.equal((await otro.get(`/api/inspections?order_id=${ids.orden}`)).status, 404);
    assert.equal((await otro.put(`/api/inspections/${ids.inspeccion}`, { notes: 'x' })).status, 404);
  });

  it('el checklist se completa punto por punto', async () => {
    const insp = (await t.get(`/api/inspections?order_id=${ids.orden}`)).body.find((x) => x.id === ids.inspeccion);
    for (const p of insp.items) {
      assert.equal((await t.put(`/api/inspections/${ids.inspeccion}/items/${p.id}`, { estado: 'bueno' })).status, 200);
    }
    const final = (await t.get(`/api/inspections?order_id=${ids.orden}`)).body.find((x) => x.id === ids.inspeccion);
    assert.equal(final.status, 'completa');
    assert.ok(final.items.every((p) => p.estado === 'bueno'));
  });

  it('rechaza un estado de punto inventado', async () => {
    const insp = (await t.get(`/api/inspections?order_id=${ids.orden}`)).body[0];
    const r = await t.put(`/api/inspections/${ids.inspeccion}/items/${insp.items[0].id}`, { estado: 'excelente' });
    assert.equal(r.status, 400);
  });

  it('reabrir un punto devuelve la inspección a incompleta (PUT de la inspección entera)', async () => {
    const insp = (await t.get(`/api/inspections?order_id=${ids.orden}`)).body.find((x) => x.id === ids.inspeccion);
    const items = insp.items.map((p, i) => ({ seccion: p.seccion, punto: p.punto, estado: i === 0 ? 'pendiente' : p.estado }));
    const r = await t.put(`/api/inspections/${ids.inspeccion}`, { items, notes: 'Falta revisar el primer punto' });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'incompleta');
    const afterward = (await t.get(`/api/inspections?order_id=${ids.orden}`)).body.find((x) => x.id === ids.inspeccion);
    assert.equal(afterward.notes, 'Falta revisar el primer punto');
    /* Y se vuelve a completar para poder entregar. */
    for (const p of afterward.items) await t.put(`/api/inspections/${ids.inspeccion}/items/${p.id}`, { estado: 'bueno' });
    assert.equal((await t.get(`/api/inspections?order_id=${ids.orden}`)).body.find((x) => x.id === ids.inspeccion).status, 'completa');
  });

  it('no entrega la orden sin el checklist de salida completo', async () => {
    const r = await t.post(`/api/orders/${ids.orden}/status`, { status: 'Entregado' });
    assert.equal(r.status, 409, 'si entró con checklist de entrada, no se entrega sin el de salida');
    assert.match(r.body.error, /inspección de salida/i);

    const salida = await t.post('/api/inspections', { order_id: ids.orden, tipo: 'salida' });
    assert.equal(salida.status, 201);
    const pendiente = await t.post(`/api/orders/${ids.orden}/status`, { status: 'Entregado' });
    assert.equal(pendiente.status, 409, 'la inspección de salida debe estar completa, no solo existir');

    const insp = (await t.get(`/api/inspections?order_id=${ids.orden}`)).body.find((x) => x.id === salida.body.id);
    for (const p of insp.items) await t.put(`/api/inspections/${salida.body.id}/items/${p.id}`, { estado: 'bueno' });
    const ok = await t.post(`/api/orders/${ids.orden}/status`, { status: 'Entregado' });
    assert.equal(ok.status, 200);
    assert.equal((await t.get(`/api/orders/${ids.orden}`)).body.status, 'Entregado');
  });

  it('una orden entregada no admite más partidas ni ediciones', async () => {
    assert.equal((await t.post(`/api/orders/${ids.orden}/items`, { descr: 'Tarde', qty: 1, unit_price: 10 })).status, 409);
    assert.equal((await t.put(`/api/orders/${ids.orden}`, { title: 'Otra vez' })).status, 409);
  });

  /* ---------------- Partidas editables ---------------- */

  it('edita una partida y ajusta la existencia del repuesto', async () => {
    const pieza = await t.post('/api/inventory', { name: 'Pila editable', sku: 'EDIT-1', qty: 10, unit_price: 100, min_qty: 2 });
    assert.equal(pieza.status, 201);
    ids.piezaEditable = pieza.body.id;

    const orden = await t.post('/api/orders', { title: 'Orden con partida', client_id: ids.cliente });
    assert.equal(orden.status, 201);
    ids.ordenPartida = orden.body.id;
    const alta = await t.post(`/api/orders/${ids.ordenPartida}/items`, {
      descr: 'Pila editable', item_id: ids.piezaEditable, qty: 1, unit_price: 100,
    });
    assert.equal(alta.status, 201);
    ids.partida = alta.body.id;

    const r = await t.put(`/api/orders/${ids.ordenPartida}/items/${ids.partida}`, { qty: 3, unit_price: 90 });
    assert.equal(r.status, 200);
    const detalle = (await t.get(`/api/orders/${ids.ordenPartida}`)).body;
    const partida = detalle.items.find((x) => x.id === ids.partida);
    assert.equal(partida.qty, 3);
    assert.equal(partida.line_total, 270);
    assert.equal(detalle.total, 270, 'el total de la orden se recalcula con la partida editada');
    const item = (await t.get('/api/inventory')).body.find((x) => x.id === ids.piezaEditable);
    assert.equal(item.qty, 7, 'la existencia debe reflejar 3 consumidas, no 1 ni 4');
  });

  it('rechaza editar la partida de otra orden', async () => {
    assert.equal((await t.put(`/api/orders/${ids.orden}/items/${ids.partida}`, { qty: 2 })).status, 404);
    assert.equal((await otro.put(`/api/orders/${ids.ordenPartida}/items/${ids.partida}`, { qty: 2 })).status, 404);
  });

  /* ---------------- Alertas de existencia baja ---------------- */

  it('avisa una sola vez cuando la pieza llega al mínimo y se rearma al reponer', async () => {
    const r = await t.post('/api/inventory', { name: 'Filtro de gasolina', qty: 2, min_qty: 2, unit_price: 50 });
    assert.equal(r.status, 201);
    const idPieza = r.body.id;

    let alertas = (await t.get('/api/inventory/alerts')).body;
    assert.ok(alertas.some((x) => x.id === idPieza), 'la pieza en el mínimo debe aparecer en las alertas');

    const avisos = async () => (await t.get('/api/workshop/notifications')).body
      .filter((n) => n.type === 'stock' && String(n.message).includes('Filtro de gasolina')).length;
    assert.equal(await avisos(), 1, 'debe avisar una vez, no en cada consulta');

    assert.equal((await t.post(`/api/inventory/${idPieza}/moves`, { delta: -1, kind: 'salida' })).status, 200);
    assert.equal(await avisos(), 1, 'seguir por debajo del mínimo no genera avisos nuevos');

    assert.equal((await t.post(`/api/inventory/${idPieza}/moves`, { delta: 10, kind: 'entrada', note: 'Reposición' })).status, 200);
    alertas = (await t.get('/api/inventory/alerts')).body;
    assert.equal(alertas.some((x) => x.id === idPieza), false, 'al reponer sale de la lista de alertas');

    assert.equal((await t.post(`/api/inventory/${idPieza}/moves`, { delta: -10, kind: 'salida' })).status, 200);
    assert.equal(await avisos(), 2, 'el siguiente desgaste vuelve a avisar (la alerta se rearmó)');
  });

  it('el movimiento de compra queda ligado al proveedor', async () => {
    const prov = await t.post('/api/suppliers', { name: 'Repuestos del Norte' });
    assert.equal(prov.status, 201);
    const pieza = await t.post('/api/inventory', { name: 'Bomba de banco', qty: 0, unit_price: 10 });
    const r = await t.post(`/api/inventory/${pieza.body.id}/moves`, {
      delta: 4, kind: 'compra', supplier_id: prov.body.id, note: 'Compra',
    });
    assert.equal(r.status, 200);
    const mov = (await t.get('/api/inventory/moves')).body.find((m) => m.item_id === pieza.body.id && m.kind === 'compra');
    assert.equal(mov.supplier_id, prov.body.id);
    assert.equal((await t.post(`/api/inventory/${pieza.body.id}/moves`, { delta: 1, kind: 'compra', supplier_id: 999999 })).status, 400);
  });

  /* ---------------- Cortes de caja ---------------- */

  it('cierra la caja del día con sus totales por método', async () => {
    const cobro = await t.post('/api/cash', { concept: 'Cobro orden', amount: 120, type: 'ingreso', method: 'efectivo_usd' });
    assert.equal(cobro.status, 201);
    const gasto = await t.post('/api/cash', { concept: 'Compra de trapos', amount: 20, type: 'egreso', method: 'efectivo_usd' });
    assert.equal(gasto.status, 201);

    const r = await t.post('/api/cash/closings', { conteo: 100 });
    assert.equal(r.status, 201);
    assert.ok(r.body.ingresos >= 120);
    assert.ok(r.body.egresos >= 20);
    assert.equal(r.body.saldo, +(r.body.ingresos - r.body.egresos).toFixed(2));
    assert.equal(r.body.diferencia, +(100 - r.body.efectivo).toFixed(2), 'la diferencia es el conteo menos lo que hay en efectivo');
    assert.ok(r.body.por_metodo.efectivo_usd.ingresos >= 120);
    ids.cierre = r.body.id;

    const lista = await t.get('/api/cash/closings');
    assert.equal(lista.status, 200);
    assert.ok(lista.body.some((c) => c.id === ids.cierre && typeof c.por_metodo === 'object'));
    assert.equal((await otro.get('/api/cash/closings')).body.some((c) => c.id === ids.cierre), false, 'el corte es de un solo taller');
  });

  it('rechaza un corte con fecha inválida', async () => {
    const r = await t.post('/api/cash/closings', { fecha: 'ayer' });
    assert.equal(r.status, 400);
  });

  /* ---------------- Caja: editar movimiento y borrar corte ----------------
     Ambas faltaban por completo: un monto mal tecleado obligaba a borrar el
     movimiento y recrearlo (perdiendo su fecha), y un corte mal contado
     quedaba congelado para siempre en el historial. */

  it('edita un movimiento de caja en su sitio', async () => {
    const m = await t.post('/api/cash', { concept: 'Cobro mal tecleado', amount: 50, type: 'ingreso', method: 'cash' });
    assert.equal(m.status, 201);
    const r = await t.put(`/api/cash/${m.body.id}`, { concept: 'Cobro corregido', amount: 75.5, type: 'ingreso', method: 'card' });
    assert.equal(r.status, 200);
    const lista = await t.get('/api/cash');
    const fila = lista.body.find((x) => x.id === m.body.id);
    assert.equal(fila.concept, 'Cobro corregido');
    assert.equal(Number(fila.amount), 75.5);
    assert.equal(fila.method, 'card');
  });

  it('rechaza editar un movimiento con monto fuera de rango', async () => {
    const m = await t.post('/api/cash', { concept: 'Para validar', amount: 10 });
    assert.equal(m.status, 201);
    const r = await t.put(`/api/cash/${m.body.id}`, { concept: 'Monto absurdo', amount: 999999999 });
    assert.equal(r.status, 400, 'el tope de monto del POST también aplica al PUT');
  });

  it('no deja editar el movimiento de caja de otro taller', async () => {
    const m = await t.post('/api/cash', { concept: 'Mío', amount: 33 });
    assert.equal(m.status, 201);
    const r = await otro.put(`/api/cash/${m.body.id}`, { concept: 'Ajeno', amount: 44 });
    assert.equal(r.status, 404);
    const sinCambios = await t.get('/api/cash');
    assert.equal(sinCambios.body.find((x) => x.id === m.body.id).concept, 'Mío');
  });

  it('borra un corte equivocado sin tocar los movimientos del día', async () => {
    const mov = await t.post('/api/cash', { concept: 'Venta del día', amount: 200 });
    assert.equal(mov.status, 201);
    const c = await t.post('/api/cash/closings', { conteo: 200, notes: 'corte a borrar' });
    assert.equal(c.status, 201);
    const del = await t.del(`/api/cash/closings/${c.body.id}`);
    assert.equal(del.status, 200);
    const lista = await t.get('/api/cash/closings');
    assert.equal(lista.body.some((x) => x.id === c.body.id), false, 'el corte ya no está');
    const movs = await t.get('/api/cash');
    assert.ok(movs.body.some((x) => x.id === mov.body.id), 'el movimiento del día sigue intacto');
  });

  it('no deja borrar el corte de otro taller', async () => {
    const c = await t.post('/api/cash/closings', { conteo: 10 });
    assert.equal(c.status, 201);
    const r = await otro.del(`/api/cash/closings/${c.body.id}`);
    assert.equal(r.status, 404);
    const lista = await t.get('/api/cash/closings');
    assert.ok(lista.body.some((x) => x.id === c.body.id), 'el corte sigue ahí');
  });

  /* ---------------- Vehículos: edición y expediente ---------------- */

  it('edita el vehículo sin perder su historial', async () => {
    const v = await t.post(`/api/clients/${ids.cliente}/vehicles`, { brand: 'Nissan', model: 'Tsuru', year: 2015, plate: 'abc-123' });
    assert.equal(v.status, 201);
    ids.vehiculo = v.body.id;
    const r = await t.put(`/api/clients/${ids.cliente}/vehicles/${ids.vehiculo}`, {
      brand: 'Nissan', model: 'Tsuru III', year: 2016, plate: 'xyz-987', mileage: 180000,
    });
    assert.equal(r.status, 200);
    const hist = await t.get(`/api/clients/vehicles/${ids.vehiculo}/history`);
    assert.equal(hist.status, 200);
    assert.equal(hist.body.vehicle.model, 'Tsuru III');
    assert.equal(hist.body.vehicle.plate, 'XYZ-987', 'la placa se sigue normalizando en mayúsculas');
    assert.equal(hist.body.client.name, 'Ana Gil');
    assert.ok(hist.body.resumen.facturado >= 0);
  });

  it('no deja editar ni ver el vehículo de otro taller', async () => {
    assert.equal((await otro.put(`/api/clients/${ids.cliente}/vehicles/${ids.vehiculo}`, { brand: 'X' })).status, 404);
    assert.equal((await otro.get(`/api/clients/vehicles/${ids.vehiculo}/history`)).status, 404);
    assert.equal((await t.put(`/api/clients/${ids.cliente}/vehicles/999999`, { brand: 'X' })).status, 404);
  });

  it('el expediente reúne las órdenes del vehículo', async () => {
    const ord = await t.post('/api/orders', { title: 'Ruido en la dirección', client_id: ids.cliente, vehicle_id: ids.vehiculo });
    assert.equal(ord.status, 201);
    const hist = await t.get(`/api/clients/vehicles/${ids.vehiculo}/history`);
    assert.ok(hist.body.orders.some((o) => o.id === ord.body.id));
  });

  /* ---------------- Documentos: foto congelada del cliente ---------------- */

  it('el documento guarda al cliente y al vehículo del momento en que se emitió', async () => {
    const cli = await t.post('/api/clients', { name: 'Juan Original', phone: '5559998888' });
    await t.post(`/api/clients/${cli.body.id}/vehicles`, { brand: 'Chevrolet', model: 'Aveo', plate: 'orig-1' });
    const doc = await t.post('/api/documents', {
      kind: 'presupuesto', client_id: cli.body.id,
      items: [{ descr: 'Diagnóstico', qty: 1, unit_price: 300 }],
    });
    assert.equal(doc.status, 201);
    const detalle = await t.get(`/api/documents/${doc.body.id}`);
    assert.ok(detalle.body.client_snapshot, 'el documento debe guardar la foto del cliente');
    assert.match(detalle.body.client_snapshot, /Juan Original/);

    /* El cliente cambia de teléfono y de nombre; el documento ya emitido no. */
    assert.equal((await t.put(`/api/clients/${cli.body.id}`, { name: 'Juan Cambiado', phone: '5551112222' })).status, 200);
    const impresion = await t.get(`/api/documents/${doc.body.id}/print`);
    assert.equal(impresion.status, 200);
    assert.match(impresion.body, /Juan Original/);
    assert.equal(/Juan Cambiado/.test(impresion.body), false, 'el papel impreso no puede cambiar después');
  });

  /* ---------------- Respaldo: las tablas nuevas viajan ---------------- */

  it('el respaldo incluye agenda, mecánicos, inspecciones y cierres', async () => {
    const r = await t.get('/api/backup');
    assert.equal(r.status, 200);
    for (const clave of ['mechanics', 'appointments', 'inspections', 'inspectionItems', 'cashClosings']) {
      assert.ok(Array.isArray(r.body.data[clave]), `el respaldo debe traer "${clave}"`);
    }
    const vuelta = await t.post('/api/backup/import', { data: r.body.data });
    assert.equal(vuelta.status, 200, 'un respaldo exportado por la app debe volver a entrar sin cambios');
  });
});
