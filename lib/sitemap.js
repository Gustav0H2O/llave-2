'use strict';
/* ============================================================================
   lib/sitemap.js — 2.37 / 2.40: la lista de URLs del sitemap y su XML.

   POR QUÉ ESTÁ EN lib/
   Ordenar, deduplicar y recortar esa lista es una función pura de (URLs) →
   (URLs): no toca base, ni entorno, ni red. Vivía dentro de la ruta
   `GET /sitemap.xml` de server-pg.js, donde el tope de 10 000 URLs no se podía
   probar sin levantar el servidor y sembrar diez mil filas. Aquí se prueba
   sola, en test/unit/sitemap.test.js.

   POR QUÉ HAY UN TOPE (2.40)
   El protocolo admite 50 000 URLs y 50 MB por archivo, y pasarse no da error:
   el buscador descarta el archivo entero y el sitio desaparece del índice sin
   avisar. Se corta a 10 000 porque deja aire para crecer y mantiene el archivo
   ligero. El recorte es determinista y estable: el orden es fijo —páginas
   fijas, guías, perfiles de taller y, al final, las fichas de vehículo por
   id—, así que la misma base produce siempre el mismo archivo y lo que se cae
   por el tope son las últimas fichas, nunca una mezcla distinta en cada
   petición (un sitemap que cambia solo confunde al rastreador).

   POR QUÉ <lastmod> (2.37)
   Sin fecha, el rastreador decide por su cuenta cuándo volver a mirar una URL.
   Con `<lastmod>` sabe cuáles cambiaron. Se usa la fecha del despliegue en
   curso: el catálogo, las guías y las fichas solo cambian cuando se publica
   este proceso, y una fecha inventada por fila (que la base no guarda) sería
   peor que no ponerla.
   ========================================================================= */
const { esc } = require('./pure');

const LIMITE_URLS = 10000;

/* Fecha en el formato que exige el protocolo (YYYY-MM-DD, ISO 8601 restringido
   a fecha). Acepta Date o cualquier cosa que Date entienda; una fecha ilegible
   devuelve '' y el XML sale sin `<lastmod>`: mejor un sitemap sin fecha que uno
   con una fecha inválida, que el buscador rechaza. */
function fechaSitemap(valor) {
  const d = valor instanceof Date ? valor : new Date(valor ?? NaN);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/* Lista de URLs del sitemap, en orden estable y sin repetidas.
   Recibe SLUGS (no URLs): el servidor arma las rutas y esta función decide el
   orden y el tope, que es lo único que hay que probar aquí. */
function urlsDelSitemap({ base, paginas = [], guias = [], talleres = [], vehiculos = [], limite = LIMITE_URLS } = {}) {
  const raiz = String(base ?? '').replace(/\/+$/, '');
  const locs = [
    `${raiz}/`,
    `${raiz}/vehiculos`,
    `${raiz}/guias`,
    ...paginas.map((s) => `${raiz}/${s}`),
    ...guias.map((s) => `${raiz}/guia/${s}`),
    ...talleres.map((s) => `${raiz}/taller/${s}`),
    ...vehiculos.map((s) => `${raiz}/vehiculo/${s}`),
  ];
  /* Un taller llamado "Privacidad" produce el slug "privacidad" y chocaría con
     la página legal del mismo nombre. El sitemap no puede repetir URLs (el
     robot de recorrido lo comprueba y el buscador lo penaliza), así que se
     queda la primera aparición, que es la de la página fija. */
  const vistas = new Set();
  const unicas = locs.filter((u) => (vistas.has(u) ? false : (vistas.add(u), true)));
  const tope = Number.isFinite(limite) ? Math.max(0, Math.trunc(limite)) : LIMITE_URLS;
  return unicas.slice(0, tope);
}

/* XML del sitemap. `esc` es la misma de lib/pure.js que usa el SSR: una URL con
   `&` sin escapar deja el archivo mal formado y el buscador lo descarta. */
function xmlDelSitemap(locs, lastmod) {
  const fecha = fechaSitemap(lastmod);
  const ultimo = fecha ? `<lastmod>${fecha}</lastmod>` : '';
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + locs.map((u) => `  <url><loc>${esc(u)}</loc>${ultimo}</url>`).join('\n')
    + '\n</urlset>\n';
}

module.exports = { LIMITE_URLS, fechaSitemap, urlsDelSitemap, xmlDelSitemap };
