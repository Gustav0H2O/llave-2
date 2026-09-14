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

const { execFileSync } = require('node:child_process');

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

test('public/three3d.js compila como módulo ES', () => {
  const file = path.join(__dirname, '..', '..', 'public', 'three3d.js');
  assert.doesNotThrow(() => {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  }, 'public/three3d.js tiene errores de sintaxis ES');
});

test('public/three3d.js cumple presupuesto de tamaño y especificación 3D', () => {
  const file = path.join(__dirname, '..', '..', 'public', 'three3d.js');
  const code = fs.readFileSync(file, 'utf8');
  const sizeKb = +(fs.statSync(file).size / 1024).toFixed(2);
  const budgets = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'quality', 'budgets.json'), 'utf8'));
  const maxKb = budgets.tamano_kb['public/three3d.js'];

  assert.ok(sizeKb <= maxKb, `three3d.js excede presupuesto: ${sizeKb} KB > ${maxKb} KB`);
  assert.ok(code.includes('createViewer'), 'Debe exportar/definir createViewer');
  assert.ok(code.includes('buildProceduralCar'), 'Debe exportar/definir buildProceduralCar');
  assert.ok(code.includes('buildFuelSystem'), 'Debe exportar/definir buildFuelSystem');
  assert.ok(code.includes('window.FT3D'), 'Debe registrar global window.FT3D');

  // Siluetas de carrocería únicas
  const bodyTypes = ['sedan', 'hatchback', 'pickup', 'suv', 'van'];
  for (const bt of bodyTypes) {
    assert.ok(code.includes(`case '${bt}':`) || code.includes(`'${bt}'`), `Debe implementar silueta ${bt}`);
  }

  // Componentes técnicos del sistema de combustible
  assert.ok(code.includes('PAL_LIGHT') && code.includes('PAL_DARK'), 'Debe tener soporte de temas claro y oscuro');
  assert.ok(code.includes('dispose'), 'Debe implementar método dispose() para liberar recursos WebGL');
});


