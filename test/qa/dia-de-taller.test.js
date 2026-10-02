'use strict';
/* ============================================================================
   Recorrido de un día de taller, de punta a punta.

   No es una suite de endpoints: es la historia de un taller que abre, recibe
   un carro, cotiza, cobra y cierra el día, contra la app real sobre bases en
   memoria. Sirve para lo que los tests por endpoint no ven —que las piezas
   encajen entre sí en el mismo taller y que ninguna se rompa al usarla en
   combinación: el mismo cliente, el mismo carro y el mismo mecánico de
   principio a fin.

   Lo que toca el navegador (navegación, pestañas, "Volver") se cubre aparte;
   aquí importa que los DATOS que ve el taller sean los que se guardaron y los
   que se imprimen.
   ========================================================================= */
const test = require('node:test');
const assert = require('node:assert/strict');
const { levantarServidor, crearCliente } = require('../helpers');

test('día completo de taller: alta → recepción → orden → presupuesto → cobro → corte', async (t) => {
  const srv = await levantarServidor();
  t.after(() => srv.cerrar());
  const t1 = crearCliente(srv.base);

  // ── 1. El taller abre su cuenta ──────────────────────────────────────────
  const alta = await t1.registrar('dia');
  assert.equal(alta.status, 201, 'el taller debe poder registrarse');

  // ── 2. Llega el cliente con su carro ─────────────────────────────────────
  const cliente = await t1.post('/api/clients', {
    name: 'María Fernández', phone: '04121112233', doc_id: 'V-12345678',
  });
  assert.equal(cliente.status, 201);
  const clienteId = cliente.body.id;

  const carro = await t1.post(`/api/clients/${clienteId}/vehicles`, {
    brand: 'Chevrolet', model: 'Aveo', year: 2015, plate: 'AB123CD', mileage: 84200,
  });
  assert.equal(carro.status, 201, 'el carro se registra con su odómetro');

  // ── 3. Recepción: se abre la orden con el estado en que llega ────────────
  const orden = await t1.post('/api/orders', {
    title: 'Módulo de gasolina — falla en frío',
    client_id: clienteId, vehicle_id: carro.body.id, service_type: 'correctivo',
    descr: 'Cliente reporta que falla al arrancar en frío.',
  });
  assert.equal(orden.status, 201, 'la orden de trabajo debe abrir');
  const ordenId = orden.body.id;

  // ── 4. Trabajo: mano de obra y repuesto ──────────────────────────────────
  const resp = await t1.post('/api/inventory', {
    name: 'Pila Bosch 69100', qty: 2, min_qty: 1, cost: 45, item_tipo: 'repuesto',
  });
  assert.equal(resp.status, 201, 'el repuesto debe entrar al almacén');
  const piezaId = resp.body.id;

  await t1.post(`/api/orders/${ordenId}/items`, {
    descr: 'Cambio de pila de inyectores', qty: 1, unit_price: 45, item_type: 'labor',
  });
  await t1.post(`/api/orders/${ordenId}/items`, {
    descr: 'Pila Bosch 69100', qty: 1, unit_price: 80, item_id: piezaId, item_type: 'part',
  });

  const conTrabajo = (await t1.get(`/api/orders/${ordenId}`)).body;
  assert.equal(Number(conTrabajo.total), 125, 'mano de obra + repuesto = 125');

  const almacen = (await t1.get('/api/inventory')).body;
  const pila = almacen.find((i) => String(i.name).includes('Bosch 69100'));
  assert.equal(Number(pila.qty), 1, 'el repuesto sale del almacén al usarlo en la orden');

  // ── 5. Cotiza con descuento e IVA ────────────────────────────────────────
  const partidas = [
    { descr: 'Cambio de pila de inyectores', qty: 1, unit_price: 45 },
    { descr: 'Pila Bosch 69100', qty: 1, unit_price: 80 },
  ];
  const presupuesto = await t1.post('/api/documents', {
    kind: 'presupuesto', client_id: clienteId, order_id: ordenId,
    items: partidas, descuento_pct: 10, iva_pct: 16,
  });
  assert.equal(presupuesto.status, 201);
  assert.equal(presupuesto.body.subtotal, 125);
  assert.equal(presupuesto.body.descuento, 12.5, '10 % de 125');
  assert.equal(presupuesto.body.iva, 18, '16 % de 112,50');
  assert.equal(presupuesto.body.total, 130.5);

  // Lo que se guarda y lo que se imprime tienen que ser el mismo papel.
  const guardado = (await t1.get(`/api/documents/${presupuesto.body.id}`)).body;
  const sumaLineas = +(guardado.items.reduce((s, it) => s + Number(it.line_total), 0)).toFixed(2);
  assert.equal(Number(guardado.subtotal), sumaLineas, 'el subtotal es la suma de lo impreso');
  const impreso = await t1.get(`/api/documents/${presupuesto.body.id}/print`);
  assert.equal(impreso.status, 200, 'el documento debe poder imprimirse');

  // ── 6. El cliente aprueba y se convierte en orden real ──────────────────
  const convertido = await t1.post(`/api/documents/${presupuesto.body.id}/convert-to-order`, {});
  assert.equal(convertido.status, 201, 'el presupuesto se convierte en orden');

  // ── 7. Entrega y cobro: lo que se cobra es lo que se cotizó ──────────────
  /* La nota de entrega va colgada de la orden NUEVA que salió de la conversión:
     la que estaba en presupuesto ya se consumió al convertirla. */
  const ordenTaller = convertido.body.order_id || convertido.body.orden_id;
  assert.ok(ordenTaller, 'la conversión devuelve la orden de trabajo nueva');
  const nota = await t1.post('/api/documents', {
    kind: 'entrega', client_id: clienteId, order_id: ordenTaller,
    items: [...partidas.map((p) => ({ ...p, item_id: p.descr.includes('Pila') ? piezaId : null }))],
    descuento_pct: 10, iva_pct: 16,
  });
  assert.equal(nota.status, 201);
  assert.equal(nota.body.total, 130.5, 'lo que se cobra es lo que se cotizó');

  const caja = await t1.post('/api/cash', {
    amount: nota.body.total, type: 'ingreso', concept: 'Pago de la nota de entrega',
  });
  assert.equal(caja.status, 201, 'el cobro se registra en la caja');

  // ── 8. Cierra la orden ───────────────────────────────────────────────────
  /* Los estados de la orden son los del taller, en mayúscula y en español
     ('Entregado', no 'entregado'), y el cambio de estado va por POST. */
  assert.equal((await t1.post(`/api/orders/${ordenTaller}/status`, { status: 'Entregado' })).status, 200);
  assert.equal((await t1.get(`/api/orders/${ordenTaller}`)).body.status, 'Entregado');

  // ── 9. Lo que el taller se lleva al día siguiente ────────────────────────
  const respaldo = await t1.get('/api/backup');
  assert.equal(respaldo.status, 200);
  assert.ok(respaldo.body.exported_at, 'el respaldo dice cuándo se hizo');
  const datos = respaldo.body.data;
  assert.ok(datos.inventory.length >= 1, 'el respaldo incluye el almacén');
  assert.ok(datos.documents.length >= 2, 'el respaldo incluye los dos documentos');
  assert.ok(datos.cash.length >= 1, 'el respaldo incluye la caja');
  assert.ok(datos.orders.length >= 2, 'el respaldo incluye las dos órdenes');
  /* El respaldo se descarga en un taller y se sube en otro con años de datos:
     si se colara una fila de otro taller, al importar en el destino aparecería
     un cliente o una orden que no son suyos. */
  assert.ok(datos.documents.every((d) => Number(d.workshop_id) === 1),
    'el respaldo solo lleva datos de este taller');
});
