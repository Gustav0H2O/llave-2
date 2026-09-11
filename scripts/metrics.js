#!/usr/bin/env node
'use strict';
process.env.NODE_ENV = 'test';
/* ============================================================================
   scripts/metrics.js — MÉTRICAS DE CALIDAD Y RATCHET

   Mide el estado del proyecto y lo compara con quality/baseline.json. Una
   métrica puede mejorar libremente; EMPEORAR falla el proceso. Esa es la idea
   del "ratchet" (trinquete): la calidad avanza y no retrocede sola.

   Uso:
     node scripts/metrics.js            → mide, compara y escribe el informe
     node scripts/metrics.js --accept   → además fija el estado actual como
                                          nueva referencia (usar solo cuando el
                                          cambio es deliberado y está explicado)
     node scripts/metrics.js --json     → salida en JSON

   Salidas:
     quality/baseline.json  referencia contra la que se compara
     quality/history.ndjson una línea por ejecución (histórico)
     quality/REPORT.md      informe legible del estado actual
   ========================================================================= */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');
/* Escáner único de rutas: lo comparten este informe y el guard que congela el
   monolito (scripts/guard.js), así no cuentan cosas distintas. */
const { rutasApi } = require('./rutas');

const RAIZ = path.join(__dirname, '..');
const P = (...p) => path.join(RAIZ, ...p);
const leer = (p) => fs.readFileSync(P(p), 'utf8');
const existe = (p) => fs.existsSync(P(p));

const BUDGETS = JSON.parse(leer('quality/budgets.json'));
const KNOWN = JSON.parse(leer('quality/known-issues.json'));

/* Dirección deseada de cada métrica:
     'sube'  → más es mejor (no puede bajar)
     'baja'  → menos es mejor (no puede subir)
     'info'  → se registra pero no bloquea                                   */
const DIRECCION = {
  pruebas_total: 'sube',
  pruebas_fallidas: 'baja',
  guard_violaciones: 'baja',
  cobertura_lib_pct: 'sube',
  rutas_api_probadas_pct: 'sube',
  rutas_api_sin_proteger: 'baja',
  deuda_conocida: 'baja',
  vehiculos_sin_verificar_pct: 'baja',
  archivos_sobre_presupuesto: 'baja',
  max_lineas_archivo: 'baja',
  duracion_suite_seg: 'info',
  vehiculos: 'info',
  marcas: 'info',
  rutas_api: 'info',
  lineas_de_prueba: 'info',
  razon_prueba_codigo: 'info',
};

/* Tolerancias: nadie quiere que el build falle porque una medición de tiempo
   varió un 2%. Las métricas de conteo no tienen tolerancia. */
const TOLERANCIA = { cobertura_lib_pct: 1.0, max_lineas_archivo: 50 };

const ejecutar = (cmd, args, opts = {}) => {
  try {
    return execFileSync(cmd, args, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, ...opts });
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '');
  }
};

/* ---------------------------------------------------------------------------
   Recolección de métricas
   ------------------------------------------------------------------------ */

function medirPruebas() {
  const t0 = Date.now();
  /* --test-concurrency=1 igual que `npm test`: sin limitar la concurrencia,
     la suite compite por la CPU y un test sensible a tiempos (login timing-safe)
     falla de forma intermitente. La medición debe ser reproducible. */
  const salida = ejecutar(process.execPath, [
    '--test', '--test-concurrency=1', '--test-reporter=tap', '--test-reporter-destination=stdout',
    ...listarPruebas(),
  ]);
  const duracion = (Date.now() - t0) / 1000;
  const num = (etiqueta) => {
    const m = salida.match(new RegExp(`^# ${etiqueta} (\\d+)`, 'm'));
    return m ? Number(m[1]) : 0;
  };
  return { total: num('tests'), fallidas: num('fail'), duracion_seg: +duracion.toFixed(1), salida };
}

function listarPruebas() {
  const out = [];
  const recorrer = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) recorrer(p);
      else if (f.name.endsWith('.test.js')) out.push(path.relative(RAIZ, p));
    }
  };
  recorrer(P('test'));
  return out;
}

