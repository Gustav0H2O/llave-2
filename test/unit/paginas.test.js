'use strict';
/* ============================================================================
   Pruebas de lib/paginas.js — las páginas institucionales y legales.

   Lo que se protege aquí son dos cosas concretas:

   1. PUREZA CON PARÁMETROS. El texto interpola el dueño del sitio, el correo de
      contacto, la fecha legal y la URL base, y esos valores salen de
      process.env — algo que lib/ NO puede leer. Si alguien volviera a meter
      process.env dentro de este módulo, la regla de pureza se lo lleva por
      delante, pero estas pruebas avisan antes en la suite unitaria.

   2. QUE TODO DATO INTERPOLADO PASE POR esc(). Aquí se inyecta un esc de prueba
      que marca lo que toca: si un día se borra una llamada a esc() alrededor
      del correo o del nombre del dueño, el marcador deja de aparecer y la
      prueba cae. Es la única defensa real contra un XSS en páginas que el
      visitante abre desde el pie legal.
   ========================================================================= */

const test = require('node:test');
const assert = require('node:assert');
const { paginasDe, h2, p, ul } = require('../../lib/paginas');

const SLUGS = ['acerca-de', 'contacto', 'privacidad', 'terminos'];
const ETIQUETAS = ['Acerca de', 'Contacto', 'Privacidad', 'Términos y aviso técnico'];

const DATOS = {
  esc: (s) => `[[${String(s)}]]`,
  siteOwner: 'Taller & Cía',
  contactEmail: 'contacto@llave.test',
  legalUpdated: '1 de enero de 2026',
  baseUrl: 'https://llave.test',
};

test('lib/paginas.js — las cuatro páginas', async (t) => {
  const paginas = paginasDe(DATOS);

  await t.test('son cuatro, en el orden del pie legal', () => {
    assert.deepEqual(paginas.map(pg => pg.slug), SLUGS);
    assert.deepEqual(paginas.map(pg => pg.label), ETIQUETAS);
  });

  await t.test('cada página trae la forma que consume el enrutado', () => {
    for (const pg of paginas) {
      for (const campo of ['slug', 'label', 'title', 'description', 'h1', 'html']) {
        assert.equal(typeof pg[campo], 'string', `${pg.slug}: ${campo} debe ser texto`);
        assert.ok(pg[campo].trim().length > 0, `${pg.slug}: ${campo} vacío`);
      }
      assert.ok(pg.title.endsWith('| llave'), `${pg.slug}: el title debe llevar la marca`);
      assert.ok(pg.html.includes('<p'), `${pg.slug}: el cuerpo debe ser HTML`);
    }
  });

  await t.test('los datos legales se muestran en privacidad y términos', () => {
    const privacidad = paginas.find(pg => pg.slug === 'privacidad');
    const terminos = paginas.find(pg => pg.slug === 'terminos');
    assert.ok(privacidad.html.includes('1 de enero de 2026'), 'privacidad sin fecha de actualización');
    assert.ok(terminos.html.includes('1 de enero de 2026'), 'términos sin fecha de actualización');
  });
});

test('lib/paginas.js — cada valor del entorno se interpola por esc()', async (t) => {
  const paginas = paginasDe(DATOS);

  await t.test('el dueño se escapa donde aparece', () => {
    const acerca = paginas.find(pg => pg.slug === 'acerca-de');
    assert.ok(acerca.html.includes('[[Taller & Cía]]'), 'el dueño debe pasar por el esc inyectado');
  });

  await t.test('el correo de contacto se escapa en el enlace y en el texto', () => {
    const contacto = paginas.find(pg => pg.slug === 'contacto');
    assert.ok(contacto.html.includes('mailto:[[contacto@llave.test]]'));
    assert.ok(contacto.html.includes('>[[contacto@llave.test]]</a>'));
  });

  await t.test('la URL base se escapa', () => {
    const privacidad = paginas.find(pg => pg.slug === 'privacidad');
    assert.ok(privacidad.html.includes('[[https://llave.test]]'));
  });

  await t.test('el esc inyectado se usa de verdad (no hay valores cocinados)', () => {
    const llamadas = [];
    paginasDe({ ...DATOS, esc: (s) => { llamadas.push(s); return String(s); } });
    for (const valor of ['Taller & Cía', 'contacto@llave.test', 'https://llave.test']) {
      assert.ok(llamadas.includes(valor), `esc() nunca recibió ${valor}`);
    }
  });
});

test('lib/paginas.js — el esc por defecto y el comportamiento sin datos', async (t) => {
  await t.test('sin argumentos devuelve las cuatro páginas sin reventar', () => {
    assert.deepEqual(paginasDe().map(pg => pg.slug), SLUGS);
  });

  await t.test('por defecto usa el esc de lib/pure.js: no deja pasar el HTML crudo', () => {
    const html = paginasDe({ siteOwner: '<b>no</b> & co' })
      .find(pg => pg.slug === 'acerca-de').html;
    assert.ok(html.includes('&lt;b&gt;no&lt;/b&gt; &amp; co'), 'se escapó mal');
    assert.ok(!html.includes('<b>no</b>'), 'el dato crudo llegó al HTML');
  });
});

test('lib/paginas.js — los ayudantes de marcado', async (t) => {
  await t.test('h2 y p llevan los estilos del sitio', () => {
    assert.equal(h2('Título'), '<h2 style="font-size:17px;color:var(--accent);margin-top:26px;margin-bottom:8px">Título</h2>');
    assert.equal(p('Texto'), '<p style="color:var(--text-alt);margin-bottom:10px">Texto</p>');
  });

  await t.test('ul arma una viñeta por elemento y vacío no deja <li> sueltos', () => {
    assert.equal(ul(['a', 'b']), '<ul style="color:var(--text-alt);padding-left:20px;margin-bottom:10px;line-height:1.7"><li>a</li><li>b</li></ul>');
    assert.equal(ul([]), '<ul style="color:var(--text-alt);padding-left:20px;margin-bottom:10px;line-height:1.7"></ul>');
  });
});
