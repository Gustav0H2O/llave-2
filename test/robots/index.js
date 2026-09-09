'use strict';
/* ============================================================================
   LANZADOR DE ROBOTS

   Corre todos los robots en secuencia y resume. Cada uno se ejecuta en su
   PROPIO proceso: si uno revienta de verdad —no una comprobación fallida, sino
   una excepción— los demás siguen y el informe final es completo.

   Uso:
     npm run robots              todos
     npm run robots -- --rapido  tandas pequeñas, sin navegador (~25 s)
     npm run robots -- --solo=registro,fuzz

   Códigos de salida: 0 todo verde · 1 alguna comprobación falló.
   ========================================================================= */
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROBOTS = [
  { id: 'registro',    archivo: 'registro.js',    que: 'alta de cuenta, validación, límites y sesiones' },
  { id: 'aislamiento', archivo: 'aislamiento.js', que: 'fugas de datos entre talleres' },
  { id: 'fuzz',        archivo: 'fuzz.js',        que: 'entradas hostiles contra toda la API' },
  { id: 'carga',       archivo: 'carga.js',       que: 'volumen, escalado y concurrencia' },
  { id: 'recorrido',   archivo: 'recorrido.js',   que: 'todas las páginas del sitio, SEO, enlaces y 404' },
  { id: 'jornada',     archivo: 'jornada.js',     que: 'alta por formulario y las 38 herramientas' },
  { id: 'interfaz',    archivo: 'interfaz.js',    que: 'navegador real, contraste y objetivos táctiles' },
  { id: 'persistencia', archivo: 'persistencia.js', que: 'supervivencia de cuentas y datos ante reinicios y migraciones' },
];

/* En modo rápido se recortan las tandas y se deja fuera el navegador, que es
   el que se lleva casi todo el reloj. Sirve para pasar los robots antes de un
   commit sin esperar minuto y medio. */
const RAPIDO = {
  registro: ['--cuentas=30', '--concurrencia=10', '--carrera=8'],
  aislamiento: ['--talleres=3'],
  fuzz: [],
  carga: ['--filas=200', '--concurrencia=10', '--talleres=3'],
  recorrido: ['--maximo=40'],
  jornada: ['--talleres=1'],
  persistencia: [],
};

function correr(robot, args) {
  return new Promise((resolve) => {
    const inicio = Date.now();
    const hijo = spawn(process.execPath, [path.join(__dirname, robot.archivo), ...args], { stdio: 'inherit' });
    hijo.on('close', (codigo) => resolve({ ...robot, codigo, seg: ((Date.now() - inicio) / 1000).toFixed(1) }));
    hijo.on('error', () => resolve({ ...robot, codigo: 1, seg: '0.0' }));
  });
}

(async () => {
  const argv = process.argv.slice(2);
  const rapido = argv.includes('--rapido');
  const solo = (argv.find(a => a.startsWith('--solo=')) || '').split('=')[1];
  const extra = argv.filter(a => a.startsWith('--') && !a.startsWith('--solo=') && a !== '--rapido');

  let lista = ROBOTS;
  if (solo) {
    const pedidos = solo.split(',').map(s => s.trim());
    lista = ROBOTS.filter(r => pedidos.includes(r.id));
    const desconocidos = pedidos.filter(p => !ROBOTS.some(r => r.id === p));
    if (desconocidos.length) {
      console.error(`Robot desconocido: ${desconocidos.join(', ')}. Disponibles: ${ROBOTS.map(r => r.id).join(', ')}`);
      process.exit(2);
    }
  }
  /* En modo rápido se quedan fuera los que abren navegador: son los que se
     llevan casi todo el reloj. `recorrido` sí entra: va por HTTP y tarda 1 s. */
  if (rapido) lista = lista.filter(r => !['interfaz', 'jornada'].includes(r.id));

  console.log(`\n🤖 Robots de prueba masiva — ${lista.length} en cola${rapido ? ' (modo rápido)' : ''}`);
  console.log('   Bases en memoria; las variables de conexión real se ignoran.\n');

  const resultados = [];
  for (const r of lista) {
    resultados.push(await correr(r, [...(rapido ? (RAPIDO[r.id] || []) : []), ...extra]));
  }

  const fallidos = resultados.filter(r => r.codigo !== 0);
  console.log(`\n${'═'.repeat(70)}\n  RESUMEN DE ROBOTS\n${'═'.repeat(70)}`);
  for (const r of resultados) {
    console.log(`  ${r.codigo === 0 ? '✅' : '❌'} ${r.id.padEnd(12)} ${String(r.seg).padStart(6)}s   ${r.que}`);
  }
  console.log('═'.repeat(70));
  console.log(fallidos.length === 0
    ? '\n✅ TODOS LOS ROBOTS EN VERDE.\n'
    : `\n❌ ${fallidos.length} robot(s) con fallos: ${fallidos.map(r => r.id).join(', ')}\n   Busca las líneas «✗» más arriba: cada una dice qué esperaba y qué pasó.\n`);
  process.exit(fallidos.length === 0 ? 0 : 1);
})();
