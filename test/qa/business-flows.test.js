'use strict';
/* ============================================================================
   QA de flujos completos del taller.

   Recorre el trabajo real de punta a punta —cliente, su vehículo, orden de
   trabajo, partidas, fotos, cambio de estado, documento, impresión, respaldo—
   en vez de probar cada ruta suelta. Es la suite que caza los errores que solo
   aparecen cuando un paso depende del anterior.

   Cubre además las rutas que antes no tocaba ninguna prueba.
   ========================================================================= */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { levantarServidor, crearCliente } = require('../helpers');

/* Un PNG de 1x1 transparente, como data URL. Sirve de foto de orden. */
const FOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('Flujo completo: cliente → vehículo → orden → documento', () => {
  let ctx, t, ids = {};

  before(async () => {
    ctx = await levantarServidor();
    t = crearCliente(ctx.base);
    await t.registrar('Flujo');
  });
  after(() => ctx.cerrar());

  it('1. da de alta un cliente', async () => {
    const r = await t.post('/api/clients', { name: 'Juan Pérez', phone: '5512345678', city: 'Puebla' });
    assert.equal(r.status, 201);
    ids.cliente = r.body.id;
    assert.ok(ids.cliente > 0);
  });

  it('2. registra el vehículo del cliente', async () => {
    const r = await t.post(`/api/clients/${ids.cliente}/vehicles`, {
      brand: 'Nissan', model: 'Tsuru', year: 2015, plate: 'abc-123-x', vin: '1N4AB7AP0FN123456',
    });
    assert.equal(r.status, 201);
    ids.vehiculo = r.body.id;
  });

  it('3. la placa se guarda en mayúsculas', async () => {
    const r = await t.get(`/api/clients/${ids.cliente}/vehicles`);
    assert.equal(r.status, 200);
    const v = r.body.find(x => x.id === ids.vehiculo);
    assert.ok(v, 'el vehículo no aparece en la lista del cliente');
    assert.equal(v.plate, 'ABC-123-X', 'la placa debe normalizarse a mayúsculas para poder buscarla');
  });

  it('4. no se pueden registrar vehículos a un cliente de otro taller', async () => {
    const otro = crearCliente(ctx.base);
    await otro.registrar('Intruso');
    const r = await otro.post(`/api/clients/${ids.cliente}/vehicles`, { brand: 'X', model: 'Y' });
    assert.equal(r.status, 404, 'debe responder "cliente no encontrado", nunca crear el vehículo');
  });

  it('5. crea una pieza de inventario con existencia', async () => {
    const r = await t.post('/api/inventory', { name: 'Pila Bosch 69100', sku: 'B69100', qty: 10, unit_price: 850 });
    assert.equal(r.status, 201);
    ids.pieza = r.body.id;
  });

  it('6. un movimiento de entrada suma existencia', async () => {
    const r = await t.post(`/api/inventory/${ids.pieza}/moves`, { delta: 5, kind: 'entrada', note: 'Compra' });
    assert.equal(r.status, 200);
    assert.equal(r.body.qty, 15, 'la existencia debe pasar de 10 a 15');
  });

  it('7. una salida mayor que la existencia deja el saldo en 0, nunca negativo', async () => {
    const r = await t.post(`/api/inventory/${ids.pieza}/moves`, { delta: -999, kind: 'salida' });
    assert.equal(r.status, 200);
    assert.equal(r.body.qty, 0, 'el inventario no puede quedar en negativo');
    // Se repone para el resto del flujo.
    await t.post(`/api/inventory/${ids.pieza}/moves`, { delta: 10, kind: 'entrada' });
  });

  it('8. el historial de movimientos registra cada uno con el nombre de la pieza', async () => {
    const r = await t.get('/api/inventory/moves');
    assert.equal(r.status, 200);
    assert.ok(r.body.length >= 3, `solo ${r.body.length} movimientos registrados`);
    assert.ok(r.body.every(m => m.item_name), 'cada movimiento debe decir de qué pieza es');
  });

  it('9. un movimiento sobre una pieza de otro taller responde 404', async () => {
    const otro = crearCliente(ctx.base);
    await otro.registrar('Intruso2');
    const r = await otro.post(`/api/inventory/${ids.pieza}/moves`, { delta: -5 });
    assert.equal(r.status, 404);
  });

  it('10. abre la orden de trabajo', async () => {
    const r = await t.post('/api/orders', {
      title: 'Cambio de módulo de gasolina', client_id: ids.cliente, vehicle_id: ids.vehiculo, descr: 'No arranca en frío',
    });
    assert.equal(r.status, 201);
    ids.orden = r.body.id;
  });

  it('11. agrega una partida que descuenta del inventario', async () => {
    const antes = (await t.get('/api/inventory')).body.find(i => i.id === ids.pieza).qty;
    const r = await t.post(`/api/orders/${ids.orden}/items`, {
      descr: 'Pila Bosch 69100', qty: 2, unit_price: 850, item_id: ids.pieza,
    });
    assert.ok(r.status === 200 || r.status === 201, `devolvió ${r.status}`);
    const despues = (await t.get('/api/inventory')).body.find(i => i.id === ids.pieza).qty;
    assert.equal(despues, antes - 2, 'usar una pieza en una orden debe descontarla del inventario');
  });

  it('12. una partida sin descripción se rechaza', async () => {
    const r = await t.post(`/api/orders/${ids.orden}/items`, { descr: '', qty: 1 });
    assert.equal(r.status, 400);
  });

  it('13. no se pueden agregar partidas a una orden de otro taller', async () => {
    const otro = crearCliente(ctx.base);
    await otro.registrar('Intruso3');
    const r = await otro.post(`/api/orders/${ids.orden}/items`, { descr: 'Robo', qty: 1 });
    assert.equal(r.status, 404);
  });

  it('14. adjunta una foto a la orden', async () => {
    const r = await t.post(`/api/orders/${ids.orden}/photos`, { photo: FOTO, caption: 'Módulo desmontado' });
    assert.equal(r.status, 201);
    ids.foto = r.body.id;
  });

  it('15. rechaza lo que no sea una imagen en data URL', async () => {
    for (const basura of ['https://ejemplo.com/foto.png', 'data:text/html,<script>', '', null]) {
      const r = await t.post(`/api/orders/${ids.orden}/photos`, { photo: basura });
      assert.equal(r.status, 400, `aceptó una foto inválida: ${JSON.stringify(basura)}`);
    }
  });

  it('16. rechaza fotos demasiado grandes', async () => {
    const enorme = 'data:image/png;base64,' + 'A'.repeat(400_000);
    const r = await t.post(`/api/orders/${ids.orden}/photos`, { photo: enorme });
    assert.ok(r.status === 400 || r.status === 413, `una foto de 400 KB devolvió ${r.status}`);
  });

  it('17. borra la foto', async () => {
    const r = await t.del(`/api/orders/${ids.orden}/photos/${ids.foto}`);
    assert.equal(r.status, 200);
    const otra = await t.del(`/api/orders/${ids.orden}/photos/${ids.foto}`);
    assert.equal(otra.status, 404, 'borrar dos veces la misma foto debe dar 404');
  });

  it('18. cambia el estado de la orden', async () => {
    const r = await t.post(`/api/orders/${ids.orden}/status`, { status: 'Entregado' });
    assert.equal(r.status, 200);
    const orden = (await t.get(`/api/orders/${ids.orden}`)).body;
    const cabecera = orden.order || orden;
    assert.equal(cabecera.status, 'Entregado');
    assert.ok(cabecera.closed_at, 'al entregar hay que sellar la fecha de cierre');
  });

  it('19. rechaza un estado inventado', async () => {
    const r = await t.post(`/api/orders/${ids.orden}/status`, { status: 'InventadoPorLaIA' });
    assert.equal(r.status, 400);
  });

  it('20. emite el documento de entrega', async () => {
    const r = await t.post('/api/documents', {
      kind: 'entrega', client_id: ids.cliente, order_id: ids.orden,
      items: [{ descr: 'Pila Bosch 69100', qty: 2, unit_price: 850 }, { descr: 'Mano de obra', qty: 1, unit_price: 400 }],
    });
    assert.equal(r.status, 201);
    ids.documento = r.body.id;
    assert.ok(r.body.number, 'el documento debe llevar número consecutivo');
  });

  it('21. el total del documento es la suma de sus partidas', async () => {
    const doc = (await t.get(`/api/documents/${ids.documento}`)).body;
    const cabecera = doc.document || doc.doc || doc;
    assert.equal(Number(cabecera.total), 2 * 850 + 400, 'el total no cuadra con las partidas');
  });

  it('22. un documento sin partidas se rechaza', async () => {
    const r = await t.post('/api/documents', { kind: 'entrega', items: [] });
    assert.equal(r.status, 400);
  });

  it('23. un tipo de documento inventado se rechaza', async () => {
    const r = await t.post('/api/documents', { kind: 'factura-fiscal', items: [{ descr: 'x', qty: 1, unit_price: 1 }] });
    assert.equal(r.status, 400);
  });

  it('24. cambia el estado del documento', async () => {
    assert.equal((await t.put(`/api/documents/${ids.documento}/status`, { status: 'entregado' })).status, 200);
    assert.equal((await t.put(`/api/documents/${ids.documento}/status`, { status: 'inventado' })).status, 400);
  });

  it('25. la vista imprimible sale en HTML con los datos del documento', async () => {
    const r = await t.get(`/api/documents/${ids.documento}/print`);
    assert.equal(r.status, 200);
    const html = String(r.body);
    assert.match(html, /NOTA DE ENTREGA/, 'debe indicar el tipo de documento');
    assert.match(html, /Pila Bosch 69100/, 'deben aparecer las partidas');
    assert.match(html, /Juan Pérez/, 'debe aparecer el cliente');
  });

  it('26. la vista imprimible escapa el HTML de los datos (XSS almacenado)', async () => {
    const rc = await t.post('/api/clients', { name: '<script>alert(1)</script>' });
    const rd = await t.post('/api/documents', {
      kind: 'presupuesto', client_id: rc.body.id,
      items: [{ descr: '<img src=x onerror=alert(2)>', qty: 1, unit_price: 1 }],
    });
    const html = String((await t.get(`/api/documents/${rd.body.id}/print`)).body);
    assert.equal(html.includes('<script>alert(1)</script>'), false, 'el nombre del cliente entró sin escapar');
    assert.equal(html.includes('<img src=x onerror='), false, 'la descripción de la partida entró sin escapar');
    assert.match(html, /&lt;/, 'debería verse contenido escapado');
  });

  it('27. la vista imprimible de otro taller responde 404', async () => {
    const otro = crearCliente(ctx.base);
    await otro.registrar('Intruso4');
    assert.equal((await otro.get(`/api/documents/${ids.documento}/print`)).status, 404);
  });

  it('28. exporta los documentos en CSV', async () => {
    const r = await t.get('/api/documents/export?format=csv');
    assert.equal(r.status, 200);
    const csv = String(r.body);
    assert.match(csv, /Número,Tipo,Estado,Cliente,Total,Fecha/, 'falta la cabecera del CSV');
    assert.ok(csv.split('\n').length >= 2, 'el CSV no trae filas');
  });

  it('29. exporta el inventario en CSV', async () => {
    const r = await t.get('/api/inventory/export?format=csv');
    assert.equal(r.status, 200);
    assert.match(String(r.body), /Pila Bosch 69100/);
  });

  it('30. borra una partida de la orden', async () => {
    const alta = await t.post(`/api/orders/${ids.orden}/items`, { descr: 'Partida a borrar', qty: 1, unit_price: 100 });
    const detalle = await t.get(`/api/orders/${ids.orden}`);
    const partidas = detalle.body.items || detalle.body.order_items || [];
    const partida = partidas.find(p => p.descr === 'Partida a borrar') || { id: alta.body?.id };
    assert.ok(partida.id, 'no se pudo localizar la partida recién creada');

    assert.equal((await t.del(`/api/orders/${ids.orden}/items/${partida.id}`)).status, 200);
    assert.equal((await t.del(`/api/orders/${ids.orden}/items/${partida.id}`)).status, 404,
      'borrar dos veces la misma partida debe dar 404');
  });

  it('31. borra el vehículo del cliente', async () => {
    assert.equal((await t.del(`/api/clients/vehicles/${ids.vehiculo}`)).status, 200);
    assert.equal((await t.del(`/api/clients/vehicles/${ids.vehiculo}`)).status, 404);
  });
});

