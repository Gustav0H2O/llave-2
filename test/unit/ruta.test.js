'use strict';
/* ============================================================================
   Pruebas de lib/ruta.js — la ruta de diagnóstico.

   Lo que se protege aquí no es "que salga HTML": es que los números que la
   página le enseña al mecánico salgan del texto de las guías y no de una
   constante que alguien copió un día. Si mañana se reescribe una guía y la
   duración deja de moverse, estas pruebas son las que avisan.
   ========================================================================= */

const test = require('node:test');
const assert = require('node:assert');
const { MODULOS, NIVEL, minutosDe, pasosDe, moduloDe, nivelDe, metaDe, paginaRuta, paginaGuia, jsonLdRuta } = require('../../lib/ruta');

/* Guías de mentira, con la misma forma que las de server-pg.js. Deliberadamente
   NO se importan las reales: estas pruebas comprueban el motor, no el temario.
   Nueve, porque el reparto en módulos es de tres en tres. */
const guia = (n, palabras, pasos, faq) => ({
  slug: 'guia-' + n,
  h1: 'Título ' + n,
  description: 'Descripción de la guía ' + n,
  html: `<p>${'palabra '.repeat(palabras)}</p><ol>${'<li>paso</li>'.repeat(pasos)}</ol>`,
  faq: Array.from({ length: faq }, (_, i) => ({ q: 'Pregunta ' + i, a: 'Respuesta ' + i })),
});
const NUEVE = Array.from({ length: 9 }, (_, i) => guia(i + 1, 340, 3, 2));

test('lib/ruta.js — la duración se cuenta del texto, no se declara', async (t) => {
  await t.test('340 palabras a 170 ppm son 2 minutos', () => {
    assert.equal(minutosDe(guia(1, 340, 0, 0).html), 2);
  });

  await t.test('el doble de texto tarda el doble', () => {
    assert.equal(minutosDe(guia(1, 1700, 0, 0).html), 10);
  });

  await t.test('las etiquetas HTML no cuentan como palabras', () => {
    const conMarcado = '<p><strong>una</strong> <em>dos</em> <a href="/x">tres</a></p>';
    assert.equal(minutosDe(conMarcado), minutosDe('una dos tres'));
  });

  await t.test('una guía cortísima nunca anuncia menos de 2 min', () => {
    assert.equal(minutosDe('<p>hola</p>'), 2);
    assert.equal(minutosDe(''), 2);
  });

  await t.test('los pasos son los <li> reales del texto', () => {
    assert.equal(pasosDe(guia(1, 10, 7, 0).html), 7);
    assert.equal(pasosDe('<p>sin lista</p>'), 0);
  });
});

test('lib/ruta.js — el reparto en módulos', async (t) => {
  await t.test('van de tres en tres, en el orden en que están escritas', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map(moduloDe), [0, 0, 0, 1, 1, 1, 2, 2, 2]);
  });

  await t.test('una guía número diez cae en el último módulo, no fuera del array', () => {
    assert.equal(moduloDe(9), MODULOS.length - 1);
    assert.equal(moduloDe(50), MODULOS.length - 1);
  });

  await t.test('hay tres módulos y todos tienen título y resumen', () => {
    assert.equal(MODULOS.length, 3);
    for (const [titulo, resumen] of MODULOS) {
      assert.ok(titulo.length > 3, 'el módulo necesita título');
      assert.ok(resumen.length > 20, 'el módulo necesita un resumen que explique de qué va');
    }
  });
});

test('lib/ruta.js — el nivel es editorial y tiene respaldo por defecto', async (t) => {
  await t.test('solo hay tres niveles declarados', () => {
    const valores = [...new Set(Object.values(NIVEL))].sort();
    assert.deepEqual(valores, ['Avanzado', 'Básico', 'Intermedio']);
  });

  await t.test('una guía sin nivel declarado no rompe la página: cae en Básico', () => {
    assert.equal(nivelDe('slug-que-no-existe'), 'Básico');
  });

  await t.test('solo el nivel avanzado se colorea; los otros van en neutro', () => {
    assert.ok(metaDe({ slug: 'voltaje-circuito-bomba-de-gasolina', html: '<p>x</p>', faq: [] }).includes('avanzado'));
    assert.ok(!metaDe({ slug: 'sintomas-bomba-de-gasolina-fallando', html: '<p>x</p>', faq: [] }).includes('avanzado'));
  });

  await t.test('la fila de metadatos pone el nivel antes que el coste', () => {
    const fila = metaDe(guia(1, 340, 3, 2));
    assert.ok(fila.indexOf('Básico') < fila.indexOf('min'), 'el nivel responde "¿es para mí?" y va primero');
  });

  await t.test('lo que no existe no se anuncia', () => {
    const sinNada = metaDe({ slug: 'x', html: '<p>hola</p>', faq: [] });
    assert.ok(!sinNada.includes('pasos'));
    assert.ok(!sinNada.includes('preguntas'));
  });
});

