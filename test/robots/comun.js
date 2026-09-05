'use strict';
/* ============================================================================
   Núcleo compartido de los robots de prueba masiva.

   Qué son los robots y en qué se diferencian de las suites de `test/`:
   las suites comprueban CASOS CONCRETOS escritos a mano y tienen que correr en
   segundos dentro de `npm run verify`. Los robots hacen lo contrario: generan
   volumen y combinaciones que nadie escribiría a mano —miles de registros,
   barridos de taller contra taller, cargas hostiles contra todas las rutas— y
   por eso viven fuera de `verify` y se lanzan aparte.

   SEGURIDAD, lo primero. Estos robots CREAN MILES DE FILAS. Si alguno apuntara
   a la base de producción de Turso dejaría el catálogo del taller lleno de
   basura. Tres cinturones, no uno:
     1. Todo arranca con `levantarServidor()` de test/helpers.js, que monta
        bases en memoria con el adaptador en modo 'local'.
     2. Viven bajo `test/`, así que los cubre la regla `pruebas-nunca-tocan-
        bases-reales` de scripts/guard.js, que falla si alguien abre una base
        en disco o construye el adaptador sin 'local'.
     3. `exigirEntornoSeguro()`, aquí abajo, aborta si el entorno tiene una
        cadena de conexión real puesta, aunque no se fuera a usar.
   ========================================================================= */
const crypto = require('node:crypto');

/* ---------------------------------------------------------------------------
   1. Cinturón de seguridad — ANTES de cargar nada más
   ---------------------------------------------------------------------------
   El orden de estas líneas importa y no es estético. `../helpers` arrastra
   `server-pg.js` y con él `db.js`, que ABRE LA CONEXIÓN A TURSO en cuanto se
   carga el módulo, con solo mirar process.env. Si la comprobación viviera
   debajo de los require, para cuando avisara ya habría un cliente contra la
   base de producción abierto. Por eso se comprueba primero y se importa
   después. */
const PELIGROSAS = ['TURSO_URL', 'TURSO_AUTH_TOKEN', 'DATABASE_URL'];

/* No basta con COMPROBAR el entorno: hay que NEUTRALIZARLO.
   La primera versión de esto solo miraba process.env y daba el visto bueno…
   porque en ese instante estaba limpio. Lo que pasa después es la trampa:
   `db.js` carga dotenv, dotenv lee el `.env` del repo —que apunta a la base de
   PRODUCCIÓN en Turso, tal cual avisa AGENTS.md §5— y la conexión se abre sola.
   Lanzar el robot con `TURSO_URL= ...` por delante tampoco bastaba por sí solo:
   funcionaba de milagro, porque dotenv respeta las claves ya presentes.

   Así que aquí se dejan las tres variables presentes y VACÍAS antes de cargar
   nada. dotenv no pisa una clave que ya existe, y `db.js` calcula
   `USE_TURSO = !!(TURSO_URL && TURSO_AUTH_TOKEN)`, que con cadena vacía da
   falso. Resultado: el adaptador cae en SQLite local pase lo que pase, sin
   depender de que quien lanza el robot se acuerde de nada. */
const neutralizadas = PELIGROSAS.filter(v => (process.env[v] || '').trim() !== '');
for (const v of PELIGROSAS) process.env[v] = '';
process.env.NODE_ENV = 'test';

function exigirEntornoSeguro() {
  const vivas = PELIGROSAS.filter(v => (process.env[v] || '').trim() !== '');
  if (vivas.length) {
    console.error(`\n💥 ROBOT ABORTADO: ${vivas.join(', ')} sigue con valor pese al blindaje.\n`);
    process.exit(2);
  }
  if (neutralizadas.length) {
    console.log(`🛡  Entorno blindado: se ignoran ${neutralizadas.join(', ')} (los robots solo escriben en memoria).`);
  }
}

exigirEntornoSeguro();

const { levantarServidor, crearCliente } = require('../helpers');

/* ---------------------------------------------------------------------------
   2. Opciones de línea de comandos
   ------------------------------------------------------------------------ */
function opciones(porDefecto = {}) {
  const o = { ...porDefecto };
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([\w-]+)(?:=(.*))?$/);
    if (!m) continue;
    const clave = m[1].replace(/-/g, '_');
    const valor = m[2] === undefined ? true : m[2];
    o[clave] = /^\d+$/.test(String(valor)) ? Number(valor) : valor;
  }
  return o;
}

/* Generador reproducible: con la misma semilla, la misma tanda de datos. Sin
   esto un fallo intermitente es imposible de repetir. */
function generador(semilla = 20260812) {
  let s = semilla >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0xFFFFFFFF;
  };
}