/* Cobertura de líneas de lib/, leída de un informe lcov (formato estable). */
function medirCobertura() {
  const destino = path.join(os.tmpdir(), `ftm-cov-${process.pid}.lcov`);
  ejecutar(process.execPath, [
    '--test', '--experimental-test-coverage',
    '--test-reporter=lcov', `--test-reporter-destination=${destino}`,
    ...listarPruebas().filter(f => f.includes('unit')),
  ]);
  if (!fs.existsSync(destino)) return {};

  const lcov = fs.readFileSync(destino, 'utf8');
  fs.unlinkSync(destino);

  const porArchivo = {};
  let actual = null;
  for (const linea of lcov.split(/\r?\n/)) {
    if (linea.startsWith('SF:')) {
      actual = linea.slice(3).replace(/\\/g, '/');
      porArchivo[actual] = { alcanzadas: 0, totales: 0 };
    } else if (actual && linea.startsWith('LH:')) porArchivo[actual].alcanzadas = Number(linea.slice(3));
    else if (actual && linea.startsWith('LF:')) porArchivo[actual].totales = Number(linea.slice(3));
  }

  const salida = {};
  for (const [archivo, { alcanzadas, totales }] of Object.entries(porArchivo)) {
    if (!archivo.startsWith('lib/')) continue;
    salida[archivo] = totales ? +(alcanzadas / totales * 100).toFixed(1) : 0;
  }
  return salida;
}

function medirRutas() {
  /* Las rutas de la API pueden declararse en server-pg.js o en un módulo de
     src/ (el chat vive en src/services/chat.js, 4.4). Si solo se midiera
     server-pg.js, una ruta movida desaparecería del informe en vez de seguir
     contando. El escáner vive en scripts/rutas.js y lo comparte el guard, para
     que el total que mide el informe y el que congela la restricción coincidan
     aunque se lea además test/contract/rutas.json. */
  const api = rutasApi();

  const textoPruebas = listarPruebas().concat(
    fs.readdirSync(P('test')).filter(f => f.endsWith('.js')).map(f => `test/${f}`)
  ).map(f => (existe(f) ? leer(f) : '')).join('\n');

  const probadas = api.filter(r => {
    const patron = new RegExp(
      r.ruta.split('/')
        .map(s => (s.startsWith(':') ? '[^/\'"`\\s]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        .join('/')
    );
    return patron.test(textoPruebas);
  });

  const sinProteger = api.filter(r => !r.requireWorkshop && !r.requireAdmin);

  return {
    total: api.length,
    probadas_pct: api.length ? +(probadas.length / api.length * 100).toFixed(1) : 100,
    sin_proteger: sinProteger.length,
    sin_probar: api.filter(r => !probadas.includes(r)).map(r => `${r.metodo} ${r.ruta}`),
  };
}

function medirDatos() {
  const C = require('../lib/catalog');
  const sinVerificar = C.V.filter(v => v[12] === 0).length;
  return {
    vehiculos: C.V.length,
    marcas: new Set(C.V.map(v => v[0])).size,
    pilas: C.PUMPS.length,
    sin_verificar: sinVerificar,
    sin_verificar_pct: +(sinVerificar / C.V.length * 100).toFixed(1),
    por_inyeccion: C.INJECTION_CODES.reduce((o, i) => (o[i] = C.V.filter(v => v[5] === i).length, o), {}),
  };
}

function medirArchivos() {
  const tamanos = {};
  let sobrePresupuesto = 0;
  for (const [archivo, tope] of Object.entries(BUDGETS.tamano_kb)) {
    if (archivo.startsWith('_') || !existe(archivo)) continue;
    const kb = +(fs.statSync(P(archivo)).size / 1024).toFixed(1);
    tamanos[archivo] = { kb, tope, ok: kb <= tope };
    if (kb > tope) sobrePresupuesto++;
  }

  let maxLineas = 0, archivoMasLargo = '';
  let lineasDePrueba = 0, lineasDeCodigo = 0;

  /* Código de terceros: se sirve pero no se escribe ni se mantiene aquí, así
     que no cuenta para las métricas de tamaño ni de proporción de pruebas.
     (three.module.js son 54 mil líneas que falsearían cualquier promedio.) */
  const AJENO = /^(node_modules|public\/vendor|public\/models|quality)\//;

  const recorrer = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.name === 'node_modules' || f.name === '.git' || f.name.startsWith('.')) continue;
      const p = path.join(dir, f.name);
      if (f.isDirectory()) { recorrer(p); continue; }
      if (!f.name.endsWith('.js')) continue;
      const rel = path.relative(RAIZ, p).replace(/\\/g, '/');
      if (AJENO.test(rel)) continue;
      // Los scripts sueltos de depuración (_shot.js, _dbg.js) tampoco cuentan.
      if (/^_/.test(f.name)) continue;
      const n = fs.readFileSync(p, 'utf8').split('\n').length;
      if (rel.startsWith('test/')) lineasDePrueba += n;
      else if (!rel.startsWith('scripts/') && !rel.startsWith('_')) lineasDeCodigo += n;
      if (n > maxLineas) { maxLineas = n; archivoMasLargo = rel; }
    }
  };
  recorrer(RAIZ);

  return { tamanos, sobre_presupuesto: sobrePresupuesto, max_lineas: maxLineas, archivo_mas_largo: archivoMasLargo, lineas_prueba: lineasDePrueba, lineas_codigo: lineasDeCodigo };
}