test('lib/ruta.js — la página de la ruta', async (t) => {
  const html = paginaRuta(NUEVE, '<em>marca</em>');

  await t.test('lleva el lockup que le pasan', () => {
    assert.ok(html.includes('<em>marca</em>'));
  });

  await t.test('están las nueve guías, cada una enlazada a su URL', () => {
    for (const g of NUEVE) assert.ok(html.includes(`href="/guia/${g.slug}"`), 'falta ' + g.slug);
  });

  await t.test('hay exactamente un h1 y tres h2 de módulo', () => {
    assert.equal((html.match(/<h1/g) || []).length, 1);
    assert.equal((html.match(/class="ruta-modulo-t"/g) || []).length, 3);
  });

  await t.test('las cifras de cabecera son la suma real del temario', () => {
    assert.ok(html.includes('<b>9</b>'), 'nueve guías');
    assert.ok(html.includes(`<b>${NUEVE.reduce((a, g) => a + minutosDe(g.html), 0)} min</b>`));
    assert.ok(html.includes(`<b>${9 * 3}</b>`), '27 pasos');
    assert.ok(html.includes(`<b>${9 * 2}</b>`), '18 preguntas');
  });

  await t.test('un módulo vacío no imprime una sección hueca', () => {
    const solo2 = paginaRuta(NUEVE.slice(0, 2));
    assert.equal((solo2.match(/class="ruta-modulo-t"/g) || []).length, 1);
  });
});

test('lib/ruta.js — la página de una guía', async (t) => {
  const primera = paginaGuia(NUEVE[0], NUEVE);
  const ultima = paginaGuia(NUEVE[8], NUEVE);

  await t.test('dice por dónde vas', () => {
    assert.ok(primera.includes('Guía 1 de 9'));
    assert.ok(ultima.includes('Guía 9 de 9'));
  });

  await t.test('la barra de progreso avanza con la posición', () => {
    assert.ok(primera.includes('width:11%'), '1 de 9 ≈ 11%');
    assert.ok(ultima.includes('width:100%'));
  });

  await t.test('cada guía apunta a la siguiente, menos la última', () => {
    assert.ok(primera.includes('href="/guia/guia-2"'));
    assert.ok(primera.includes('cap-siguiente'));
    assert.ok(!ultima.includes('cap-siguiente'), 'la última no puede prometer una décima guía');
    assert.ok(ultima.includes('cap-fin'));
  });

  await t.test('las preguntas se imprimen, no solo se le sirven al buscador', () => {
    assert.ok(primera.includes('Pregunta 0'));
    assert.ok(primera.includes('Respuesta 0'));
  });

  await t.test('una guía sin preguntas no imprime una sección vacía', () => {
    assert.ok(!paginaGuia(guia(1, 100, 2, 0), [guia(1, 100, 2, 0)]).includes('cap-faq'));
  });

  await t.test('el cuerpo de la guía va sin escapar: es HTML de autor', () => {
    assert.ok(primera.includes('<ol>'), 'si se escapara saldría &lt;ol&gt; en pantalla');
  });

  await t.test('los títulos SÍ se escapan', () => {
    const hostil = { slug: 'x', h1: '<script>alert(1)</script>', description: 'd', html: '<p>a</p>', faq: [] };
    const salida = paginaGuia(hostil, [hostil]);
    assert.ok(!salida.includes('<script>alert(1)</script>'));
    assert.ok(salida.includes('&lt;script&gt;'));
  });
});

test('lib/ruta.js — el JSON-LD de la ruta', async (t) => {
  const ld = jsonLdRuta(NUEVE, 'https://ejemplo.test');

  await t.test('es un ItemList con las nueve en su orden real', () => {
    assert.equal(ld['@type'], 'ItemList');
    assert.equal(ld.numberOfItems, 9);
    assert.deepEqual(ld.itemListElement.map(x => x.position), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  await t.test('las URL son absolutas: el buscador no resuelve relativas aquí', () => {
    assert.equal(ld.itemListElement[0].url, 'https://ejemplo.test/guia/guia-1');
  });

  await t.test('parsea como JSON, que es lo único que el robot recorrido exige', () => {
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(ld)));
  });
});