/* ---------------------------------------------------------------------------
   2b. Silenciar el registro HTTP
   ------------------------------------------------------------------------ */
/* server-pg.js monta morgan sin condición, lo cual está bien en un servidor de
   verdad. Aquí no: una tanda de 300 altas escupe 300 líneas y entierra el
   informe del robot. Se filtra la salida del propio proceso en vez de tocar
   `server-pg.js`, para que los robots midan EXACTAMENTE la app que corre en
   producción, con su middleware de log incluido. Con --verboso no se filtra. */
function silenciarHttp() {
  if (process.argv.includes('--verboso')) return () => {};
  const original = process.stdout.write.bind(process.stdout);
  /* morgan en modo 'dev' colorea el estado, así que la línea llega envuelta en
     secuencias ANSI y no empieza por el verbo. Se limpian con , escrito
     en el literal de la expresión para no depender de escapes de cadena. */
  const sinColor = (t) => String(t).replace(/\[\d+m/g, '').trim();
  /* Se filtran también los avisos [verify]: sin RESEND_API_KEY el servidor
     escribe el enlace de confirmación en el log a propósito, para poder probar
     el flujo en local. En una tanda de miles de peticiones son cientos de
     líneas que entierran el informe. */
  const esRuido = (t) => {
    const l = sinColor(t);
    return /^(GET|POST|PUT|PATCH|DELETE|HEAD)\s+\S+/.test(l) || l.startsWith('[verify]');
  };
  /* stderr también: el aviso [verify] sale por console.error. */
  const originalErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk, ...resto) => (esRuido(chunk) ? true : original(chunk, ...resto));
  process.stderr.write = (chunk, ...resto) => (esRuido(chunk) ? true : originalErr(chunk, ...resto));
  return () => { process.stdout.write = original; process.stderr.write = originalErr; };
}

/* ---------------------------------------------------------------------------
   3. Reporte
   ------------------------------------------------------------------------ */
