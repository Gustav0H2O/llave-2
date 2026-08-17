'use strict';
/* ============================================================================
   INFORME DE ROBOTS

   Corre todos los robots, recoge lo que dicen y escribe `quality/ROBOTS.md`.

   El informe no repite la salida de la consola: la consola sirve para trabajar
   —se lee mientras corre y se pierde—, y el fichero sirve para decidir. Por eso
   agrupa los fallos por clase (30 líneas iguales son UN problema, no treinta) y
   separa lo que hay que arreglar de lo que hay que decidir.

   Se genera, no se edita a mano, igual que `quality/REPORT.md`.

   Uso: node test/robots/reporte.js [--rapido]
   ========================================================================= */
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const RAIZ = path.join(__dirname, '..', '..');
const SALIDA = path.join(RAIZ, 'quality', 'ROBOTS.md');

const ROBOTS = [
  ['registro', 'Alta de cuenta, validación, limitador, altas masivas y sesiones'],
  ['aislamiento', 'Fugas de datos entre talleres'],
  ['fuzz', 'Entradas hostiles contra toda la API'],
  ['carga', 'Volumen, escalado, listados y concurrencia'],
  ['recorrido', 'Todas las páginas del sitio, SEO, enlaces y 404'],
  ['jornada', 'Alta por formulario y las 38 herramientas, con navegador'],
  ['interfaz', 'Contraste, desbordes y objetivos táctiles en 2 temas × 3 anchos'],
];

const RAPIDO = {
  registro: ['--cuentas=30', '--concurrencia=10', '--carrera=8'],
  aislamiento: ['--talleres=3'],
  carga: ['--filas=200', '--concurrencia=10', '--talleres=3'],
  jornada: ['--talleres=1'],
  interfaz: ['--anchos=390,1440'],
};

function correr(id, args) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let salida = '';
    const hijo = spawn(process.execPath, [path.join(__dirname, `${id}.js`), ...args]);
    hijo.stdout.on('data', d => { salida += d; process.stdout.write(d); });
    hijo.stderr.on('data', d => { salida += d; });
    hijo.on('close', (codigo) => resolve({ id, codigo, salida, seg: +((Date.now() - t0) / 1000).toFixed(1) }));
    hijo.on('error', (e) => resolve({ id, codigo: 1, salida: String(e), seg: 0 }));
  });
}

/* La línea de resumen del robot: «✅ Título: N comprobaciones…» o
   «❌ Título: N de M FALLARON…». De ahí salen los totales. */