function medirGuard() {
  const salida = ejecutar(process.execPath, ['scripts/guard.js', '--json']);
  try {
    const j = JSON.parse(salida);
    return {
      reglas: j.reglas_evaluadas,
      violaciones: j.errores.reduce((n, e) => n + Math.max(e.hallazgos.length, e.error ? 1 : 0), 0),
      avisos: j.avisos.reduce((n, a) => n + a.hallazgos.length, 0),
      detalle: j.errores,
    };
  } catch {
    return { reglas: 0, violaciones: 1, avisos: 0, detalle: [{ id: 'guard-no-ejecutable', hallazgos: [] }] };
  }
}

const contarDeuda = () => ['catalogo_duplicados', 'catalogo_solapes', 'pilas_huerfanas']
  .reduce((n, k) => n + (KNOWN[k]?.length || 0), 0);

/* ---------------------------------------------------------------------------
   Comparación contra la referencia
   ------------------------------------------------------------------------ */
function comparar(actual, referencia) {
  const regresiones = [];
  const mejoras = [];
  if (!referencia) return { regresiones, mejoras, primera_vez: true };

  for (const [clave, direccion] of Object.entries(DIRECCION)) {
    if (direccion === 'info') continue;
    const a = actual[clave], b = referencia[clave];
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    const tol = TOLERANCIA[clave] || 0;

    if (direccion === 'sube') {
      if (a < b - tol) regresiones.push({ clave, antes: b, ahora: a, direccion });
      else if (a > b) mejoras.push({ clave, antes: b, ahora: a });
    } else {
      if (a > b + tol) regresiones.push({ clave, antes: b, ahora: a, direccion });
      else if (a < b) mejoras.push({ clave, antes: b, ahora: a });
    }
  }
  return { regresiones, mejoras, primera_vez: false };
}

