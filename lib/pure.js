'use strict';
/* ============================================================================
   lib/pure.js — helpers puros del servidor (sin base de datos, sin red, sin
   estado). Todo lo que vive aquí es determinista: misma entrada, misma salida.

   Estaban sueltos dentro de server-pg.js (algunos dentro del closure de
   createApp, imposibles de probar). Aquí existe UNA sola definición de cada
   uno y test/unit/pure.test.js las cubre por completo, incluidos los casos
   que ya rompieron el servidor alguna vez (ver notas de cada función).
   ========================================================================= */

/* Saneo estricto de enteros externos.
   HISTORIA: better-sqlite3 lanza si recibe NaN como parámetro, así que un
   ?limit=abc tiraba un 500. Devuelve null cuando no hay un entero seguro, y
   recorta al rango [min, max] cuando sí lo hay. Nunca devuelve NaN. */
const toInt = (v, min, max) => {
  const n = Number.parseInt(v, 10);
  return Number.isSafeInteger(n) ? Math.min(Math.max(n, min), max) : null;
};

/* PSI → bar, redondeado a 2 decimales. null entra, null sale (un vehículo sin
   presión declarada no debe mostrar "0.00 bar", que se leería como dato real). */
const psiToBar = (psi) => psi == null ? null : +(psi * 0.0689476).toFixed(2);

/* Texto de entrada: recorta espacios y limita longitud. Cualquier cosa que no
   sea string (número, null, objeto, array) se vuelve cadena vacía — nunca
   "undefined" ni "[object Object]" guardados en la base. */
const str = (x, max = 500) => (typeof x === 'string' ? x.trim().slice(0, max) : '');

/* Número de entrada, o null. Cadena vacía y null NO son 0 (Number('') === 0
   metería ceros silenciosos en precios y cantidades). */
const num = (x) => (Number.isFinite(Number(x)) && x !== '' && x !== null ? Number(x) : null);

/* Escape de HTML para las páginas renderizadas en servidor.
   Es la única defensa contra XSS en el HTML del SSR: cualquier dato que venga
   de la base y se interpole en una plantilla TIENE que pasar por aquí. */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Slug para URLs: sin acentos, sin mayúsculas, sin nada que haya que escapar.
   El rango ̀-ͯ son los diacríticos combinantes que deja NFD. */
const slugify = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/* Slug canónico de un vehículo. El id va AL FINAL y es lo único que el
   servidor lee para resolver la página: el resto del slug es decorativo y
   puede cambiar sin romper enlaces viejos. */
const vehicleSlug = (v) => `${slugify(v.brand)}-${slugify(v.model)}-${v.year_from}-${v.year_to}-${v.id}`;

/* Id del vehículo a partir de su slug ("nissan-tsuru-1992-2017-42" → 42).
   Devuelve null si el slug no termina en un id válido. */
const vehicleIdFromSlug = (slug) => toInt(String(slug).split('-').pop(), 1, 1e9);

/* Slug del taller. Igual que slugify pero acotado a 60 caracteres y con
   respaldo vacío controlado (el llamador decide el fallback 'taller'). */
const haceSlug = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

module.exports = { toInt, psiToBar, str, num, esc, slugify, vehicleSlug, vehicleIdFromSlug, haceSlug };