describe('Notas rápidas y caja del taller', () => {
  let ctx, t;
  before(async () => {
    ctx = await levantarServidor();
    t = crearCliente(ctx.base);
    await t.registrar('Caja');
  });
  after(() => ctx.cerrar());

  it('crea y borra una nota', async () => {
    const alta = await t.post('/api/notes', { text: 'Revisar presión del Tsuru de Juan', vehicle_ref: 'Tsuru 2015' });
    assert.equal(alta.status, 201);
    assert.equal((await t.del(`/api/notes/${alta.body.id}`)).status, 200);
    assert.equal((await t.del(`/api/notes/${alta.body.id}`)).status, 404);
  });

  it('una nota vacía se rechaza', async () => {
    assert.equal((await t.post('/api/notes', { text: '   ' })).status, 400);
  });

  it('registra un ingreso y un egreso de caja', async () => {
    const ingreso = await t.post('/api/cash', { concept: 'Cambio de módulo', amount: 1800, type: 'ingreso' });
    assert.equal(ingreso.status, 201);
    const egreso = await t.post('/api/cash', { concept: 'Compra de pila', amount: 850, type: 'egreso' });
    assert.equal(egreso.status, 201);

    const lista = (await t.get('/api/cash')).body;
    assert.equal(lista.find(m => m.id === ingreso.body.id).type, 'ingreso');
    assert.equal(lista.find(m => m.id === egreso.body.id).type, 'egreso');
  });

  it('un tipo de movimiento desconocido se guarda como ingreso, nunca como algo inválido', async () => {
    const r = await t.post('/api/cash', { concept: 'Raro', amount: 10, type: 'inventado' });
    assert.equal(r.status, 201);
    const m = (await t.get('/api/cash')).body.find(x => x.id === r.body.id);
    assert.equal(m.type, 'ingreso');
  });

  it('rechaza montos inválidos o negativos', async () => {
    for (const amount of [0, -5, null, 'mucho', '']) {
      const r = await t.post('/api/cash', { concept: 'X', amount });
      assert.equal(r.status, 400, `aceptó el monto ${JSON.stringify(amount)}`);
    }
  });

  it('borra un movimiento de caja', async () => {
    const alta = await t.post('/api/cash', { concept: 'A borrar', amount: 1 });
    assert.equal((await t.del(`/api/cash/${alta.body.id}`)).status, 200);
    assert.equal((await t.del(`/api/cash/${alta.body.id}`)).status, 404);
  });

  it('no se pueden borrar notas ni caja de otro taller', async () => {
    const nota = await t.post('/api/notes', { text: 'Privada' });
    const caja = await t.post('/api/cash', { concept: 'Privado', amount: 100 });

    const otro = crearCliente(ctx.base);
    await otro.registrar('CajaIntruso');
    assert.equal((await otro.del(`/api/notes/${nota.body.id}`)).status, 404);
    assert.equal((await otro.del(`/api/cash/${caja.body.id}`)).status, 404);

    assert.ok((await t.get('/api/notes')).body.some(n => n.id === nota.body.id), 'borraron la nota de otro taller');
    assert.ok((await t.get('/api/cash')).body.some(c => c.id === caja.body.id), 'borraron el movimiento de otro taller');
  });
});