/* Verifica los topes absolutos de quality/budgets.json. */
function verificarPresupuestos(m, cobertura) {
  const fallos = [];
  const L = BUDGETS.limites;

  if (m.pruebas_fallidas > 0) fallos.push(`${m.pruebas_fallidas} prueba(s) fallando`);
  if (m.guard_violaciones > 0) fallos.push(`${m.guard_violaciones} violación(es) de las restricciones (npm run guard)`);
  if (m.pruebas_total < L.min_pruebas_totales) fallos.push(`solo ${m.pruebas_total} pruebas, el mínimo es ${L.min_pruebas_totales}`);
  if (m.rutas_api_probadas_pct < L.min_rutas_api_probadas_pct) fallos.push(`${m.rutas_api_probadas_pct}% de rutas probadas, el mínimo es ${L.min_rutas_api_probadas_pct}%`);
  if (m.rutas_api_sin_proteger > L.max_rutas_api_sin_proteger) fallos.push(`${m.rutas_api_sin_proteger} rutas sin proteger, el tope es ${L.max_rutas_api_sin_proteger}`);
  if (m.deuda_conocida > L.max_deuda_conocida) fallos.push(`${m.deuda_conocida} excepciones aceptadas, el tope es ${L.max_deuda_conocida}`);
  if (m.vehiculos_sin_verificar_pct > L.max_vehiculos_sin_verificar_pct) fallos.push(`${m.vehiculos_sin_verificar_pct}% del catálogo sin verificar, el tope es ${L.max_vehiculos_sin_verificar_pct}%`);
  if (m.max_lineas_archivo > L.max_lineas_por_archivo) fallos.push(`el archivo más largo tiene ${m.max_lineas_archivo} líneas, el tope es ${L.max_lineas_por_archivo}`);
  if (m.duracion_suite_seg > L.max_duracion_suite_seg) fallos.push(`la suite tarda ${m.duracion_suite_seg}s, el tope es ${L.max_duracion_suite_seg}s`);

  for (const [archivo, minimo] of Object.entries(BUDGETS.cobertura_minima_pct)) {
    if (archivo.startsWith('_')) continue;
    const c = cobertura[archivo];
    if (c === undefined) { fallos.push(`no se pudo medir la cobertura de ${archivo}`); continue; }
    if (c < minimo) fallos.push(`${archivo} tiene ${c}% de cobertura, el mínimo es ${minimo}%`);
  }

  for (const [archivo, info] of Object.entries(m._tamanos)) {
    if (!info.ok) fallos.push(`${archivo} pesa ${info.kb} KB, el presupuesto es ${info.tope} KB`);
  }

  return fallos;
}

/* ---------------------------------------------------------------------------
   Informe
   ------------------------------------------------------------------------ */
