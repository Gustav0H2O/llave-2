#!/usr/bin/env node
'use strict';
/* ============================================================================
   scripts/qa.js — VERIFICACIÓN COMPLETA (npm run verify)

   Es el único comando que hay que correr antes de dar un cambio por terminado.
   Encadena, en este orden y parando en el primer fallo grave:

     1. Restricciones  (scripts/guard.js)  — patrones que ya rompieron el proyecto
     2. Pruebas        (node --test)       — unitarias, de QA y de API
     3. Métricas       (scripts/metrics.js)— presupuestos y trinquete de calidad

   El orden no es casual: el guard tarda menos de un segundo y caza los errores
   más tontos, así que va primero para no hacerte esperar la suite entera por
   un await olvidado.
   ========================================================================= */

const { spawnSync } = require('child_process');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const args = process.argv.slice(2);
const rapido = args.includes('--fast');

const PASOS = [
  {
    nombre: 'Restricciones del proyecto',
    detalle: 'reglas estáticas sobre patrones peligrosos',
    cmd: [process.execPath, ['scripts/guard.js']],
    consejo: 'Cada violación explica el daño real que causa. Arregla el código; no borres la regla.',
  },
  {
    nombre: 'Pruebas',
    detalle: 'unitarias, QA y API',
    cmd: [process.execPath, ['--test', 'test/api.test.js', 'test/business.test.js',
      'test/unit/pure.test.js', 'test/unit/domain.test.js', 'test/unit/catalog.test.js', 'test/unit/db-adapter.test.js',
      'test/qa/invariants.test.js', 'test/qa/security.test.js', 'test/qa/data-quality.test.js',
      'test/qa/contract.test.js', 'test/qa/business-flows.test.js', 'test/qa/admin.test.js', 'test/qa/perf.test.js']],
    consejo: 'Si falla una prueba de reglas del taller (test/unit/domain.test.js), lo más probable es que el error esté en el código, no en la prueba.',
  },
  {
    nombre: 'Métricas y presupuestos',
    detalle: 'cobertura, tamaños, deuda y trinquete',
    cmd: [process.execPath, ['scripts/metrics.js']],
    saltarEnRapido: true,
    consejo: 'Si un retroceso es deliberado, ejecuta `npm run metrics:aceptar` y explica el porqué en el commit.',
  },
];

const linea = (c = '─') => c.repeat(64);

function main() {
  console.log(`\n${linea('═')}`);
  console.log(`  VERIFICACIÓN DE FUELTECH MASTER${rapido ? '  (modo rápido)' : ''}`);
  console.log(`${linea('═')}\n`);

  const t0 = Date.now();
  const resultados = [];

  for (const paso of PASOS) {
    if (rapido && paso.saltarEnRapido) {
      console.log(`⏭️   ${paso.nombre} — omitido en modo rápido\n`);
      continue;
    }

    console.log(`▶  ${paso.nombre} (${paso.detalle})`);
    console.log(linea());

    const inicio = Date.now();
    const r = spawnSync(paso.cmd[0], paso.cmd[1], { cwd: RAIZ, stdio: 'inherit' });
    const seg = ((Date.now() - inicio) / 1000).toFixed(1);
    const ok = r.status === 0;

    resultados.push({ nombre: paso.nombre, ok, seg, consejo: paso.consejo });
    console.log(`${linea()}`);
    console.log(`${ok ? '✅' : '❌'}  ${paso.nombre} — ${seg}s\n`);

    if (!ok) {
      console.log(`💡 ${paso.consejo}\n`);
      break; // no tiene sentido medir métricas si las pruebas fallan
    }
  }

  const total = ((Date.now() - t0) / 1000).toFixed(1);
  const fallidos = resultados.filter(r => !r.ok);

  console.log(linea('═'));
  for (const r of resultados) console.log(`  ${r.ok ? '✅' : '❌'} ${r.nombre.padEnd(32)} ${r.seg}s`);
  console.log(linea('═'));

  if (fallidos.length) {
    console.log(`\n❌ VERIFICACIÓN FALLIDA en ${total}s — no des el cambio por terminado.\n`);
    console.log('   Reglas del proyecto: AGENTS.md');
    console.log('   Informe de calidad:  quality/REPORT.md\n');
    return 1;
  }

  console.log(`\n✅ TODO EN VERDE en ${total}s.\n`);
  if (!rapido) console.log('   Informe actualizado: quality/REPORT.md\n');
  return 0;
}

process.exit(main());