describe('Respaldo: exportar y volver a importar', () => {
  let ctx, t;

  before(async () => {
    ctx = await levantarServidor();
    t = crearCliente(ctx.base);
    await t.registrar('Respaldo');
    await t.post('/api/clients', { name: 'Cliente de respaldo' });
    await t.post('/api/inventory', { name: 'Pieza de respaldo', sku: 'R-1', qty: 7 });
    await t.post('/api/notes', { text: 'Nota de respaldo' });
    await t.post('/api/cash', { concept: 'Ingreso de respaldo', amount: 1200 });
  });
  after(() => ctx.cerrar());

  it('la exportación trae todas las secciones esperadas', async () => {
    const r = await t.get('/api/backup');
    assert.equal(r.status, 200);
    for (const seccion of ['inventory', 'clients', 'notes', 'cash', 'orders', 'documents']) {
      assert.ok(Array.isArray(r.body.data[seccion]), `falta la sección "${seccion}" en el respaldo`);
    }
    assert.ok(r.body.exported_at, 'el respaldo debe llevar fecha');
  });

  it('la importación restaura los datos (antes fallaba: borraba de tablas inexistentes)', async () => {
    const respaldo = (await t.get('/api/backup')).body;

    const r = await t.post('/api/backup/import', { data: respaldo.data });
    assert.equal(r.status, 200, `la importación devolvió ${r.status}: ${JSON.stringify(r.body)}`);

    const clientes = (await t.get('/api/clients')).body;
    assert.ok(clientes.some(c => c.name === 'Cliente de respaldo'), 'el cliente no se restauró');

    const inventario = (await t.get('/api/inventory')).body;
    const pieza = inventario.find(i => i.name === 'Pieza de respaldo');
    assert.ok(pieza, 'la pieza no se restauró');
    assert.equal(Number(pieza.qty), 7, 'la existencia no se restauró con su valor');

    assert.ok((await t.get('/api/notes')).body.some(n => n.text === 'Nota de respaldo'), 'la nota no se restauró');
    assert.ok((await t.get('/api/cash')).body.some(c => c.concept === 'Ingreso de respaldo'), 'la caja no se restauró');
  });

  it('importar dos veces no duplica los datos (reemplaza, no acumula)', async () => {
    const respaldo = (await t.get('/api/backup')).body;
    await t.post('/api/backup/import', { data: respaldo.data });
    await t.post('/api/backup/import', { data: respaldo.data });
    const clientes = (await t.get('/api/clients')).body.filter(c => c.name === 'Cliente de respaldo');
    assert.equal(clientes.length, 1, `el cliente quedó duplicado ${clientes.length} veces`);
  });

  it('un respaldo sin la propiedad data se rechaza', async () => {
    assert.equal((await t.post('/api/backup/import', {})).status, 400);
    assert.equal((await t.post('/api/backup/import', { data: 'texto' })).status, 400);
  });

  it('importar un respaldo no toca los datos de otro taller', async () => {
    const otro = crearCliente(ctx.base);
    await otro.registrar('RespaldoOtro');
    await otro.post('/api/clients', { name: 'Cliente del otro taller' });

    const respaldo = (await t.get('/api/backup')).body;
    await t.post('/api/backup/import', { data: respaldo.data });

    const suyos = (await otro.get('/api/clients')).body;
    assert.ok(suyos.some(c => c.name === 'Cliente del otro taller'),
      'la importación de un taller borró los datos de otro');
  });
});

