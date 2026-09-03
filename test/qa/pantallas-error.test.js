'use strict';
/* ============================================================================
   Las pantallas de error, contra la app REAL levantada en memoria.

   lib/errores.js ya se prueba sola en test/unit; esto comprueba lo que solo se
   ve montando el servidor: qué código responde cada ruta, quién recibe HTML y
   quién JSON, y que un fallo de verdad —no una vista previa— acaba en la
   pantalla del 500 con su código de incidencia.
   ========================================================================= */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { levantarServidor, crearCliente } = require('../helpers');

const COMO_NAVEGADOR = { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };

test('pantallas de error servidas', async (t) => {
  const ctx = await levantarServidor();
  const c = crearCliente(ctx.base);
  t.after(() => ctx.cerrar());

  await t.test('una ruta inexistente da 404 con la pantalla, no el HTML de Express', async () => {
    const r = await c.get('/no-existe-jamas', { headers: COMO_NAVEGADOR });
    assert.equal(r.status, 404);
    assert.match(r.body, /err-pantalla/);
    assert.match(r.body, /Página no encontrada/);
    assert.match(r.body, /error-404\.webp/);
    // el 404 por defecto de Express: <title>Error</title> y "Cannot GET"
    assert.ok(!/Cannot GET/.test(r.body));
    // nunca indexable, nunca cacheable
    assert.match(r.body, /name="robots" content="noindex"/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });

  await t.test('la ruta pedida se refleja escapada, sin XSS', async () => {
    const r = await c.get('/' + encodeURIComponent('<script>alert(1)</script>'), { headers: COMO_NAVEGADOR });
    assert.equal(r.status, 404);
    assert.ok(!r.body.includes('<script>alert(1)</script>'));
  });

  await t.test('bajo /api sigue siendo JSON aunque el cliente pida HTML', async () => {
    /* Lo consume código, no una persona: devolverle 160 KB de maquetación a un
       `fetch` rompería el frontend y gastaría datos del celular del taller. */
    const r = await c.get('/api/no-existe', { headers: COMO_NAVEGADOR });
    assert.equal(r.status, 404);
    assert.deepEqual(r.body, { error: 'No encontrado' });
  });

  await t.test('un fetch que no pide HTML tampoco recibe la pantalla', async () => {
    const r = await c.get('/no-existe-jamas', { headers: { accept: 'application/json' } });
    assert.equal(r.status, 404);
    assert.ok(!String(r.body).includes('err-pantalla'));
  });

  await t.test('la vista previa pinta las cinco y responde 200', async () => {
    /* 200 a propósito: es una demostración, no el error. Un 503 de verdad aquí
       haría que el buscador —o el host— creyera el sitio caído. */
    for (const [codigo, texto] of [
      [401, 'Acceso no autorizado'], [403, 'Prohibido'], [404, 'Página no encontrada'],
      [500, 'Error interno del servidor'], [503, 'En mantenimiento'],
    ]) {
      const r = await c.get(`/_errores/${codigo}`, { headers: COMO_NAVEGADOR });
      assert.equal(r.status, 200, `/_errores/${codigo} debería responder 200`);
      assert.match(r.body, new RegExp(texto), `/_errores/${codigo} no pintó "${texto}"`);
      assert.match(r.body, new RegExp(`error-${codigo}\\.webp`), `/_errores/${codigo} sin su ilustración`);
      assert.match(r.body, /name="robots" content="noindex"/, `/_errores/${codigo} indexable`);
    }
  });

  await t.test('un código fuera del catálogo cae en el 404', async () => {
    for (const malo of ['999', '200', 'abc', '-1']) {
      const r = await c.get(`/_errores/${malo}`, { headers: COMO_NAVEGADOR });
      assert.equal(r.status, 404, `/_errores/${malo} debería ser 404`);
    }
  });

  await t.test('las ilustraciones se sirven de verdad', async () => {
    /* Una imagen rota justo en la pantalla de error es el peor sitio para
       tenerla: es cuando el usuario ya duda de que el sitio funcione. */
    for (const codigo of [401, 403, 404, 500, 503]) {
      const res = await fetch(`${ctx.base}/media/error-${codigo}.webp`);
      assert.equal(res.status, 200, `falta /media/error-${codigo}.webp`);
      assert.match(res.headers.get('content-type') || '', /image/);
    }
  });
});

test('un fallo real acaba en la pantalla del 500', async (t) => {
  /* Un fallo DE VERDAD, no una ruta de mentira: se cierra la base bajo los pies
     del servidor y se pide una página que consulta. La promesa rechazada la
     recoge el envoltorio `envolver` de server-pg.js y acaba en el manejador
     final — el camino exacto que recorre un 500 en producción, incluido el
     tramo que la vista previa NO pasa. */
  const ctx = await levantarServidor();
  const base = ctx.base;
  ctx.db.close();
  t.after(() => {
    if (ctx.server.closeAllConnections) ctx.server.closeAllConnections();
    ctx.server.close();
    ctx.statsDb.close();   // la db ya está cerrada; cerrarla dos veces lanza
  });

  await t.test('el navegador ve la pantalla con un código de incidencia', async () => {
    const res = await fetch(base + '/vehiculos', { headers: COMO_NAVEGADOR });
    const html = await res.text();
    assert.equal(res.status, 500);
    assert.match(html, /err-pantalla/);
    assert.match(html, /Error interno del servidor/);
    assert.match(html, /error-500\.webp/);
    /* El código es lo que el usuario dicta por teléfono y nosotros buscamos en
       el log. Ocho caracteres, sin vocales para que no salga ninguna palabra. */
    const m = html.match(/Código de incidencia: <code>([A-Z0-9]{8})<\/code>/);
    assert.ok(m, 'la pantalla del 500 salió sin código de incidencia');
    assert.doesNotMatch(m[1], /[AEIOU]/, 'el código trae vocales: se confundirá al deletrearlo');
  });

  await t.test('un cliente de API recibe JSON con el mismo código', async () => {
    const res = await fetch(base + '/api/vehicles', { headers: { accept: 'application/json' } });
    const cuerpo = await res.json();
    assert.equal(res.status, 500);
    assert.equal(cuerpo.error, 'Error interno');
    assert.match(cuerpo.incidencia, /^[A-Z0-9]{8}$/);
  });

  await t.test('el detalle interno del fallo nunca sale al cliente', async () => {
    /* Un stack o el mensaje de la base en la respuesta es una fuga: dice qué
       motor corre, qué archivo y a veces qué consulta falló. */
    for (const [accept, ruta] of [['text/html', '/vehiculos'], ['application/json', '/api/vehicles']]) {
      const res = await fetch(base + ruta, { headers: { accept } });
      const texto = await res.text();
      assert.ok(!/database connection is not open/i.test(texto), `se filtró el mensaje del motor (${accept})`);
      assert.ok(!/at .*server-pg\.js:\d+/.test(texto), `se filtró un stack trace (${accept})`);
      /* SELECT…FROM, no "select" a secas: la pantalla trae dentro toda la hoja
         de estilos del sitio, y ahí `select` es un SELECTOR CSS. Buscar la
         palabra suelta daba positivo con `.conv-entrada select { … }`. */
      assert.ok(!/\bSELECT\b[\s\S]{0,120}?\bFROM\b/i.test(texto), `se filtró una consulta SQL (${accept})`);
    }
  });
});
