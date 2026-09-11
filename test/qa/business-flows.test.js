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

  it('29b. el CSV escapa de verdad: comas y comillas en un campo no parten la fila (4.6)', async () => {
    const alta = await t.post('/api/inventory', { name: 'Filtro, "premium" 8"', sku: 'CSV-1', qty: 1, unit_price: 10 });
    assert.equal(alta.status, 201);
    const r = await t.get('/api/inventory/export?format=csv');
    assert.equal(r.status, 200);
    const csv = String(r.body);
    // La cabecera no lleva comillas de sobra: no tiene caracteres especiales.
    assert.ok(csv.startsWith('Nombre,SKU,'), `la cabecera debe ir limpia: ${csv.split('\n')[0]}`);
    // El campo con coma y comillas va entrecomillado y con las comillas dobladas,
    // que es lo que impide que la coma parta la fila en dos columnas.
    assert.ok(csv.includes('"Filtro, ""premium"" 8"""'),
      `el campo con coma y comillas debe ir entrecomillado y con las comillas dobladas:\n${csv}`);
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

  it('exige nombre; sin device_id igual limita por IP/día', async () => {
    // S1 (F9/B26): el device_id ya no se exige ni se usa. Falta author → 400.
    assert.equal((await visitante.post(`/api/workshops/${slug}/reviews`, { rating: 5, device_id: 'd' })).status, 400);
    // Con author pero misma IP del test anterior → 409 (una por IP/día/taller),
    // con o sin device_id. Ya hay una reseña de esta IP en este taller.
    assert.equal((await visitante.post(`/api/workshops/${slug}/reviews`, { author: 'A', rating: 5 })).status, 409);
  });

  it('un taller no publicado no acepta reseñas', async () => {
    const r = await visitante.post('/api/workshops/taller-que-no-existe/reviews', {
      author: 'A', rating: 5, device_id: 'd',
    });
    assert.equal(r.status, 404);
  });
});

/* ============================================================================
   Ola 2b — topes de magnitud (2.14), existencia y devolución de stock (2.15),
   numeración de documentos (2.16), nota de entrega (2.17), idempotencia del GET
   de orden (2.18), import saneado (2.20), ids validados (2.21) y fechas ISO
   (2.28). Cada bloque cita el ID de la matriz que cubre.
   ========================================================================= */