class Reporte {
  constructor(titulo) {
    this.titulo = titulo;
    this.ok = 0;
    this.fallos = [];
    this.notas = [];
    this.inicio = Date.now();
    console.log(`\n${'═'.repeat(70)}\n  ROBOT: ${titulo}\n${'═'.repeat(70)}`);
  }
  seccion(t) { console.log(`\n▶ ${t}`); }
  /* `condicion` verdadera = comprobación superada. `detalle` solo se imprime
     cuando falla: en una tanda de 5.000 comprobaciones, imprimir los aciertos
     esconde los fallos. */
  comprobar(condicion, nombre, detalle = '') {
    if (condicion) { this.ok++; return true; }
    this.fallos.push({ nombre, detalle });
    console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`);
    return false;
  }
  nota(t) { this.notas.push(t); console.log(`  · ${t}`); }
  hito(t) { console.log(`  ✓ ${t}`); }

  resumen() {
    const seg = ((Date.now() - this.inicio) / 1000).toFixed(1);
    const total = this.ok + this.fallos.length;
    console.log(`\n${'─'.repeat(70)}`);
    if (this.fallos.length === 0) {
      console.log(`✅ ${this.titulo}: ${total} comprobaciones, todas en verde (${seg}s)`);
    } else {
      console.log(`❌ ${this.titulo}: ${this.fallos.length} de ${total} FALLARON (${seg}s)\n`);
      /* Agrupado por PROBLEMA, no por instancia. Un fallo sistémico produce una
         línea por página o por ruta y, sin normalizar, «27 fallos» se lee como
         27 problemas cuando son tres. Se quita del nombre todo lo que cambia
         entre instancias —la ruta inicial, lo que va entre comillas, los
         números— y lo que queda es la clase de fallo. */
      const clase = (nombre) => nombre
        .replace(/^[^:]*[/·]\S*:\s*/, '')      // «/guia/lo-que-sea: …» → «…»
        .replace(/«[^»]*»/g, '«…»')            // «Nombre concreto» → «…»
        .replace(/\b\d+(?:[.,]\d+)?\b/g, 'N')
        .trim();
      const porNombre = new Map();
      for (const f of this.fallos) {
        const k = clase(f.nombre);
        if (!porNombre.has(k)) porNombre.set(k, { n: 0, ejemplo: f.detalle, donde: [] });
        const g = porNombre.get(k);
        g.n++;
        /* Se guarda dónde ocurrió: sin eso, «7×» no dice en qué páginas. */
        const donde = (f.nombre.match(/^([^:«]*?):/) || f.nombre.match(/«([^»]+)»/) || [])[1];
        if (donde && g.donde.length < 8 && !g.donde.includes(donde)) g.donde.push(donde);
      }
      for (const [k, v] of porNombre) {
        console.log(`   ${v.n}×  ${k}`);
        if (v.donde.length) console.log(`        en: ${v.donde.join(', ')}${v.n > v.donde.length ? ' …' : ''}`);
        if (v.ejemplo) console.log(`        ej: ${v.ejemplo}`);
      }
    }
    return this.fallos.length === 0;
  }
}

/* ---------------------------------------------------------------------------
   4. Concurrencia acotada
   ------------------------------------------------------------------------ */
/* Lanzar 5.000 promesas a la vez agota los descriptores de socket y lo que se
   mide deja de ser el servidor. Se mantienen `limite` en vuelo. */
async function lote(total, limite, tarea) {
  const resultados = new Array(total);
  let siguiente = 0;
  const obrero = async () => {
    while (true) {
      const i = siguiente++;
      if (i >= total) return;
      try { resultados[i] = { ok: true, valor: await tarea(i) }; }
      catch (e) { resultados[i] = { ok: false, error: e }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, total) }, obrero));
  return resultados;
}

function percentiles(ms) {
  if (!ms.length) return { p50: 0, p95: 0, p99: 0, max: 0 };
  const a = [...ms].sort((x, y) => x - y);
  const en = (p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  return { p50: +en(.50).toFixed(1), p95: +en(.95).toFixed(1), p99: +en(.99).toFixed(1), max: +a[a.length - 1].toFixed(1) };
}

async function cronometrar(fn) {
  const t = process.hrtime.bigint();
  const valor = await fn();
  return { valor, ms: Number(process.hrtime.bigint() - t) / 1e6 };
}

/* ---------------------------------------------------------------------------
   5. Servidor y talleres
   ------------------------------------------------------------------------ */
/* Un servidor nuevo trae un limitador de peticiones nuevo: `authLimiter` deja
   pasar 20 registros por minuto y por IP, y todos los robots salen de
   127.0.0.1. Reiniciar entre tandas es la forma honesta de medir el registro
   sin desactivar la protección que precisamente queremos comprobar. */
async function nuevoServidor() {
  const ctx = await levantarServidor();
  ctx.cliente = () => crearCliente(ctx.base);
  return ctx;
}

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

/* Siembra N talleres escribiendo DIRECTAMENTE en la base en memoria, con su
   sesión ya válida.

   Por qué no por HTTP: `/api/auth/register` está limitado a 20/min y aquí
   hacen falta cientos o miles de cuentas para medir volumen. El registro por
   HTTP se prueba a fondo en el robot `registro.js`, que es su sitio; aquí lo
   que se ejercita es lo que viene DESPUÉS de tener cuenta. Las rutas de
   negocio (inventario, clientes, órdenes, notas, caja) no llevan limitador,
   así que la carga contra ellas sí es realista. */
function sembrarTalleres(ctx, n, prefijo = 'robot') {
  const insWs = ctx.db.prepare('INSERT INTO workshops (email, pass_hash, name) VALUES (?, ?, ?)');
  const insSes = ctx.db.prepare('INSERT INTO sessions (token_hash, workshop_id, expires_at) VALUES (?, ?, ?)');
  const expira = new Date(Date.now() + 86400_000).toISOString();
  const talleres = [];
  const tanda = ctx.db.transaction(() => {
    for (let i = 0; i < n; i++) {
      const email = `${prefijo}${i}@prueba.test`;
      const id = Number(insWs.run(email, 'x'.repeat(64), `Taller ${prefijo} ${i}`).lastInsertRowid);
      const token = crypto.randomBytes(24).toString('base64url');
      insSes.run(hashToken(token), id, expira);
      talleres.push({ id, email, token, nombre: `Taller ${prefijo} ${i}` });
    }
  });
  tanda();
  return talleres;
}

/* Cliente HTTP atado a un taller sembrado. Usa la cabecera Authorization, que
   `requireWorkshop` acepta igual que la cookie, para no depender del tarro. */
function clienteDe(ctx, taller) {
  const auth = { authorization: `Bearer ${taller.token}` };
  const con = (o = {}) => ({ ...o, headers: { ...auth, ...(o.headers || {}) } });
  const c = crearCliente(ctx.base);
  return {
    taller,
    get: (p, o) => c.get(p, con(o)),
    post: (p, b, o) => c.post(p, b, con(o)),
    put: (p, b, o) => c.put(p, b, con(o)),
    del: (p, o) => c.del(p, con(o)),
  };
}

module.exports = {
  exigirEntornoSeguro, opciones, generador, Reporte, lote, percentiles,
  cronometrar, nuevoServidor, sembrarTalleres, clienteDe, hashToken, silenciarHttp,
};