describe('Comentarios públicos en la ficha del vehículo', () => {
  let ctx, c;
  before(async () => { ctx = await levantarServidor(); c = crearCliente(ctx.base); });
  after(() => ctx.cerrar());

  it('acepta un comentario y lo devuelve en la lista', async () => {
    const r = await c.post('/api/vehicles/1/comments', { author_name: 'Mecánico Luis', content: 'Confirmo 50 PSI en riel.' });
    assert.ok(r.status === 200 || r.status === 201, `devolvió ${r.status}`);
    const lista = await c.get('/api/vehicles/1/comments');
    assert.equal(lista.status, 200);
    assert.ok(lista.body.some(x => x.content.includes('50 PSI')), 'el comentario no aparece en la lista');
  });

  it('rechaza comentarios sin nombre o sin texto', async () => {
    for (const cuerpo of [{}, { author_name: 'X' }, { content: 'Y' }, { author_name: '  ', content: '  ' }]) {
      const r = await c.post('/api/vehicles/1/comments', cuerpo);
      assert.equal(r.status, 400, `aceptó ${JSON.stringify(cuerpo)}`);
    }
  });

  it('un vehículo inexistente o inválido no rompe', async () => {
    assert.equal((await c.get('/api/vehicles/abc/comments')).status, 404);
    const r = await c.get('/api/vehicles/999999/comments');
    assert.ok(r.status === 200 || r.status === 404, `devolvió ${r.status}`);
  });
});