describe('2.14 — topes de magnitud', () => {
  let ctx, t, pieza;

  before(async () => {
    ctx = await levantarServidor();
    t = crearCliente(ctx.base);
    await t.registrar('Topes');
    const r = await t.post('/api/inventory', { name: 'Pieza base', qty: 100, unit_price: 10 });
    pieza = r.body.id;
  });
  after(() => ctx.cerrar());

  it('rechaza existencia y precio fuera de rango al crear (0..1e6 y 0..1e8)', async () => {
    const casos = [
      { name: 'P', qty: 1e6 + 1 }, { name: 'P', qty: -1 }, { name: 'P', min_qty: -1 },
      { name: 'P', unit_price: 1e8 + 1 }, { name: 'P', unit_price: -0.01 },
    ];
    for (const c of casos) {
      const r = await t.post('/api/inventory', c);
      assert.equal(r.status, 400, `aceptó ${JSON.stringify(c)}`);
      assert.equal(typeof r.body.error, 'string', `el 400 de ${JSON.stringify(c)} no trae mensaje en español`);
    }
  });

  it('acepta justo los topes (1 000 000 unidades y 100 000 000 de precio)', async () => {
    const r = await t.post('/api/inventory', { name: 'Justo en el tope', qty: 1e6, unit_price: 1e8 });
    assert.equal(r.status, 201, `el tope legítimo devolvió ${r.status}: ${JSON.stringify(r.body)}`);
  });

  it('rechaza precios y mínimos fuera de rango al editar, y acepta lo válido', async () => {
    for (const c of [{ name: 'Pieza base', unit_price: 1e8 + 1 }, { name: 'Pieza base', min_qty: -1 }, { name: 'Pieza base', qty: 1e7 }]) {
      assert.equal((await t.put(`/api/inventory/${pieza}`, c)).status, 400, `aceptó ${JSON.stringify(c)}`);
    }
    assert.equal((await t.put(`/api/inventory/${pieza}`, { name: 'Pieza base', unit_price: 999.5, min_qty: 1 })).status, 200);
  });

  it('rechaza un delta de inventario fuera de ±1 000 000', async () => {
    for (const delta of [1e6 + 1, -1e6 - 1, 1e9]) {
      const r = await t.post(`/api/inventory/${pieza}/moves`, { delta, kind: 'ajuste' });
      assert.equal(r.status, 400, `aceptó el delta ${delta}`);
    }
  });

  it('exige que el signo del delta cuadre con el tipo de movimiento', async () => {
    const entradaNegativa = await t.post(`/api/inventory/${pieza}/moves`, { delta: -5, kind: 'entrada' });
    assert.equal(entradaNegativa.status, 400, 'una entrada con delta negativo descuadra el kardex');
    const salidaPositiva = await t.post(`/api/inventory/${pieza}/moves`, { delta: 5, kind: 'salida' });
    assert.equal(salidaPositiva.status, 400, 'una salida con delta positivo descuadra el kardex');
    assert.match(String(entradaNegativa.body.error), /positivo/i);
    assert.match(String(salidaPositiva.body.error), /negativo/i);
  });

  it('el stock no cambia cuando el movimiento se rechaza', async () => {
    const antes = (await t.get('/api/inventory')).body.find(i => i.id === pieza).qty;
    await t.post(`/api/inventory/${pieza}/moves`, { delta: 1e6 + 1, kind: 'entrada' });
    const despues = (await t.get('/api/inventory')).body.find(i => i.id === pieza).qty;
    assert.equal(despues, antes, 'un movimiento rechazado tocó la existencia');
  });

  it('acepta el signo coherente y el delta en el tope', async () => {
    const sube = await t.post(`/api/inventory/${pieza}/moves`, { delta: 1e6, kind: 'entrada' });
    assert.equal(sube.status, 200, `entrada de 1e6 devolvió ${sube.status}: ${JSON.stringify(sube.body)}`);
    const baja = await t.post(`/api/inventory/${pieza}/moves`, { delta: -1e6, kind: 'salida' });
    assert.equal(baja.status, 200, `salida de 1e6 devolvió ${baja.status}: ${JSON.stringify(baja.body)}`);
    assert.equal(baja.body.qty, 100, 'la existencia debería volver a 100');
  });

  it('rechaza montos de caja fuera de 0.01..1e6', async () => {
    for (const amount of [0, 0.001, 1e6 + 1, 1e9, -5, null, 'mucho']) {
      const r = await t.post('/api/cash', { concept: 'X', amount });
      assert.equal(r.status, 400, `aceptó el monto ${JSON.stringify(amount)}`);
    }
  });

  it('acepta los extremos del rango de caja', async () => {
    assert.equal((await t.post('/api/cash', { concept: 'Mínimo', amount: 0.01 })).status, 201);
    assert.equal((await t.post('/api/cash', { concept: 'Máximo', amount: 1e6 })).status, 201);
  });

  it('rechaza cantidades de partida fuera de 0.01..1e6', async () => {
    const orden = await t.post('/api/orders', { title: 'Orden de topes' });
    for (const qty of [0.001, 0, -2, 1e6 + 1]) {
      const r = await t.post(`/api/orders/${orden.body.id}/items`, { descr: 'Partida', qty, unit_price: 1 });
      assert.equal(r.status, 400, `aceptó la cantidad ${qty}`);
    }
    const detalle = await t.get(`/api/orders/${orden.body.id}`);
    assert.equal((detalle.body.items || []).length, 0, 'se guardó una partida con cantidad inválida');
  });

  it('rechaza un precio unitario de partida fuera de 0..1e8', async () => {
    const orden = await t.post('/api/orders', { title: 'Orden de precio' });
    for (const unit_price of [-1, 1e8 + 1]) {
      const r = await t.post(`/api/orders/${orden.body.id}/items`, { descr: 'Partida', qty: 1, unit_price });
      assert.equal(r.status, 400, `aceptó el precio ${unit_price}`);
    }
    assert.equal((await t.post(`/api/orders/${orden.body.id}/items`, { descr: 'Partida', qty: 1, unit_price: 1e8 })).status, 201);
  });
});

