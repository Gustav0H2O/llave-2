'use strict';
/* ============================================================================
   lib/ruta.js — la RUTA de diagnóstico: estructura y HTML.

   Las nueve guías del sistema de combustible no son un índice de artículos:
   son un temario que va del síntoma a la pila puesta. Servirlas como una lista
   de viñetas las hacía parecer nueve textos sueltos que empiezan y terminan
   solos. Este módulo las convierte en una ruta —módulos, orden, nivel, coste y
   "vas por la 3 de 9"—, que es el patrón con el que las plataformas de
   aprendizaje consiguen que un temario se empiece y se termine.

   Vive en lib/ y no en server-pg.js por dos razones, y las dos importan:
     · Es una función pura de (guías) → HTML. No toca base, entorno ni express,
       así que se puede probar entera sin levantar un servidor — y se prueba,
       en test/unit/ruta.test.js.
     · server-pg.js estaba a 70 líneas de su tope de 3000. Meterle un
       renderizador de páginas habría sido gastar ese margen en lo primero que
       pedía salir.

   Qué se CALCULA y qué se DECLARA, que no es lo mismo:
     · `minutosDe` y `pasosDe` leen el propio texto de la guía. Si mañana
       alguien la reescribe, la interfaz se entera sola. Un número escrito a
       mano se habría desincronizado el primer día, y en una app cuyo argumento
       entero es "el dato es correcto", un dato viejo en el cromo es peor que
       no ponerlo.
     · `NIVEL` es un juicio EDITORIAL. No se puede medir y no se finge que se
       mide: se declara aquí, a la vista, para que se discuta como lo que es.
   ========================================================================= */

const { esc } = require('./pure');

/* Los tres módulos, con el resumen que se enseña bajo el título. El reparto es
   de tres guías cada uno y sigue el orden en que están escritas: reconocer,
   afinar, resolver. */
const MODULOS = [
  ['Reconocer el síntoma', 'Qué te está diciendo el carro, cómo confirmarlo con el manómetro y qué mirar si la presión está por debajo.'],
  ['Afinar el diagnóstico', 'Presión alta, regulador y circuito eléctrico: lo que hay que descartar antes de bajar el tanque.'],
  ['Casos especiales y reemplazo', 'Sistemas GDI, cómo cambiar la pila y cómo elegir la que de verdad le entra.'],
];

const NIVEL = {
  'sintomas-bomba-de-gasolina-fallando': 'Básico',
  'como-medir-la-presion-de-combustible': 'Básico',
  'presion-de-combustible-baja': 'Intermedio',
  'presion-de-combustible-alta': 'Intermedio',
  'regulador-de-presion-de-combustible': 'Intermedio',
  'voltaje-circuito-bomba-de-gasolina': 'Avanzado',
  'inyeccion-gdi-vs-mfi-presion': 'Avanzado',
  'como-cambiar-la-pila-de-gasolina': 'Intermedio',
  'que-pila-de-gasolina-le-queda-a-mi-carro': 'Básico',
};

/* 170 palabras por minuto y no las 200 de costumbre: quien lee esto va
   parando a mirar el carro, no leyendo en un sofá. Mínimo 2 min para que una
   guía corta no anuncie "1 min" y parezca que no dice nada. */
const minutosDe = (html) => Math.max(2, Math.round(
  String(html || '').replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length / 170));

const pasosDe = (html) => (String(html || '').match(/<li>/g) || []).length;

const moduloDe = (i) => Math.min(MODULOS.length - 1, Math.max(0, Math.floor(i / 3)));

const nivelDe = (slug) => NIVEL[slug] || 'Básico';

const pastilla = (texto, clase = '') => `<em class="pill ${clase}">${esc(texto)}</em>`;

/* Nivel primero y el coste después. Es el orden correcto: "¿esto es para mí?"
   se responde antes que "¿cuánto me lleva?". */
function metaDe(g) {
  const nivel = nivelDe(g.slug);
  return pastilla(nivel, 'pill-nivel' + (nivel === 'Avanzado' ? ' avanzado' : ''))
    + pastilla(minutosDe(g.html) + ' min')
    + (pasosDe(g.html) ? pastilla(pasosDe(g.html) + ' pasos') : '')
    + (g.faq && g.faq.length ? pastilla(g.faq.length + ' preguntas') : '');
}

/* ---------------------------------------------------------------------------
   Página de la ruta (/guias)
   ------------------------------------------------------------------------ */
