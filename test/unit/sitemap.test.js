'use strict';
/* Pruebas de lib/sitemap.js (2.37 y 2.40): orden estable, sin repetidas, tope
   de 10 000 URLs y <lastmod> en el XML. Puro: no se levanta ningún servidor ni
   se abre ninguna base. */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { LIMITE_URLS, fechaSitemap, urlsDelSitemap, xmlDelSitemap } = require('../../lib/sitemap');

const BASE = 'https://fueltech-master.onrender.com';

describe('urlsDelSitemap — orden, unicidad y tope (2.40)', () => {
  it('las páginas fijas van primero y las fichas de vehículo al final', () => {
    const locs = urlsDelSitemap({
      base: BASE, paginas: ['acerca-de', 'contacto'], guias: ['presion-baja'],
      talleres: ['taller-central'], vehiculos: ['nissan-tsuru-1992-2017-42'],
    });
    assert.deepEqual(locs.slice(0, 5), [
      `${BASE}/`, `${BASE}/vehiculos`, `${BASE}/guias`, `${BASE}/acerca-de`, `${BASE}/contacto`,
    ]);
    assert.equal(locs[locs.length - 1], `${BASE}/vehiculo/nissan-tsuru-1992-2017-42`);
  });

  it('no repite URLs aunque un slug de taller choque con una página legal', () => {
    const locs = urlsDelSitemap({ base: BASE, paginas: ['privacidad'], talleres: ['privacidad'] });
    assert.equal(locs.filter(u => u === `${BASE}/privacidad`).length, 1);
    assert.equal(locs.length, 5, `${locs.length} URLs: la repetida no se coló`);
  });

  it('trunca a 10 000 URLs de forma determinista: mismo resultado y solo el final se cae', () => {
    const vehiculos = Array.from({ length: LIMITE_URLS + 500 }, (_, i) => `ficha-${i + 1}`);
    const a = urlsDelSitemap({ base: BASE, vehiculos });
    const b = urlsDelSitemap({ base: BASE, vehiculos });
    assert.equal(a.length, LIMITE_URLS, `debería quedarse en ${LIMITE_URLS}, hay ${a.length}`);
    assert.deepEqual(a, b, 'dos llamadas con la misma entrada tienen que dar el mismo archivo');
    assert.equal(a[3], `${BASE}/vehiculo/ficha-1`, 'el recorte se come el final, nunca el principio');
    assert.equal(a[a.length - 1], `${BASE}/vehiculo/ficha-9997`);
    assert.equal(a.includes(`${BASE}/vehiculo/ficha-10001`), false);
  });

  it('el tope se puede bajar para probarlo y nunca devuelve más de lo pedido', () => {
    assert.equal(urlsDelSitemap({ base: BASE, vehiculos: ['a', 'b', 'c'], limite: 2 }).length, 2);
    assert.deepEqual(urlsDelSitemap({ base: BASE, limite: 0 }), []);
  });

  it('sin argumentos devuelve solo las tres páginas fijas y no revienta', () => {
    const locs = urlsDelSitemap();
    assert.equal(locs.length, 3);
    assert.equal(locs[0], '/');
  });

  it('una barra final en BASE_URL no duplica la barra de las rutas', () => {
    assert.equal(urlsDelSitemap({ base: BASE + '/' , guias: ['x'] })[3], `${BASE}/guia/x`);
  });
});

describe('xmlDelSitemap — XML válido con <lastmod> (2.37)', () => {
  it('cada URL sale con su <lastmod> en formato de fecha ISO', () => {
    const xml = xmlDelSitemap([`${BASE}/`, `${BASE}/vehiculos`], new Date('2026-09-11T12:00:00Z'));
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.equal((xml.match(/<loc>/g) || []).length, 2);
    assert.equal((xml.match(/<lastmod>2026-09-11<\/lastmod>/g) || []).length, 2);
  });

  it('escapa los ampersands: un & sin escapar invalida el archivo', () => {
    const xml = xmlDelSitemap([`${BASE}/vehiculo/a?x=1&y=2`], '2026-09-11');
    assert.match(xml, /a\?x=1&amp;y=2/);
    assert.equal(/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(xml), false);
  });

  it('una fecha ilegible deja el XML sin <lastmod> en vez de con una fecha inválida', () => {
    assert.equal(fechaSitemap('no es una fecha'), '');
    assert.equal(fechaSitemap(undefined), '');
    const xml = xmlDelSitemap([`${BASE}/`], 'no es una fecha');
    assert.equal(/<lastmod>/.test(xml), false);
    assert.match(xml, /<loc>https:\/\/fueltech-master\.onrender\.com\/<\/loc><\/url>/);
  });

  it('fechaSitemap acepta Date y cadenas', () => {
    assert.equal(fechaSitemap(new Date('2026-01-02T03:04:05Z')), '2026-01-02');
    assert.equal(fechaSitemap('2026-01-02T03:04:05Z'), '2026-01-02');
  });
});