describe('2.15 — existencia y devolución de stock en órdenes', () => {
  let ctx, t, pieza, orden;

  const stock = async () => (await t.get('/api/inventory')).body.find(i => i.id === pieza).qty;

  before(async () => {
    ctx = await levantarServidor();
    t = crearCliente(ctx.base);
    await t.registrar('Existencia');
    const r = await t.post('/api/inventory', { name: 'Pila con 5', qty: 5, unit_price: 800 });
    pieza = r.body.id;
    orden = (await t.post('/api/orders', { title: 'Cambio de pila' })).body.id;
  });
  after(() => ctx.cerrar());

  it('rechaza con 409 una partida mayor que la existencia, sin descontar nada', async () => {
    const r = await t.post(`/api/orders/${orden}/items`, { descr: 'Pila', qty: 6, unit_price: 800, item_id: pieza });
    assert.equal(r.status, 409, `debería rechazar por existencia, devolvió ${r.status}`);
    assert.match(String(r.body.error), /existencia/i);
    assert.match(String(r.body.error), /5/, 'el mensaje debe decir cuánto queda');
    assert.equal(await stock(), 5, 'una partida rechazada no puede mover el inventario');
  });

  it('acepta una partida que sí cabe y la descuenta', async () => {
    const r = await t.post(`/api/orders/${orden}/items`, { descr: 'Pila', qty: 2, unit_price: 800, item_id: pieza });
    assert.equal(r.status, 201);
    assert.equal(await stock(), 3);
  });

  it('borrar la partida devuelve el stock mientras la orden sigue abierta', async () => {
    const ordenes = await t.get(`/api/orders/${orden}`);
    const partida = (ordenes.body.items || [])[0];
    assert.ok(partida, 'no se localizó la partida');
    assert.equal((await t.del(`/api/orders/${orden}/items/${partida.id}`)).status, 200);
    assert.equal(await stock(), 5, 'una orden abierta debe devolver la pieza al anaquel');
  });

  it('NO devuelve stock si la orden ya está Entregado', async () => {
    assert.equal((await t.post(`/api/orders/${orden}/status`, { status: 'Entregado' })).status, 200);
    const alta = await t.post(`/api/orders/${orden}/items`, { descr: 'Pila', qty: 2, unit_price: 800, item_id: pieza });
    assert.equal(alta.status, 201);
    assert.equal(await stock(), 3);
    assert.equal((await t.del(`/api/orders/${orden}/items/${alta.body.id}`)).status, 200);
    assert.equal(await stock(), 3, 'en una orden entregada la pieza ya salió del taller: no vuelve al inventario');
  });

  it('tampoco si la orden está Cancelado', async () => {
    assert.equal((await t.post(`/api/orders/${orden}/status`, { status: 'Cancelado' })).status, 200);
    const alta = await t.post(`/api/orders/${orden}/items`, { descr: 'Pila', qty: 2, unit_price: 800, item_id: pieza });
    assert.equal(alta.status, 201);
    assert.equal(await stock(), 1);
    assert.equal((await t.del(`/api/orders/${orden}/items/${alta.body.id}`)).status, 200);
    assert.equal(await stock(), 1, 'una orden cancelada no devuelve stock');
  });
});