function paginaRuta(guides, lockup = '') {
  const total = (f) => guides.reduce((a, g) => a + f(g), 0);
  const modulos = MODULOS.map(([titulo, resumen], m) => {
    const caps = guides.filter((_, i) => moduloDe(i) === m);
    if (!caps.length) return '';
    return `<section class="ruta-modulo">
      <header class="ruta-modulo-cab">
        <span class="ruta-modulo-n">0${m + 1}</span>
        <h2 class="ruta-modulo-t">${esc(titulo)}</h2>
        <span class="ruta-modulo-meta">${caps.length} guías · ${caps.reduce((a, g) => a + minutosDe(g.html), 0)} min</span>
      </header>
      <p class="ruta-lead" style="font-size:14.5px;margin-bottom:0">${esc(resumen)}</p>
      <div class="ruta-caps">${caps.map(g => `<a class="ruta-cap" href="/guia/${esc(g.slug)}">
          <span class="ruta-cap-t">${esc(g.h1)}</span>
          <span class="meta-fila">${metaDe(g)}</span>
          <span class="ruta-cap-d">${esc(g.description)}</span>
          <span class="ruta-cap-go">Abrir guía →</span>
        </a>`).join('')}</div>
    </section>`;
  }).join('');

  return `<main class="ruta">
    ${lockup}
    <span class="ruta-eyebrow">Ruta de diagnóstico</span>
    <h1>Del síntoma a la pila puesta, en ${guides.length} guías</h1>
    <p class="ruta-lead">Van en orden a propósito: cada una termina donde empieza la siguiente, y todas acaban en el mismo sitio — una medición contra la especificación de tu vehículo, no una corazonada. No hace falta cuenta, y tu avance no se guarda en ningún lado: la barra solo te dice por dónde vas.</p>
    <div class="ruta-cifras">
      <div class="ruta-cifra"><b>${guides.length}</b><span>guías en orden</span></div>
      <div class="ruta-cifra"><b>${total(g => minutosDe(g.html))} min</b><span>de lectura en total</span></div>
      <div class="ruta-cifra"><b>${total(g => pasosDe(g.html))}</b><span>pasos numerados</span></div>
      <div class="ruta-cifra"><b>${total(g => (g.faq || []).length)}</b><span>preguntas resueltas</span></div>
    </div>
    ${modulos}
  </main>`;
}

/* JSON-LD de la ruta: un ItemList con las guías en su orden real. Le dice al
   buscador lo mismo que la página le dice al mecánico — que esto va seguido. */
const jsonLdRuta = (guides, baseUrl) => ({
  '@context': 'https://schema.org', '@type': 'ItemList', inLanguage: 'es',
  name: 'Ruta de diagnóstico del sistema de combustible',
  numberOfItems: guides.length,
  itemListElement: guides.map((g, i) => ({
    '@type': 'ListItem', position: i + 1, name: g.h1, url: `${baseUrl}/guia/${g.slug}`,
  })),
});

/* ---------------------------------------------------------------------------
   Página de una guía (/guia/:slug)
   ---------------------------------------------------------------------------
   Tres cosas que la guía no tenía: dónde estás, qué te va a costar, y qué
   viene después. La tercera es la que más cambia el comportamiento — una guía
   que termina en un punto final se cierra; una que termina en la siguiente,
   se sigue.

   Las preguntas frecuentes ya existían, pero solo alimentaban el JSON-LD: se
   le servían al buscador y no al mecánico. Aquí se imprimen con el mismo
   texto, que es lo mínimo honesto.
   ------------------------------------------------------------------------ */
function paginaGuia(g, guides, lockup = '') {
  const i = guides.indexOf(g);
  const sig = guides[i + 1];
  const pct = Math.round(((i + 1) / guides.length) * 100);
  const faq = (g.faq || []);
  return `<main class="cap">
    ${lockup}
    <a class="cap-volver" href="/guias">← Ruta de diagnóstico</a>
    <span class="cap-eyebrow">Guía ${i + 1} de ${guides.length} · ${esc(MODULOS[moduloDe(i)][0])}</span>
    <h1>${esc(g.h1)}</h1>
    <div class="meta-fila">${metaDe(g)}</div>
    <div class="cap-barra" role="img" aria-label="Guía ${i + 1} de ${guides.length} de la ruta"><i style="width:${pct}%"></i></div>
    <div class="cap-cuerpo">${g.html}</div>
    ${faq.length ? `<section class="cap-faq">
      <h2>Preguntas frecuentes</h2>
      <dl>${faq.map(f => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join('')}</dl>
    </section>` : ''}
    ${sig
      ? `<a class="cap-siguiente" href="/guia/${esc(sig.slug)}">
           <div><small>SIGUIENTE · GUÍA ${i + 2} DE ${guides.length}</small><b>${esc(sig.h1)}</b></div>
           <span aria-hidden="true">→</span>
         </a>`
      : `<div class="cap-fin">
           <p style="margin:0 0 8px;font-weight:700">Terminaste la ruta.</p>
           <p style="margin:0;color:var(--text-alt)">Ahora el dato concreto de tu carro: <a href="/vehiculos" style="color:var(--accent);font-weight:700">busca su presión de riel →</a></p>
         </div>`}
  </main>`;
}

module.exports = { MODULOS, NIVEL, minutosDe, pasosDe, moduloDe, nivelDe, metaDe, paginaRuta, paginaGuia, jsonLdRuta };