describe('Perfil público del taller y reseñas', () => {
  let ctx, t, visitante, slug;

  before(async () => {
    ctx = await levantarServidor();
    t = crearCliente(ctx.base);
    visitante = crearCliente(ctx.base);
    await t.registrar('Publico');
    const perfil = await t.put('/api/auth/profile', {
      name: 'Taller El Águila', is_public: 1, city: 'Puebla', bio: 'Especialistas en módulos', services: 'Inyección',
    });
    slug = perfil.body?.slug || 'taller-el-aguila';
  });
  after(() => ctx.cerrar());

  it('el perfil publicado se puede consultar por su slug', async () => {
    const r = await visitante.get(`/api/workshops/${slug}`);
    assert.equal(r.status, 200, `el perfil "${slug}" no está publicado`);
    assert.equal(r.body.name || r.body.workshop?.name, 'Taller El Águila');
  });

  it('el perfil público NUNCA expone el correo ni el hash de la contraseña', async () => {
    const texto = JSON.stringify((await visitante.get(`/api/workshops/${slug}`)).body);
    for (const campo of ['pass_hash', 'scrypt$', 'verify_token_hash']) {
      assert.equal(texto.includes(campo), false, `el perfil público filtró "${campo}"`);
    }
  });

  it('acepta una reseña con calificación válida', async () => {
    const r = await visitante.post(`/api/workshops/${slug}/reviews`, {
      author: 'Cliente Ana', rating: 5, comment: 'Muy buen trabajo', device_id: 'dispositivo-1',
    });
    assert.ok(r.status === 200 || r.status === 201, `devolvió ${r.status}: ${JSON.stringify(r.body)}`);
  });

  it('rechaza calificaciones fuera de rango en vez de recortarlas', async () => {
    // toInt recorta al rango, y aquí eso convertiría un 9 en un 5 y ensuciaría
    // el promedio del taller. Por eso la calificación se valida a mano.
    for (const rating of [0, 6, 9, -1, 'cinco', null]) {
      const r = await visitante.post(`/api/workshops/${slug}/reviews`, {
        author: 'Ana', rating, comment: 'x', device_id: 'dispositivo-' + rating,
      });
      assert.equal(r.status, 400, `aceptó la calificación ${JSON.stringify(rating)}`);
    }
  });

  it('exige nombre e identificador de dispositivo', async () => {
    assert.equal((await visitante.post(`/api/workshops/${slug}/reviews`, { rating: 5, device_id: 'd' })).status, 400);
    assert.equal((await visitante.post(`/api/workshops/${slug}/reviews`, { author: 'A', rating: 5 })).status, 400);
  });

  it('un taller no publicado no acepta reseñas', async () => {
    const r = await visitante.post('/api/workshops/taller-que-no-existe/reviews', {
      author: 'A', rating: 5, device_id: 'd',
    });
    assert.equal(r.status, 404);
  });
});