function extraer(salida) {
  const limpio = salida.replace(/\[\d+m/g, '');
  const verde = limpio.match(/✅ ([^:]+): (\d+) comprobaciones/);
  const rojo = limpio.match(/❌ ([^:]+): (\d+) de (\d+) FALLARON/);
  const notas = [...limpio.matchAll(/^ {2}· (.+)$/gm)].map(m => m[1].trim());
  /* Los fallos ya vienen agrupados por el propio informe del robot, en el
     bloque final con la forma «   N×  descripción» + «        ej: detalle». */
  const fallos = [...limpio.matchAll(/^ {3}(\d+)×\s+(.+)$/gm)].map((m, i, todos) => {
    const desde = limpio.indexOf(m[0]) + m[0].length;
    const hasta = i + 1 < todos.length ? limpio.indexOf(todos[i + 1][0], desde) : limpio.length;
    const bloque = limpio.slice(desde, hasta);
    const donde = (bloque.match(/^ {8}en: (.+)$/m) || [])[1];
    const ejemplo = (bloque.match(/^ {8}ej: ([\s\S]*?)(?=\n {3,8}\w+:|\n\n|$)/m) || [])[1];
    return {
      veces: +m[1], que: m[2].trim(),
      donde: (donde || '').trim(),
      ejemplo: (ejemplo || '').replace(/\s+/g, ' ').trim().slice(0, 220),
    };
  });
  return {
    titulo: (verde || rojo)?.[1]?.trim() || null,
    total: verde ? +verde[2] : (rojo ? +rojo[3] : 0),
    fallidas: rojo ? +rojo[2] : 0,
    notas, fallos,
  };
}

(async () => {
  const rapido = process.argv.includes('--rapido');
  console.log(`\n🤖 Generando informe de robots${rapido ? ' (modo rápido)' : ''}…\n`);

  const resultados = [];
  for (const [id] of ROBOTS) {
    resultados.push({ ...(await correr(id, rapido ? (RAPIDO[id] || []) : [])), });
  }
  for (const r of resultados) Object.assign(r, extraer(r.salida));

  const totalComprobaciones = resultados.reduce((a, r) => a + r.total, 0);
  const totalFallos = resultados.reduce((a, r) => a + r.fallidas, 0);
  const segundos = resultados.reduce((a, r) => a + r.seg, 0).toFixed(0);
  const fecha = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const descripcion = Object.fromEntries(ROBOTS);

  const L = [];
  L.push('# Informe de robots — FuelTech Master', '');
  L.push('> Generado por `npm run robots:informe`. **No lo edites a mano.**', '');
  L.push(`**${fecha}** · ${totalComprobaciones} comprobaciones · ${totalFallos} fallidas · ${segundos}s${rapido ? ' · modo rápido' : ''}`, '');

  L.push('## Resumen', '');
  L.push('| Robot | Comprobaciones | Fallidas | Tiempo | Qué cubre |');
  L.push('| --- | ---: | ---: | ---: | --- |');
  for (const r of resultados) {
    L.push(`| ${r.codigo === 0 ? '✅' : '❌'} \`${r.id}\` | ${r.total} | ${r.fallidas || '—'} | ${r.seg}s | ${descripcion[r.id]} |`);
  }
  L.push('');

  const conFallos = resultados.filter(r => r.fallos.length);
  if (!conFallos.length) {
    L.push('## Hallazgos', '', 'Ninguno. Todos los robots en verde.', '');
  } else {
    L.push('## Hallazgos', '');
    L.push('Agrupados por clase: una misma causa produce muchas líneas iguales, y lo que');
    L.push('importa es cuántos problemas distintos hay, no cuántas veces se repiten.', '');
    for (const r of conFallos) {
      L.push(`### \`${r.id}\` — ${r.fallos.length} clase(s) de fallo`, '');
      for (const f of r.fallos) {
        L.push(`- **${f.que}**${f.veces > 1 ? ` — afecta a ${f.veces}` : ''}`);
        if (f.donde) L.push(`  - Dónde: \`${f.donde.split(', ').join('`, `')}\``);
        if (f.ejemplo) L.push(`  - Evidencia: ${f.ejemplo}`);
      }
      L.push('');
    }
  }

  L.push('## Mediciones', '');
  for (const r of resultados) {
    if (!r.notas.length) continue;
    L.push(`### \`${r.id}\``, '');
    L.push('```');
    for (const n of r.notas) L.push(n);
    L.push('```', '');
  }

  L.push('## Cómo se reproduce', '', '```bash');
  L.push('npm run robots              # los siete');
  L.push('npm run robots:rapido       # tandas cortas, sin navegador');
  L.push('npm run robots:informe      # los siete + regenera este fichero');
  L.push('npm run robots -- --solo=aislamiento,fuzz');
  L.push('```', '');
  L.push('Las bases son siempre en memoria. `test/robots/comun.js` vacía `TURSO_URL`,');
  L.push('`TURSO_AUTH_TOKEN` y `DATABASE_URL` **antes** de cargar nada, porque `db.js`');
  L.push('lee el `.env` del repo —que apunta a producción— al importarse.', '');

  fs.writeFileSync(SALIDA, L.join('\n'), 'utf8');
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  📄 Informe escrito: quality/ROBOTS.md`);
  console.log(`     ${totalComprobaciones} comprobaciones · ${totalFallos} fallidas · ${segundos}s`);
  console.log('═'.repeat(70) + '\n');
  process.exit(totalFallos === 0 ? 0 : 1);
})();
