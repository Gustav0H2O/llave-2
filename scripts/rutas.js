'use strict';
/* ============================================================================
   scripts/rutas.js — ESCÁNER ÚNICO DE RUTAS DE LA API

   Extrae, leyendo el código fuente real, cada ruta declarada con
   app.get/post/put/patch/delete. Es la ÚNICA definición de "qué rutas existen",
   y la comparten:

     · scripts/metrics.js          → para contar el total de rutas /api
     · scripts/guard.js            → para congelar las rutas del monolito
     · test/contract/contrato.test.js → para el snapshot de contrato

   Tener una sola definición evita que el informe, la restricción y la prueba de
   contrato cuenten cosas distintas al leer server-pg.js y src/ por separado.

   No ejecuta nada: solo lee archivos, así que sirve para el hook del editor.
   ========================================================================= */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

/* Mismo patrón que ya usaban scripts/metrics.js y test/helpers.js:
   app.METODO('ruta', …middlewares). Captura el método, la cadena de la ruta y
   el texto hasta el primer ')', que basta para ver si lleva requireWorkshop,
   requireAdmin o algún rate-limiter. */
const PATRON_RUTA = /app\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2([^)]*)/g;

/* Archivos que declaran rutas: el monolito y todos los módulos de src/
   (el chat de IA y el identificador viven fuera de server-pg.js). */
function archivosConRutas(raiz = RAIZ) {
  const out = ['server-pg.js'];
  const src = path.join(raiz, 'src');
  if (!fs.existsSync(src)) return out;

  const recorrer = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) { recorrer(p); continue; }
      if (f.name.endsWith('.js')) out.push(path.relative(raiz, p).replace(/\\/g, '/'));
    }
  };
  recorrer(src);
  return out;
}

/* Devuelve una entrada por cada ruta declarada, con lo que hace falta para
   congelar el contrato: método, ruta, archivo, línea y si exige auth. */
function extraerRutas({ archivos = archivosConRutas(), raiz = RAIZ } = {}) {
  const rutas = [];
  for (const archivo of archivos) {
    const src = fs.readFileSync(path.join(raiz, archivo), 'utf8');
    for (const m of src.matchAll(PATRON_RUTA)) {
      const middlewares = m[4] || '';
      rutas.push({
        metodo: m[1].toUpperCase(),
        ruta: m[3],
        archivo,
        linea: src.slice(0, m.index).split('\n').length,
        middlewares,
        requireWorkshop: /requireWorkshop/.test(middlewares),
        requireAdmin: /requireAdmin/.test(middlewares),
        limitada: /Limiter/.test(middlewares),
      });
    }
  }
  return rutas;
}

/* Solo las rutas de la API (las que cuentan las métricas). */
function rutasApi(opciones) {
  return extraerRutas(opciones).filter(r => r.ruta.startsWith('/api/'));
}

module.exports = { PATRON_RUTA, archivosConRutas, extraerRutas, rutasApi };
