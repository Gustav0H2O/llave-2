'use strict';
/* ============================================================================
   Pruebas de lib/guias.js — el temario editorial.

   Lo que se protege aquí no es "que haya nueve guías": es que el temario siga
   siendo COHERENTE consigo mismo, porque cada guía enlaza a las demás y al
   catálogo. Un slug renombrado a medias no rompe el arranque —rompe el enlace
   interno y la ruta de diagnóstico que se sirve en /guias—, y eso es lo que
   estas pruebas detectan sin levantar el servidor.

   Además se fija la FORMA del dato: de ella dependen lib/ruta.js (paginaRuta,
   paginaGuia, jsonLdRuta), lib/portada.js y el sitemap.xml.
   ========================================================================= */

const test = require('node:test');
const assert = require('node:assert');
const { GUIDES } = require('../../lib/guias');

/* El orden es editorial: va del síntoma a la pila puesta (DESIGN.md §0c), así
   que se declara tal cual en vez de ordenarlo. Un guía nueva obliga a decidir
   dónde entra. */
const SLUGS = [
  'sintomas-bomba-de-gasolina-fallando',
  'como-medir-la-presion-de-combustible',
  'presion-de-combustible-baja',
  'presion-de-combustible-alta',
  'regulador-de-presion-de-combustible',
  'voltaje-circuito-bomba-de-gasolina',
  'inyeccion-gdi-vs-mfi-presion',
  'como-cambiar-la-pila-de-gasolina',
  'que-pila-de-gasolina-le-queda-a-mi-carro',
];

test('lib/guias.js — el temario y su orden', async (t) => {
  await t.test('son nueve guías, en el orden de la ruta', () => {
    assert.deepEqual(GUIDES.map(g => g.slug), SLUGS);
  });

  await t.test('no hay slugs repetidos ni fuera de kebab-case', () => {
    assert.equal(new Set(GUIDES.map(g => g.slug)).size, GUIDES.length);
    for (const g of GUIDES) {
      assert.match(g.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `slug raro: ${g.slug}`);
    }
  });
});

test('lib/guias.js — la forma de cada guía', async (t) => {
  await t.test('trae todos los campos que consumen las páginas', () => {
    for (const g of GUIDES) {
      for (const campo of ['slug', 'label', 'title', 'description', 'h1', 'html']) {
        assert.equal(typeof g[campo], 'string', `${g.slug}: ${campo} debe ser texto`);
        assert.ok(g[campo].trim().length > 0, `${g.slug}: ${campo} vacío`);
      }
    }
  });

  await t.test('el title y la description dicen de qué va la guía, no relleno', () => {
    for (const g of GUIDES) {
      assert.ok(g.title.endsWith('| llave'), `${g.slug}: el title debe llevar la marca`);
      assert.ok(g.description.length > 60, `${g.slug}: la meta description es demasiado corta para el buscador`);
      assert.ok(g.h1.length >= 8, `${g.slug}: falta el h1`);
    }
  });

  await t.test('el html es marcado de autor (trae etiquetas reales)', () => {
    for (const g of GUIDES) {
      assert.ok(g.html.includes('<p'), `${g.slug}: el cuerpo debe ser HTML`);
      assert.ok((g.html.match(/<h2/g) || []).length >= 1, `${g.slug}: sin encabezado de sección`);
    }
  });

  await t.test('cada faq es { q, a } con texto', () => {
    for (const g of GUIDES) {
      assert.ok(Array.isArray(g.faq) && g.faq.length >= 1, `${g.slug}: sin preguntas frecuentes`);
      for (const f of g.faq) {
        assert.deepEqual(Object.keys(f).sort(), ['a', 'q'], `${g.slug}: la faq debe ser exactamente { q, a }`);
        assert.ok(f.q.trim().length > 8, `${g.slug}: pregunta demasiado corta`);
        assert.ok(f.a.trim().length > 8, `${g.slug}: respuesta demasiado corta`);
      }
    }
  });
});

test('lib/guias.js — los enlaces internos apuntan a sitios que existen', async (t) => {
  const enlaces = (html) => [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);

  await t.test('ninguna guía enlaza a una guía que no está en el temario', () => {
    for (const g of GUIDES) {
      for (const href of enlaces(g.html)) {
        const m = href.match(/^\/guia\/([a-z0-9-]+)$/);
        if (m) assert.ok(SLUGS.includes(m[1]), `${g.slug} enlaza a /guia/${m[1]}, que no existe`);
      }
    }
  });

  await t.test('ninguna guía queda huérfana: todas enlazan a otra página interna', () => {
    for (const g of GUIDES) {
      const internos = enlaces(g.html).filter(href => href.startsWith('/'));
      assert.ok(internos.length >= 1, `${g.slug}: sin ningún enlace interno (queda como punto final)`);
    }
  });

  await t.test('el temario empuja al catálogo del vehículo', () => {
    assert.ok(GUIDES.some(g => enlaces(g.html).includes('/vehiculos')),
      'ninguna guía lleva al dato concreto del vehículo');
  });

  await t.test('los enlaces internos son relativos: no se clava el dominio', () => {
    for (const g of GUIDES) {
      for (const href of enlaces(g.html)) {
        if (href.startsWith('/')) assert.ok(!/^\/\//.test(href), `${g.slug}: enlace protocolo-relativo`);
      }
    }
  });
});