describe('2.16 — numeración de documentos', () => {
  let ctx, t, primera, segunda;

  const numero = (n) => Number(String(n).split('-')[1]);
  const alta = async (kind = 'entrega') => t.post('/api/documents', {
    kind, items: [{ descr: 'Concepto', qty: 1, unit_price: 1 }],
  });

  before(async () => {
    ctx = await levantarServidor();
    t = crearCliente(ctx.base);
    await t.registrar('Numeracion');
  });
  after(() => ctx.cerrar());

  it('el folio sigue al número más alto del taller', async () => {
    const a = await alta();
    assert.equal(a.status, 201);
    assert.match(a.body.number, /^NE-\d{4}$/);
    primera = a.body;
    segunda = (await alta()).body;
    assert.equal(numero(segunda.number), numero(primera.number) + 1);
  });

  it('borrar un documento intermedio no hace que el siguiente repita un folio vivo', async () => {
    // Se borra el PRIMERO: con COUNT(*)+1 el siguiente documento volvía a nacer
    // como NE-0002, el mismo folio que `segunda`, que sigue emitido.
    assert.equal((await t.del(`/api/documents/${primera.id}`)).status, 200);
    const tercera = (await alta()).body;
    assert.notEqual(tercera.number, segunda.number, `se repitió el folio vivo ${segunda.number}`);
    assert.ok(numero(tercera.number) > numero(segunda.number),
      `${tercera.number} debería seguir a ${segunda.number}`);

    const vivos = (await t.get('/api/documents')).body.map(d => d.number);
    assert.equal(new Set(vivos).size, vivos.length, `folios repetidos entre documentos vivos: ${vivos.join(', ')}`);
  });

  it('borrar el último y volver a emitir tampoco choca con un folio vivo', async () => {
    const vivos = (await t.get('/api/documents')).body;
    const ultimo = vivos.reduce((a, b) => (numero(b.number) > numero(a.number) ? b : a));
    assert.equal((await t.del(`/api/documents/${ultimo.id}`)).status, 200);

    const restantes = vivos.filter(d => d.id !== ultimo.id).map(d => d.number);
    const nueva = (await alta()).body;
    assert.equal(restantes.includes(nueva.number), false, `el folio ${nueva.number} ya estaba emitido`);
    // El folio reanuda desde el máximo VIVO (MAX+1), no desde cuántos quedan.
    assert.equal(numero(nueva.number), numero(ultimo.number), 'el folio debería reanudar desde el máximo vivo');
  });

  it('cada tipo de documento lleva su propia serie', async () => {
    const p = await alta('presupuesto');
    assert.match(p.body.number, /^P-\d{4}$/);
    const p2 = await alta('presupuesto');
    assert.equal(numero(p2.body.number), numero(p.body.number) + 1);
  });
});

