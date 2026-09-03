'use strict';
/* ============================================================================
   Pruebas de lib/portada.js — la portada «/» sin JavaScript.

   Lo que se protege aquí no es "que salga HTML": es que «/» siga siendo una
   página RASTREABLE. La auditoría del 26-08-2026 la encontró con 4 palabras,
   cero encabezados y un solo enlace interno, porque todo lo pintaba React.
   Si mañana alguien vacía este módulo "porque no se ve en pantalla", estas
   pruebas son las que avisan de que se volvió al mismo sitio.
   ========================================================================= */

const test = require('node:test');
const assert = require('node:assert');
const { paginaPortada } = require('../../lib/portada');

const GUIAS = Array.from({ length: 9 }, (_, i) => ({ slug: 'guia-' + i, label: 'Guía ' + i }));
const VEHICULOS = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1, brand: 'Marca' + i, model: 'Modelo' + i, year_from: 2010 + i, year_to: 2015 + i,
}));
const DATOS = { totalVeh: 208, totalMar: 33, vehiculos: VEHICULOS, guias: GUIAS, lockup: '<img src="/brand/logo-dark.png" alt="FuelTech Master">' };

/* Texto visible tal como lo cuenta un rastreador: fuera etiquetas y entidades. */
const palabrasDe = (html) => html
  .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ')
  .split(/\s+/).filter(w => /[\wáéíóúñÁÉÍÓÚÑ]/.test(w)).length;

test('lib/portada.js — la portada es rastreable sin ejecutar JavaScript', async (t) => {
  const html = paginaPortada(DATOS);

  await t.test('hay exactamente un <h1>', () => {
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  });

  await t.test('hay encabezados de sección y de paso, sin saltar niveles', () => {
    assert.ok((html.match(/<h2[\s>]/g) || []).length >= 5, 'se esperaban al menos cinco <h2>');
    assert.ok((html.match(/<h3[\s>]/g) || []).length >= 3, 'se esperaban al menos tres <h3>');
    /* El primer encabezado del documento tiene que ser el h1: un h2 por delante
       deja la página sin raíz para el buscador y para el lector de pantalla. */
    assert.equal((html.match(/<h([1-6])[\s>]/) || [])[1], '1');
  });

  await t.test('supera con margen las 250 palabras que pide una página útil', () => {
    assert.ok(palabrasDe(html) > 250, 'solo ' + palabrasDe(html) + ' palabras');
  });

  await t.test('hay párrafos de verdad, no solo listas', () => {
    assert.ok((html.match(/<p[\s>]/g) || []).length >= 10);
  });
});

test('lib/portada.js — enlaces internos', async (t) => {
  const html = paginaPortada(DATOS);

  await t.test('enlaza el catálogo y la ruta de diagnóstico', () => {
    assert.ok(html.includes('href="/vehiculos"'));
    assert.ok(html.includes('href="/guias"'));
  });

  await t.test('enlaza cada guía recibida', () => {
    for (const g of GUIAS) assert.ok(html.includes('href="/guia/' + g.slug + '"'), 'falta ' + g.slug);
  });

  await t.test('enlaza cada vehículo de la muestra', () => {
    assert.equal((html.match(/href="\/vehiculo\//g) || []).length, VEHICULOS.length);
  });

  await t.test('sin datos sigue siendo HTML válido y con h1', () => {
    const vacio = paginaPortada();
    assert.ok(vacio.includes('<h1'));
    assert.ok(!vacio.includes('undefined'), 'un dato ausente no puede imprimirse como «undefined»');
  });
});

test('lib/portada.js — los datos se escapan y los conteos salen de la base', async (t) => {
  await t.test('una marca hostil no inyecta HTML', () => {
    const html = paginaPortada({
      ...DATOS,
      vehiculos: [{ id: 1, brand: '<script>alert(1)</script>', model: '"><b>x', year_from: 2000, year_to: 2005 }],
    });
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  /* Antes esta prueba fijaba lo contrario: que el conteo del catálogo saliera
     en la prosa. La portada dejó de prometer cifras —"N vehículos de M marcas",
     "las N guías"— porque el catálogo sube y baja con el alta de vehículos y
     una promesa numérica en la página de entrada envejece sola. La prueba
     cambia de signo: ahora vigila que no vuelvan a colarse. */
  await t.test('la prosa no promete un conteo del catálogo', () => {
    const html = paginaPortada({ ...DATOS, totalVeh: 999, totalMar: 77 });
    const texto = html.replace(/<[^>]+>/g, ' ');
    assert.ok(!/\d+\s+vehículos/.test(texto), 'apareció un conteo de vehículos en la portada');
    assert.ok(!/\d+\s+marcas/.test(texto), 'apareció un conteo de marcas en la portada');
    assert.ok(!/\d+\s+guías/.test(texto), 'apareció un conteo de guías en la portada');
    // y sigue enlazando a las dos secciones, que es lo que sí importa
    assert.ok(html.includes('href="/vehiculos"'));
    assert.ok(html.includes('href="/guias"'));
  });

  /* AGENTS.md §2: las presiones viven SOLO en lib/domain.js. Esta prosa nombra
     los sistemas de inyección; el día que alguien le meta una cifra de riel,
     esta prueba falla antes que el guard. */
  await t.test('la prosa no repite las presiones del taller', () => {
    const html = paginaPortada(DATOS);
    const texto = html.replace(/<[^>]+>/g, ' ');
    assert.ok(!/\bPSI\s*[:=]?\s*\d/.test(texto), 'apareció una presión en PSI en la portada');
    assert.ok(!/\b\d{2}\s*[-–/]\s*\d{2}\s*PSI\b/.test(texto), 'apareció un rango de PSI en la portada');
  });
});
