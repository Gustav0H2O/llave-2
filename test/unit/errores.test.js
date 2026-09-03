'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { paginaError, ERRORES, codigosDeError } = require('../../lib/errores');

const RAIZ = path.join(__dirname, '..', '..');
const CONTACTO = 'soporte@ejemplo.com';

test('pantallas de error', async (t) => {

  await t.test('cubre los cinco códigos que ve un navegador', () => {
    assert.deepEqual(codigosDeError().sort((a, b) => a - b), [401, 403, 404, 500, 503]);
  });

  await t.test('cada pantalla trae ilustración, alt, textos y al menos una salida', () => {
    for (const [codigo, e] of Object.entries(ERRORES)) {
      assert.ok(e.imagen.startsWith('/media/error-'), `${codigo}: ilustración con ruta rara`);
      /* El alt no es decoración: la ilustración ES el mensaje de estas
         pantallas, y sin descripción quien usa lector de pantalla recibe una
         página medio vacía. */
      assert.ok(e.alt && e.alt.length > 30, `${codigo}: alt ausente o demasiado corto`);
      for (const campo of ['titulo', 'lema', 'detalle', 'ayuda']) {
        assert.ok(e[campo] && e[campo].trim(), `${codigo}: falta ${campo}`);
      }
      assert.ok(e.acciones.length >= 1, `${codigo}: sin ninguna salida`);
      // exactamente una acción principal: dos botones destacados no guían a nadie
      assert.equal(e.acciones.filter(a => a[2]).length, 1, `${codigo}: debe haber UNA acción principal`);
    }
  });

  await t.test('los archivos de las ilustraciones existen de verdad', () => {
    /* Una imagen rota en la pantalla de error es el peor sitio para tenerla:
       es justo cuando el usuario ya desconfía de que el sitio funcione. */
    for (const [codigo, e] of Object.entries(ERRORES)) {
      const archivo = path.join(RAIZ, 'public', e.imagen.replace(/^\//, ''));
      assert.ok(fs.existsSync(archivo), `${codigo}: no existe ${e.imagen}`);
      assert.ok(fs.statSync(archivo).size > 1024, `${codigo}: ${e.imagen} está vacío o truncado`);
    }
  });

  await t.test('pinta el código, el titular y la vía de contacto', () => {
    const html = paginaError({ codigo: 500, contacto: CONTACTO, incidencia: 'ABC12345' });
    assert.match(html, /class="err-codigo"[^>]*>500</);
    assert.match(html, /Error interno del servidor/);
    assert.match(html, /ABC12345/);
    assert.match(html, new RegExp(`mailto:${CONTACTO}`));
  });

  await t.test('sin contacto no inventa un mailto vacío', () => {
    const html = paginaError({ codigo: 404 });
    assert.ok(!html.includes('mailto:'), 'pintó un mailto sin tener dirección');
  });

  await t.test('un código desconocido cae en el 404, no en una página en blanco', () => {
    const html = paginaError({ codigo: 418 });
    assert.match(html, /class="err-codigo"[^>]*>404</);
    assert.match(html, /Página no encontrada/);
  });

  await t.test('"Reintentar" apunta a la ruta que falló, y desaparece si no la hay', () => {
    /* El primer intento usaba `#reintentar`: un ancla inexistente, o sea un
       botón que no hacía nada en la única pantalla donde reintentar es la
       acción que el usuario quiere. */
    const con = paginaError({ codigo: 500, ruta: '/api/algo?x=1' });
    assert.match(con, /href="\/api\/algo\?x=1"[^>]*>Reintentar</);
    assert.ok(!con.includes('#reintentar'));

    const sin = paginaError({ codigo: 500 });
    assert.ok(!sin.includes('Reintentar'), 'dejó un Reintentar sin destino');
    assert.match(sin, /Volver al inicio/, 'se quedó sin ninguna salida');
  });

  await t.test('la ruta pedida solo se enseña en el 404', () => {
    /* En un 403 sería decirle a quien no debe entrar qué hay detrás; en un 500
       no es nada que el usuario pueda usar. */
    assert.match(paginaError({ codigo: 404, ruta: '/no-existe' }), /err-ruta/);
    for (const codigo of [401, 403, 500, 503]) {
      assert.ok(!paginaError({ codigo, ruta: '/zona-secreta' }).includes('err-ruta'),
        `${codigo} filtró la ruta pedida`);
    }
  });

  await t.test('escapa el HTML de todo lo que viene de fuera', () => {
    const html = paginaError({
      codigo: 404,
      ruta: '/<script>alert(1)</script>',
      contacto: '"><img src=x onerror=alert(1)>',
      incidencia: '<b>x</b>',
    });
    assert.ok(!html.includes('<script>alert(1)</script>'), 'XSS por la ruta');
    assert.ok(!html.includes('<img src=x'), 'XSS por el contacto');
    assert.ok(!html.includes('<b>x</b>'), 'XSS por la incidencia');
    assert.match(html, /&lt;script&gt;/);
  });

  await t.test('el lockup de marca se inyecta tal cual lo da quien llama', () => {
    // Es HTML de la propia casa (lo arma server-pg.js), no entrada del usuario.
    const html = paginaError({ codigo: 404, lockup: '<img src="/brand/logo-llave.svg" alt="llave">' });
    assert.match(html, /err-marca/);
    assert.match(html, /logo-llave\.svg/);
    assert.ok(!paginaError({ codigo: 404 }).includes('err-marca'), 'pintó la caja de marca vacía');
  });

  await t.test('no repite presiones del taller (AGENTS.md §2)', () => {
    for (const codigo of codigosDeError()) {
      const texto = paginaError({ codigo, contacto: CONTACTO }).replace(/<[^>]+>/g, ' ');
      assert.ok(!/\bPSI\b/.test(texto), `${codigo}: apareció una presión en la pantalla de error`);
    }
  });
});
