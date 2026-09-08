const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/* Los archivos del frontend no pasan por ningún build step ni por npm test:
   un error de sintaxis solo se descubría abriendo la página. Pasó de verdad
   con un useEffect sin abrir en microapps.js (commit d825673): el archivo
   entero fallaba al parsear, window.FT_MICRO nunca se definía y el home
   desplegado se quedaba en el catálogo de combustible. Parsear (no
   ejecutar) es barato y atrapa exactamente esa clase de error. */
const FRONTEND = [
  'public/app.js',
  'public/microapps.js',
  'public/microapps-taller.js',
  'public/admin.js',
  'public/sw.js',
  /* public/three3d.js queda fuera: es módulo ES (import/export) y
     vm.Script espera script clásico. Atrapar su sintaxis exigiría el flag
     --experimental-vm-modules de Node. */
];

test('cada archivo del frontend compila', () => {
  const fallos = [];
  for (const f of FRONTEND) {
    try {
      new vm.Script(fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8'), { filename: f });
    } catch (e) {
      fallos.push(`${f}: ${e.message}`);
    }
  }
  assert.deepEqual(fallos, [], `archivos que no compilan:\n${fallos.join('\n')}`);
});