function escribirInforme(m, cobertura, rutas, datos, archivos, guard, comparacion, fallos) {
  const barra = (pct, ancho = 24) => {
    const n = Math.round(Math.max(0, Math.min(100, pct)) / 100 * ancho);
    return '█'.repeat(n) + '░'.repeat(ancho - n);
  };
  const fecha = new Date().toISOString().slice(0, 16).replace('T', ' ');

  const lineas = [
    '# Informe de calidad — FuelTech Master',
    '',
    `_Generado el ${fecha} por \`npm run metrics\`. No lo edites a mano._`,
    '',
    fallos.length ? `## ❌ ${fallos.length} presupuesto(s) roto(s)` : '## ✅ Todos los presupuestos se cumplen',
    '',
    ...(fallos.length ? fallos.map(f => `- ${f}`) : ['Nada que corregir.']),
    '',
    '## Resumen',
    '',
    '| Métrica | Valor | Estado |',
    '| --- | --- | --- |',
    `| Pruebas que pasan | ${m.pruebas_total - m.pruebas_fallidas} / ${m.pruebas_total} | ${m.pruebas_fallidas ? '❌' : '✅'} |`,
    `| Duración de la suite | ${m.duracion_seg ?? m.duracion_suite_seg} s | ${m.duracion_suite_seg > BUDGETS.limites.max_duracion_suite_seg ? '❌' : '✅'} |`,
    `| Reglas de restricción | ${guard.reglas} reglas, ${guard.violaciones} violaciones | ${guard.violaciones ? '❌' : '✅'} |`,
    `| Rutas de API probadas | ${rutas.probadas_pct}% de ${rutas.total} | ${rutas.probadas_pct >= 100 ? '✅' : '❌'} |`,
    `| Deuda conocida aceptada | ${m.deuda_conocida} de ${BUDGETS.limites.max_deuda_conocida} | ${m.deuda_conocida > BUDGETS.limites.max_deuda_conocida ? '❌' : '✅'} |`,
    `| Razón prueba/código | ${m.razon_prueba_codigo}x | ${m.razon_prueba_codigo >= 0.3 ? '✅' : '⚠️'} |`,
    '',
    '## Cobertura de las reglas del taller (lib/)',
    '',
    '```',
    ...Object.entries(cobertura).map(([f, pct]) => {
      const minimo = BUDGETS.cobertura_minima_pct[f];
      const marca = minimo === undefined ? ' ' : pct >= minimo ? '✓' : '✗';
      return `${marca} ${f.padEnd(18)} ${barra(pct)} ${String(pct).padStart(5)}%${minimo !== undefined ? `  (mínimo ${minimo}%)` : ''}`;
    }),
    '```',
    '',
    '## Catálogo',
    '',
    `- **${datos.vehiculos}** vehículos de **${datos.marcas}** marcas, con **${datos.pilas}** pilas.`,
    `- Por sistema de inyección: ${Object.entries(datos.por_inyeccion).map(([k, v]) => `${k} ${v}`).join(' · ')}.`,
    `- **${datos.sin_verificar}** vehículos (${datos.sin_verificar_pct}%) llevan datos ESTIMADOS y salen marcados en la ficha.`,
    '',
    '## Tamaño de los archivos que descarga el usuario',
    '',
    '```',
    ...Object.entries(archivos.tamanos).map(([f, i]) =>
      `${i.ok ? '✓' : '✗'} ${f.padEnd(24)} ${String(i.kb).padStart(7)} KB  de ${i.tope} KB`),
    '```',
    '',
    '## Evolución respecto a la referencia',
    '',
  ];

  if (comparacion.primera_vez) {
    lineas.push('Primera medición: se guarda como referencia inicial.');
  } else if (!comparacion.regresiones.length && !comparacion.mejoras.length) {
    lineas.push('Sin cambios respecto a la última referencia aceptada.');
  } else {
    if (comparacion.mejoras.length) {
      lineas.push('**Mejoras:**', '');
      for (const x of comparacion.mejoras) lineas.push(`- ${x.clave}: ${x.antes} → ${x.ahora}`);
      lineas.push('');
    }
    if (comparacion.regresiones.length) {
      lineas.push('**Retrocesos (bloquean):**', '');
      for (const x of comparacion.regresiones) lineas.push(`- ${x.clave}: ${x.antes} → ${x.ahora}`);
      lineas.push('');
    }
  }

  if (rutas.sin_probar.length) {
    lineas.push('', '## Rutas sin prueba', '', ...rutas.sin_probar.map(r => `- \`${r}\``));
  }

  if (guard.violaciones) {
    lineas.push('', '## Violaciones de las restricciones', '');
    for (const e of guard.detalle) {
      lineas.push(`### ${e.id}`, '');
      for (const h of e.hallazgos.slice(0, 20)) lineas.push(`- \`${h.archivo}${h.linea ? ':' + h.linea : ''}\` — ${h.mensaje}`);
      lineas.push('');
    }
  }

  const deuda = ['catalogo_duplicados', 'catalogo_solapes', 'pilas_huerfanas']
    .flatMap(k => (KNOWN[k] || []).map(d => `- **${d.clave}** — ${d.razon} _(${d.decidir})_`));
  if (deuda.length) lineas.push('', '## Deuda conocida pendiente de decisión', '', ...deuda);

  lineas.push('', '---', '', 'Reglas para modificar este sistema: ver `AGENTS.md`.', '');
  fs.writeFileSync(P('quality/REPORT.md'), lineas.join('\n'));
}

/* ---------------------------------------------------------------------------
   Principal
   ------------------------------------------------------------------------ */