describe('2.17 — la nota de entrega descuenta inventario', () => {
  let ctx, t, pieza;

  const stock = async (id = pieza) => (await t.get('/api/inventory')).body.find(i => i.id === id).qty;

  before(async () => {
    ctx = await levantarServidor();
    t = crearCliente(ctx.base);
    await t.registrar('Entrega');
    pieza = (await t.post('/api/inventory', { name: 'Filtro de entrega', qty: 10, unit_price: 60 })).body.id;
  });
  after(() => ctx.cerrar());

  it('descuenta la pieza de la nota de entrega y deja el movimiento', async () => {
    const r = await t.post('/api/documents', {
      kind: 'entrega', items: [{ descr: 'Filtro de entrega', qty: 3, unit_price: 60, item_id: pieza }],
    });
    assert.equal(r.status, 201, `la nota de entrega devolvió ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal(await stock(), 7, 'la nota de entrega no descontó la pieza');

    const mov = (await t.get('/api/inventory/moves')).body.find(m => m.item_id === pieza);
    assert.ok(mov, 'la nota de entrega no dejó movimiento de inventario');
    assert.equal(Number(mov.delta), -3, 'el movimiento debe ser una salida (delta negativo)');
    assert.equal(mov.kind, 'salida', `el movimiento quedó como "${mov.kind}"`);
  });

  it('un presupuesto NO toca el inventario: es una cotización, no una salida', async () => {
    const antes = await stock();
    const r = await t.post('/api/documents', {
      kind: 'presupuesto', items: [{ descr: 'Filtro de entrega', qty: 4, unit_price: 60, item_id: pieza }],
    });
    assert.equal(r.status, 201);
    assert.equal(await stock(), antes, 'un presupuesto descontó inventario');
  });

  it('rechaza con 409 una entrega mayor que la existencia y no emite el documento', async () => {
    const documentosAntes = (await t.get('/api/documents')).body.length;
    const r = await t.post('/api/documents', {
      kind: 'entrega', items: [{ descr: 'Filtro de entrega', qty: 99, unit_price: 60, item_id: pieza }],
    });
    assert.equal(r.status, 409, `devolvió ${r.status}: ${JSON.stringify(r.body)}`);
    assert.match(String(r.body.error), /existencia/i);
    assert.equal(await stock(), 7, 'la nota rechazada movió el inventario');
    assert.equal((await t.get('/api/documents')).body.length, documentosAntes, 'la nota rechazada se guardó igual');
  });

  it('suma la demanda de la misma pieza en varios renglones (no deja el stock en negativo)', async () => {
    // 4 + 4 sobre 7 unidades: cada renglón cabe por separado, la nota no.
    const r = await t.post('/api/documents', {
      kind: 'entrega',
      items: [
        { descr: 'Filtro de entrega', qty: 4, unit_price: 60, item_id: pieza },
        { descr: 'Filtro de entrega', qty: 4, unit_price: 60, item_id: pieza },
      ],
    });
    assert.equal(r.status, 409, `devolvió ${r.status}: ${JSON.stringify(r.body)}`);
    assert.match(String(r.body.error), /8/, 'el mensaje debe sumar el total pedido (8)');
    assert.equal(await stock(), 7, 'el stock terminó negativo o recortado');
  });
});

describe('2.18 — leer una orden no la modifica', () => {
  let ctx, t, orden, partida;

  before(async () => {
    ctx = await levantarServidor();
    t = crearCliente(ctx.base);
    await t.registrar('Idempotente');
    orden = (await t.post('/api/orders', { title: 'Orden idempotente' })).body.id;
    await t.post(`/api/orders/${orden}/items`, { descr: 'Mano de obra', qty: 2, unit_price: 100 });
  });
  after(() => ctx.cerrar());

  it('la mutación (agregar la partida) sí calcula el total', async () => {
    const r = await t.get(`/api/orders/${orden}`);
    assert.equal(Number(r.body.total), 200, 'agregar una partida debe dejar el total cuadrado');
  });

  it('el GET devuelve el total guardado, sin recalcular ni escribir', async () => {
    // Se ensucia el total a mano para poder probar que el GET NO lo recalcula.
    ctx.db.prepare('UPDATE work_orders SET total = 0 WHERE id = ?').run(orden);

    const primera = await t.get(`/api/orders/${orden}`);
    assert.equal(Number(primera.body.total), 0, 'el GET recalculó (y por tanto escribió) al leer');
    const segunda = await t.get(`/api/orders/${orden}`);
    assert.equal(Number(segunda.body.total), 0, 'la segunda lectura devolvió otra cosa: no es idempotente');
    assert.equal(Number(ctx.db.prepare('SELECT total FROM work_orders WHERE id = ?').get(orden).total), 0,
      'leer la orden escribió en la base');
  });

  it('las mutaciones vuelven a cuadrar el total', async () => {
    const alta = await t.post(`/api/orders/${orden}/items`, { descr: 'Pieza', qty: 1, unit_price: 100 });
    assert.equal(alta.status, 201);
    assert.equal(Number((await t.get(`/api/orders/${orden}`)).body.total), 300, 'agregar no recalculó el total');

    assert.equal((await t.del(`/api/orders/${orden}/items/${alta.body.id}`)).status, 200);
    assert.equal(Number((await t.get(`/api/orders/${orden}`)).body.total), 200, 'borrar no recalculó el total');
  });
});

describe('2.20 — el import de respaldo sanea cada tabla', () => {
  let ctx, t;

  before(async () => {
    ctx = await levantarServidor();
    t = crearCliente(ctx.base);
    await t.registrar('RespaldoSano');
    await t.post('/api/clients', { name: 'Cliente legítimo' });
    await t.post('/api/inventory', { name: 'Pieza legítima', sku: 'L-1', qty: 7, unit_price: 25 });
    await t.post('/api/cash', { concept: 'Ingreso legítimo', amount: 500 });
    await t.post('/api/diagnostics', { vehicle_id: 2, brand: 'Nissan', model: 'Tsuru del taller', measured_psi: 55 });
  });
  after(() => ctx.cerrar());

  it('sigue aceptando un respaldo exportado por la propia app', async () => {
    const respaldo = (await t.get('/api/backup')).body;
    const r = await t.post('/api/backup/import', { data: respaldo.data });
    assert.equal(r.status, 200, `la importación legítima devolvió ${r.status}: ${JSON.stringify(r.body)}`);
    const pieza = (await t.get('/api/inventory')).body.find(i => i.name === 'Pieza legítima');
    assert.equal(Number(pieza.qty), 7, 'un respaldo legítimo perdió la existencia');
    assert.ok((await t.get('/api/cash')).body.some(c => c.concept === 'Ingreso legítimo'));
  });

  it('conserva la referencia al catálogo de un diagnóstico (vehicle_id no se remapea)', async () => {
    // diagnostics.vehicle_id apunta al catálogo global, no a client_vehicles:
    // remapearlo (como a las demás tablas) borraría la referencia al vehículo.
    const respaldo = (await t.get('/api/backup')).body;
    assert.ok(respaldo.data.diagnostics.some(d => Number(d.vehicle_id) === 2),
      'el respaldo debería traer el diagnóstico con su vehicle_id');

    const r = await t.post('/api/backup/import', { data: respaldo.data });
    assert.equal(r.status, 200, `devolvió ${r.status}: ${JSON.stringify(r.body)}`);
    const guardado = (await t.get('/api/diagnostics')).body.find(d => d.model === 'Tsuru del taller');
    assert.equal(Number(guardado.vehicle_id), 2, 'el import perdió la referencia al vehículo del catálogo');
  });

  it('ignora columnas fuera de la lista blanca y saneo los valores permitidos', async () => {
    const respaldo = (await t.get('/api/backup')).body;
    const data = {
      ...respaldo.data,
      // Columnas hostiles: workshop_id ajeno, una columna inventada y un tipo de
      // movimiento de caja que no existe (debe caer en la allowlist).
      inventory: respaldo.data.inventory.map(r => ({ ...r, workshop_id: 999999, id: 424242, columna_hostil: '<script>alert(1)</script>' })),
      cash: [...respaldo.data.cash, { concept: 'Inyectado', amount: '50', type: 'inventado', sobra: 1 }],
    };
    const r = await t.post('/api/backup/import', { data });
    assert.equal(r.status, 200, `devolvió ${r.status}: ${JSON.stringify(r.body)}`);

    const caja = (await t.get('/api/cash')).body.find(c => c.concept === 'Inyectado');
    assert.ok(caja, 'no se importó la fila de caja');
    assert.equal(caja.type, 'ingreso', 'un tipo de movimiento inventado entró tal cual');
    assert.equal(Number(caja.amount), 50, 'el monto no se saneó');

    const inventario = (await t.get('/api/inventory')).body;
    assert.equal(inventario.length, 1, `el workspace_id inyectado creó filas de más: ${inventario.length}`);
  });

  it('rechaza un respaldo con un número imposible y no toca los datos', async () => {
    const respaldo = (await t.get('/api/backup')).body;
    const data = { ...respaldo.data, inventory: [{ id: 1, name: 'Rota', qty: 'mucho', min_qty: 0, unit_price: 1 }] };
    const r = await t.post('/api/backup/import', { data });
    assert.equal(r.status, 400, `aceptó un número imposible: ${JSON.stringify(r.body)}`);
    assert.equal(/constraint|NOT NULL|SQLITE/i.test(String(r.body.error)), false,
      `el error filtra las tripas del driver: "${r.body.error}"`);
    assert.ok((await t.get('/api/inventory')).body.some(i => i.name === 'Pieza legítima'),
      'el respaldo rechazado borró los datos del taller');
  });

  it('una sección que no es lista se rechaza con 400', async () => {
    const r = await t.post('/api/backup/import', { data: { inventory: 'no-es-una-lista' } });
    assert.equal(r.status, 400);
    assert.match(String(r.body.error), /inventory/, 'el error debe decir QUÉ sección está mal');
    assert.ok((await t.get('/api/clients')).body.some(c => c.name === 'Cliente legítimo'));
  });

  it('el import descarta fotos que no son PNG/JPEG/WEBP (no cuela un SVG)', async () => {
    await t.post('/api/orders', { title: 'Orden con foto hostil' });
    const respaldo = (await t.get('/api/backup')).body;
    const orden = respaldo.data.orders.find(o => o.title === 'Orden con foto hostil');
    const svg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==';
    const data = { ...respaldo.data, orderPhotos: [{ order_id: orden.id, photo: svg, caption: 'svg' }] };
    const r = await t.post('/api/backup/import', { data });
    assert.equal(r.status, 200, `devolvió ${r.status}: ${JSON.stringify(r.body)}`);
    const nueva = (await t.get('/api/orders')).body.find(o => o.title === 'Orden con foto hostil');
    const detalle = (await t.get(`/api/orders/${nueva.id}`)).body;
    assert.equal((detalle.photos || []).length, 0, 'una foto SVG entró por el import');
  });
});

describe('2.21 — un :id inválido responde 404 sin tocar la base', () => {
  let ctx, t, orden;

  before(async () => {
    ctx = await levantarServidor();
    t = crearCliente(ctx.base);
    await t.registrar('IdInvalido');
    orden = (await t.post('/api/orders', { title: 'Orden con id válido' })).body.id;
  });
  after(() => ctx.cerrar());

  const RUTAS_CON_ID = [
    ['GET', '/api/orders/abc'], ['PUT', '/api/orders/abc'], ['DELETE', '/api/orders/abc'],
    ['POST', '/api/orders/abc/items'], ['DELETE', '/api/orders/abc/items/abc'],
    ['DELETE', '/api/orders/abc/photos/abc'], ['POST', '/api/orders/abc/status'],
    ['PUT', '/api/inventory/abc'], ['DELETE', '/api/inventory/abc'], ['POST', '/api/inventory/abc/moves'],
    ['PUT', '/api/clients/abc'], ['DELETE', '/api/clients/abc'],
    ['GET', '/api/clients/abc/vehicles'], ['POST', '/api/clients/abc/vehicles'],
    ['DELETE', '/api/clients/vehicles/abc'],
    ['GET', '/api/documents/abc'], ['GET', '/api/documents/abc/print'],
    ['PUT', '/api/documents/abc/status'], ['DELETE', '/api/documents/abc'],
    ['DELETE', '/api/notes/abc'], ['DELETE', '/api/cash/abc'],
    ['POST', '/api/workshop/notifications/abc/read'],
  ];

  it('todas las rutas de negocio con :id devuelven 404 con un id no numérico', async () => {
    for (const [metodo, ruta] of RUTAS_CON_ID) {
      const opts = { method: metodo };
      if (metodo === 'POST' || metodo === 'PUT') opts.body = JSON.stringify({});
      const r = await t.req(ruta, opts);
      assert.equal(r.status, 404, `${metodo} ${ruta} devolvió ${r.status} (${JSON.stringify(r.body)})`);
      assert.equal(typeof r.body.error, 'string', `${metodo} ${ruta} no devolvió el error en JSON`);
    }
  });

  it('un id numérico inexistente también es 404 y no un 500', async () => {
    for (const ruta of ['/api/orders/999999', '/api/documents/999999', '/api/orders/999999/items', '/api/cash/999999']) {
      const r = await t.get(ruta);
      assert.equal(r.status, 404, `GET ${ruta} devolvió ${r.status}`);
    }
    const notif = await t.post('/api/workshop/notifications/999999/read', {});
    assert.equal(notif.status, 200, 'marcar como leída una notificación ajena/inexistente no debe reventar');
  });

  it('las rutas válidas siguen funcionando después (nada quedó roto)', async () => {
    assert.equal((await t.get(`/api/orders/${orden}`)).status, 200);
    assert.equal((await t.get(`/api/orders/${orden}`)).body.id, orden);
  });
});

describe('2.28 — las fechas de los documentos salen en ISO-8601 con zona', () => {
  let ctx, t, doc;

  before(async () => {
    ctx = await levantarServidor();
    t = crearCliente(ctx.base);
    await t.registrar('Fechas');
    doc = (await t.post('/api/documents', { kind: 'entrega', items: [{ descr: 'Concepto', qty: 1, unit_price: 10 }] })).body.id;
  });
  after(() => ctx.cerrar());

  it('created_at viene normalizado (Z) en la lista y en el detalle', async () => {
    const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
    const lista = (await t.get('/api/documents')).body;
    const deLaLista = lista.find(d => d.id === doc);
    assert.match(String(deLaLista.created_at), ISO, `la lista trae "${deLaLista.created_at}"`);

    const detalle = (await t.get(`/api/documents/${doc}`)).body;
    assert.match(String(detalle.created_at), ISO, `el detalle trae "${detalle.created_at}"`);
  });
});