function main() {
  const args = process.argv.slice(2);
  const aceptar = args.includes('--accept');
  const comoJson = args.includes('--json');

  if (!comoJson) console.log('\n📊 Midiendo calidad del proyecto…\n');

  const pruebas = medirPruebas();
  if (!comoJson) console.log(`   pruebas .......... ${pruebas.total - pruebas.fallidas}/${pruebas.total} en ${pruebas.duracion_seg}s`);

  const cobertura = medirCobertura();
  if (!comoJson) console.log(`   cobertura lib/ ... ${Object.entries(cobertura).map(([f, p]) => `${path.basename(f)} ${p}%`).join(', ') || 'sin datos'}`);

  const rutas = medirRutas();
  const datos = medirDatos();
  const archivos = medirArchivos();
  const guard = medirGuard();
  if (!comoJson) console.log(`   rutas API ........ ${rutas.total} (${rutas.probadas_pct}% probadas, ${rutas.sin_proteger} públicas)`);
  if (!comoJson) console.log(`   restricciones .... ${guard.reglas} reglas, ${guard.violaciones} violaciones\n`);

  const coberturaLib = Object.values(cobertura);
  const m = {
    fecha: new Date().toISOString(),
    pruebas_total: pruebas.total,
    pruebas_fallidas: pruebas.fallidas,
    duracion_suite_seg: pruebas.duracion_seg,
    guard_violaciones: guard.violaciones,
    cobertura_lib_pct: coberturaLib.length ? +(coberturaLib.reduce((a, b) => a + b, 0) / coberturaLib.length).toFixed(1) : 0,
    rutas_api: rutas.total,
    rutas_api_probadas_pct: rutas.probadas_pct,
    rutas_api_sin_proteger: rutas.sin_proteger,
    deuda_conocida: contarDeuda(),
    vehiculos: datos.vehiculos,
    marcas: datos.marcas,
    vehiculos_sin_verificar_pct: datos.sin_verificar_pct,
    archivos_sobre_presupuesto: archivos.sobre_presupuesto,
    max_lineas_archivo: archivos.max_lineas,
    lineas_de_prueba: archivos.lineas_prueba,
    razon_prueba_codigo: +(archivos.lineas_prueba / Math.max(1, archivos.lineas_codigo)).toFixed(2),
    _tamanos: archivos.tamanos,
  };

  const referencia = existe('quality/baseline.json') ? JSON.parse(leer('quality/baseline.json')) : null;
  const comparacion = comparar(m, referencia);
  const fallos = verificarPresupuestos(m, cobertura);

  escribirInforme(m, cobertura, rutas, datos, archivos, guard, comparacion, fallos);

  // Histórico: una línea por ejecución, para poder graficar la evolución.
  const { _tamanos, ...paraHistorico } = m;
  fs.appendFileSync(P('quality/history.ndjson'), JSON.stringify(paraHistorico) + '\n');

  if (aceptar) {
    fs.writeFileSync(P('quality/baseline.json'), JSON.stringify(paraHistorico, null, 2) + '\n');
    if (!comoJson) console.log('📌 Referencia actualizada (quality/baseline.json).\n');
  } else if (comparacion.primera_vez) {
    fs.writeFileSync(P('quality/baseline.json'), JSON.stringify(paraHistorico, null, 2) + '\n');
    if (!comoJson) console.log('📌 Primera medición: se guarda como referencia inicial.\n');
  }

  if (comoJson) {
    console.log(JSON.stringify({ ok: !fallos.length && !comparacion.regresiones.length, metricas: paraHistorico, fallos, ...comparacion }, null, 2));
  } else {
    for (const x of comparacion.mejoras) console.log(`   ✅ mejora: ${x.clave} ${x.antes} → ${x.ahora}`);
    for (const x of comparacion.regresiones) console.log(`   ⛔ RETROCESO: ${x.clave} ${x.antes} → ${x.ahora}`);
    for (const f of fallos) console.log(`   ⛔ ${f}`);
    console.log(`\n📄 Informe: quality/REPORT.md`);
    console.log(fallos.length || comparacion.regresiones.length
      ? '\n❌ La calidad retrocedió. Arréglalo, o si el cambio es deliberado ejecuta `npm run metrics:aceptar` explicando por qué en el commit.\n'
      : '\n✅ Calidad estable o en mejora.\n');
  }

  /* Con --accept el retroceso se está aceptando a propósito, así que no
     bloquea; los presupuestos rotos SÍ siguen bloqueando: esos no se aceptan
     midiendo otra vez, se arreglan o se sube el número en budgets.json con una
     razón escrita. */
  const bloquea = fallos.length || (!aceptar && comparacion.regresiones.length);
  return bloquea ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { medirRutas, medirDatos, medirArchivos, comparar };
