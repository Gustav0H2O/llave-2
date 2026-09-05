'use strict';
/* ============================================================================
   ROBOT DE REGISTRO

   Cubre el alta de cuenta de taller de punta a punta y a volumen:

     A. Matriz de validación — todo lo que el formulario puede recibir mal.
     B. Normalización — mayúsculas, espacios, recorte a 120 caracteres.
     C. Limitador — que 20/min de verdad frene, y que sea 429 y no 500.
     D. Alta masiva concurrente — N cuentas, ids y sesiones únicas.
     E. Carrera por el mismo correo — K altas simultáneas del MISMO correo.
     F. Ciclo de sesión — login, sesiones paralelas, logout selectivo.

   Uso:
     node test/robots/registro.js --cuentas=300 --concurrencia=25

   Sobre el limitador: `authLimiter` deja pasar 20 peticiones por minuto y por
   IP, y todo esto sale de 127.0.0.1. En vez de desactivarlo (sería apagar
   justo lo que hay que comprobar) se levanta un servidor nuevo por tanda: cada
   app trae su propio contador en memoria. Montar la app cuesta ~50 ms.
   ========================================================================= */
const {
  exigirEntornoSeguro, opciones, Reporte, lote, percentiles, cronometrar, nuevoServidor, silenciarHttp,
} = require('./comun');
const { crearCliente } = require('../helpers');

exigirEntornoSeguro();

const o = opciones({ cuentas: 300, concurrencia: 20, carrera: 12 });
const CLAVE = 'clave-larga-123';
/* Por debajo de los 20/min del limitador, con margen para los reintentos. */
const POR_TANDA = 15;

/* --------------------------------------------------------------------------
   A. Matriz de validación
   ------------------------------------------------------------------------ */
const CASOS = [
  // [descripción, cuerpo, estado esperado]
  ['correo sin arroba',            { email: 'sinarroba.test', password: CLAVE, name: 'T' }, 400],
  ['correo sin dominio',           { email: 'a@', password: CLAVE, name: 'T' }, 400],
  ['correo sin punto',             { email: 'a@b', password: CLAVE, name: 'T' }, 400],
  ['correo con espacio',           { email: 'a b@c.test', password: CLAVE, name: 'T' }, 400],
  ['correo vacío',                 { email: '', password: CLAVE, name: 'T' }, 400],
  ['correo ausente',               { password: CLAVE, name: 'T' }, 400],
  ['correo nulo',                  { email: null, password: CLAVE, name: 'T' }, 400],
  ['correo numérico',              { email: 12345, password: CLAVE, name: 'T' }, 400],
  ['correo objeto',                { email: { a: 1 }, password: CLAVE, name: 'T' }, 400],
  ['correo array',                 { email: ['a@b.test'], password: CLAVE, name: 'T' }, 400],
  ['clave de 9 caracteres',        { email: 'c9@prueba.test', password: '123456789', name: 'T' }, 400],
  ['clave vacía',                  { email: 'c0@prueba.test', password: '', name: 'T' }, 400],
  ['clave ausente',                { email: 'cx@prueba.test', name: 'T' }, 400],
  ['clave numérica',               { email: 'cn@prueba.test', password: 12345678, name: 'T' }, 400],
  ['nombre vacío',                 { email: 'nv@prueba.test', password: CLAVE, name: '' }, 400],
  ['nombre solo espacios',         { email: 'ne@prueba.test', password: CLAVE, name: '   ' }, 400],
  ['nombre ausente',               { email: 'na@prueba.test', password: CLAVE }, 400],
  ['cuerpo vacío',                 {}, 400],
  ['clave de exactamente 10',      { email: 'c10@prueba.test', password: 'clave10seg', name: 'T' }, 201],
  ['correo con +etiqueta',         { email: 'taller+sucursal@prueba.test', password: CLAVE, name: 'T' }, 201],
  ['correo con guiones',           { email: 'mi-taller.sur@pru-eba.test', password: CLAVE, name: 'T' }, 201],
  ['nombre con acentos y ñ',       { email: 'ac@prueba.test', password: CLAVE, name: 'Taller Muñoz Diésel' }, 201],
  ['nombre con emoji',             { email: 'em@prueba.test', password: CLAVE, name: 'Taller 🔧' }, 201],
  ['clave larguísima (1000)',      { email: 'cl@prueba.test', password: 'z'.repeat(1000), name: 'T' }, 201],
];

async function matrizValidacion(rep) {
  rep.seccion('A. Matriz de validación del formulario de alta');
  for (let i = 0; i < CASOS.length; i += POR_TANDA) {
    const ctx = await nuevoServidor();
    try {
      for (const [desc, cuerpo, esperado] of CASOS.slice(i, i + POR_TANDA)) {
        const c = crearCliente(ctx.base);
        const r = await c.post('/api/auth/register', cuerpo);
        rep.comprobar(r.status === esperado, `«${desc}» debe responder ${esperado}`, `respondió ${r.status} ${JSON.stringify(r.body).slice(0, 90)}`);
        if (r.status >= 400 && r.status < 500) {
          rep.comprobar(typeof r.body?.error === 'string' && r.body.error.length > 0,
            `«${desc}» trae mensaje de error`, JSON.stringify(r.body).slice(0, 90));
          rep.comprobar(!/\bat\s+\/|node_modules|SqliteError|\.js:\d+/.test(JSON.stringify(r.body)),
            `«${desc}» no filtra traza interna`, JSON.stringify(r.body).slice(0, 120));
        }
      }
    } finally { ctx.cerrar(); }
  }
  rep.hito(`${CASOS.length} casos de validación comprobados`);
}

/* --------------------------------------------------------------------------
   B. Normalización de entrada
   ------------------------------------------------------------------------ */
async function normalizacion(rep) {
  rep.seccion('B. Normalización de correo y recortes');
  const ctx = await nuevoServidor();
  try {
    const c1 = crearCliente(ctx.base);
    const alta = await c1.post('/api/auth/register', { email: '  MAYUSCULAS@Prueba.TEST  ', password: CLAVE, name: '  Taller Con Espacios  ' });
    rep.comprobar(alta.status === 201, 'alta con correo en mayúsculas y espacios', `estado ${alta.status}`);
    rep.comprobar(alta.body?.email === 'mayusculas@prueba.test',
      'el correo se guarda en minúsculas y sin espacios', `guardó «${alta.body?.email}»`);

    /* El mismo correo en otra caja tiene que chocar: si no, dos cuentas
       distintas comparten identidad y el login se vuelve ambiguo. */
    const c2 = crearCliente(ctx.base);
    const dup = await c2.post('/api/auth/register', { email: 'MAYUSCULAS@PRUEBA.TEST', password: CLAVE, name: 'Otro' });
    rep.comprobar(dup.status === 409, 'el mismo correo en otra caja se rechaza con 409', `estado ${dup.status}`);

    /* Y el login tiene que aceptarlo escrito de cualquier forma. */
    const c3 = crearCliente(ctx.base);
    const log = await c3.post('/api/auth/login', { email: 'MaYuScUlAs@Prueba.Test', password: CLAVE });
    rep.comprobar(log.status === 200, 'el login normaliza igual que el alta', `estado ${log.status}`);

    const largo = crearCliente(ctx.base);
    const rl = await largo.post('/api/auth/register', { email: 'l'.repeat(200) + '@prueba.test', password: CLAVE, name: 'T' });
    rep.comprobar(rl.status === 400 || rl.status === 201,
      'un correo de 200+ caracteres se recorta o se rechaza, nunca revienta', `estado ${rl.status}`);
    rep.comprobar(rl.status !== 500, 'un correo larguísimo no produce 500', `estado ${rl.status}`);
  } finally { ctx.cerrar(); }
}

/* --------------------------------------------------------------------------
   C. Limitador de intentos
   ------------------------------------------------------------------------ */
async function limitador(rep) {
  rep.seccion('C. Limitador de altas (authLimiter: 20/min por IP)');
  process.env.AUTH_LIMIT = '20';
  let ctx;
  try {
    ctx = await nuevoServidor();
    delete process.env.AUTH_LIMIT;
    const estados = [];
    for (let i = 0; i < 30; i++) {
      const c = crearCliente(ctx.base);
      const r = await c.post('/api/auth/register', { email: `lim${i}@prueba.test`, password: CLAVE, name: `T${i}` });
      estados.push(r.status);
    }
    const limitadas = estados.filter(s => s === 429).length;
    const creadas = estados.filter(s => s === 201).length;
    rep.comprobar(limitadas > 0, 'el limitador frena el exceso de altas', `30 intentos y ningún 429: ${JSON.stringify(estados)}`);
    rep.comprobar(creadas <= 20, 'no deja pasar más de 20 altas por ventana', `pasaron ${creadas}`);
    rep.comprobar(!estados.includes(500), 'el limitador responde 429, nunca 500', `estados: ${[...new Set(estados)].join(',')}`);
    rep.nota(`de 30 intentos: ${creadas} creadas, ${limitadas} frenadas con 429`);

    /* Que frene no puede significar que rompa: la app tiene que seguir
       sirviendo el catálogo, que no está detrás de este limitador. */
    const publico = await crearCliente(ctx.base).get('/api/meta');
    rep.comprobar(publico.status === 200, 'con el limitador activo el catálogo público sigue respondiendo', `estado ${publico.status}`);
  } finally {
    delete process.env.AUTH_LIMIT;
    if (ctx) ctx.cerrar();
  }
}

/* --------------------------------------------------------------------------
   D. Alta masiva concurrente
   ------------------------------------------------------------------------ */
async function masivo(rep) {
  rep.seccion(`D. Alta masiva: ${o.cuentas} cuentas, concurrencia ${o.concurrencia}`);
  const correos = new Set();
  const latencias = [];
  let creadas = 0, frenadas = 0, otras = 0;

  for (let base = 0; base < o.cuentas; base += POR_TANDA) {
    const enTanda = Math.min(POR_TANDA, o.cuentas - base);
    const ctx = await nuevoServidor();
    /* Los ids se comprueban POR TANDA, no globalmente: cada tanda estrena
       servidor y base en memoria, así que la secuencia vuelve a empezar en 1 y
       coleccionarlos entre tandas daría falsos repetidos. Los correos sí son
       únicos de verdad entre tandas y por eso se acumulan. */
    const ids = new Set();
    try {
      const res = await lote(enTanda, o.concurrencia, async (i) => {
        const n = base + i;
        const c = crearCliente(ctx.base);
        const { valor, ms } = await cronometrar(() =>
          c.post('/api/auth/register', { email: `masivo${n}@prueba.test`, password: CLAVE, name: `Taller Masivo ${n}` }));
        latencias.push(ms);
        return valor;
      });
      for (const r of res) {
        if (!r.ok) { otras++; continue; }
        const { status, body } = r.valor;
        if (status === 201) {
          creadas++;
          rep.comprobar(Number.isInteger(body?.id) && body.id > 0, 'el alta devuelve un id entero', JSON.stringify(body).slice(0, 80));
          rep.comprobar(!ids.has(body.id), 'el id del taller no se repite', `id repetido: ${body.id}`);
          rep.comprobar(!correos.has(body.email), 'el correo no se repite', `correo repetido: ${body.email}`);
          rep.comprobar(!('pass_hash' in (body || {})), 'la respuesta no filtra el hash de la contraseña', JSON.stringify(body).slice(0, 80));
          ids.add(body.id); correos.add(body.email);
        } else if (status === 429) frenadas++;
        else { otras++; rep.comprobar(false, `alta masiva responde ${status}`, JSON.stringify(body).slice(0, 90)); }
      }
      /* La base tiene que contener exactamente las que dijo haber creado. */
      const enBase = ctx.db.prepare('SELECT COUNT(*) n FROM workshops').get().n;
      const conSesion = ctx.db.prepare('SELECT COUNT(DISTINCT workshop_id) n FROM sessions').get().n;
      const creadasTanda = res.filter(r => r.ok && r.valor.status === 201).length;
      rep.comprobar(enBase === creadasTanda, 'la base guarda exactamente las cuentas creadas', `HTTP dijo ${creadasTanda}, hay ${enBase}`);
      rep.comprobar(conSesion === creadasTanda, 'cada alta deja exactamente una sesión abierta', `${creadasTanda} altas, ${conSesion} con sesión`);
    } finally { ctx.cerrar(); }
  }

  const p = percentiles(latencias);
  rep.nota(`${creadas} creadas · ${frenadas} frenadas por el limitador · ${otras} anómalas`);
  rep.nota(`latencia del alta: p50 ${p.p50}ms · p95 ${p.p95}ms · p99 ${p.p99}ms · máx ${p.max}ms`);
  rep.comprobar(otras === 0, 'ninguna alta terminó en estado inesperado', `${otras} anómalas`);
}

/* --------------------------------------------------------------------------
   D2. ¿El alta congela al resto de la app?
   --------------------------------------------------------------------------
   `hashPassword` usa `crypto.scryptSync`, la variante SÍNCRONA, con N=16384.
   Que un KDF sea lento es correcto y deliberado —es su defensa—, pero al ser
   síncrono bloquea el bucle de eventos de Node: mientras se calcula, el
   proceso ENTERO está parado y no puede atender ninguna otra petición.

   Esto no lo ve una prueba unitaria, que mide una petición sola. La medida que
   importa es esta: cuánto tarda una consulta de catálogo —el mecánico
   buscando una presión— mientras alguien se está registrando al lado.
   Se compara con la misma consulta en reposo. */
async function bloqueoDelBucle(rep) {
  rep.seccion('D2. Impacto del alta sobre el resto de la app (bucle de eventos)');
  const ctx = await nuevoServidor();
  try {
    /* Se mide el RETRASO DEL BUCLE DE EVENTOS, no la latencia de una petición
       cualquiera. Un temporizador de 20 ms que tarda 200 en dispararse solo
       puede significar una cosa: el hilo estuvo ocupado y no pudo atender
       nada. Es una medida determinista —no depende de que una sonda HTTP
       caiga por casualidad dentro de un scrypt— y es exactamente la magnitud
       que importa: mientras el bucle está parado, el servidor entero lo está. */
    const medirRetraso = (durante) => new Promise((resolve) => {
      const muestras = [];
      const hasta = Date.now() + durante;
      let previo = process.hrtime.bigint();
      const tic = () => {
        const ahora = process.hrtime.bigint();
        muestras.push(Number(ahora - previo) / 1e6 - 20);
        previo = ahora;
        if (Date.now() < hasta) setTimeout(tic, 20);
        else resolve(muestras.map(m => Math.max(0, m)));
      };
      setTimeout(tic, 20);
    });

    const enReposo = percentiles(await medirRetraso(700));

    const midiendo = medirRetraso(1500);
    await lote(8, 8, async (i) => crearCliente(ctx.base)
      .post('/api/auth/register', { email: `bloqueo${i}@prueba.test`, password: CLAVE, name: `T${i}` }));
    const conAltas = percentiles(await midiendo);

    rep.nota(`retraso del bucle en reposo:       p50 ${enReposo.p50}ms · p95 ${enReposo.p95}ms · máx ${enReposo.max}ms`);
    rep.nota(`retraso del bucle con 8 altas:     p50 ${conAltas.p50}ms · p95 ${conAltas.p95}ms · máx ${conAltas.max}ms`);
    /* FT-0003: el hash pasó a crypto.scrypt() asíncrono. El KDF sigue costando
       su CPU (~100 ms por alta), pero ya NO bloquea el hilo: por eso el retraso
       del bucle con altas se queda en el orden del reposo. */

    /* 120ms es un scrypt entero: si el bucle se para tanto, ninguna otra
       petición se atiende durante ese tiempo, venga de quien venga. */
    rep.comprobar(conAltas.max < 120,
      'un alta no deja el bucle de eventos parado más de 120ms',
      `se paró ${conAltas.max}ms de golpe (en reposo: ${enReposo.max}ms) — crypto.scryptSync es SÍNCRONO y congela el proceso entero; crypto.scrypt() asíncrono hace el mismo trabajo sin bloquear`);

    /* Y la consecuencia visible, para que quede en el informe con su cifra. */
    const consulta = async () => (await cronometrar(() => crearCliente(ctx.base).get('/api/vehicles?limit=20'))).ms;
    const sondas = [];
    const sondeando = (async () => { const h = Date.now() + 1200; while (Date.now() < h) sondas.push(await consulta()); })();
    await lote(6, 6, async (i) => crearCliente(ctx.base)
      .post('/api/auth/register', { email: `sonda${i}@prueba.test`, password: CLAVE, name: `T${i}` }));
    await sondeando;
    const c = percentiles(sondas);
    rep.nota(`consulta de catálogo mientras hay altas: p50 ${c.p50}ms · p95 ${c.p95}ms · máx ${c.max}ms`);
  } finally { ctx.cerrar(); }
}

/* --------------------------------------------------------------------------
   E. Carrera por el mismo correo
   ------------------------------------------------------------------------ */
/* El alta comprueba si el correo existe y DESPUÉS inserta. Entre las dos
   operaciones cabe otra petición: si el UNIQUE de la columna no estuviera, se
   crearían dos cuentas con el mismo correo y el login sería ambiguo para
   siempre. Y si está pero el error no se captura, sale un 500 en vez del 409.
   Este caso comprueba las dos cosas a la vez. */
async function carreraDeCorreo(rep) {
  rep.seccion(`E. Carrera: ${o.carrera} altas simultáneas del MISMO correo`);
  const ctx = await nuevoServidor();
  try {
    const res = await lote(o.carrera, o.carrera, async () => {
      const c = crearCliente(ctx.base);
      return c.post('/api/auth/register', { email: 'carrera@prueba.test', password: CLAVE, name: 'Taller Carrera' });
    });
    const estados = res.map(r => (r.ok ? r.valor.status : 'error'));
    const creadas = estados.filter(s => s === 201).length;
    const chocadas = estados.filter(s => s === 409).length;
    const rotas = estados.filter(s => s === 500 || s === 'error').length;

    rep.comprobar(creadas === 1, 'exactamente UNA de las altas simultáneas gana', `ganaron ${creadas} — ${JSON.stringify(estados)}`);
    rep.comprobar(rotas === 0, 'ninguna alta simultánea produce 500', `${rotas} rotas — ${JSON.stringify(estados)}`);
    rep.comprobar(creadas + chocadas + estados.filter(s => s === 429).length === o.carrera,
      'todas las altas simultáneas terminan en 201, 409 o 429', JSON.stringify(estados));

    const filas = ctx.db.prepare('SELECT COUNT(*) n FROM workshops WHERE email = ?').get('carrera@prueba.test').n;
    rep.comprobar(filas === 1, 'la base contiene una sola fila para ese correo', `hay ${filas} filas`);
  } finally { ctx.cerrar(); }
}

/* --------------------------------------------------------------------------
   F. Ciclo de vida de la sesión
   ------------------------------------------------------------------------ */
async function ciclosDeSesion(rep) {
  rep.seccion('F. Sesiones: login múltiple, aislamiento y cierre selectivo');
  const ctx = await nuevoServidor();
  try {
    const alta = crearCliente(ctx.base);
    const r = await alta.post('/api/auth/register', { email: 'sesion@prueba.test', password: CLAVE, name: 'Taller Sesión' });
    rep.comprobar(r.status === 201, 'alta de la cuenta de prueba', `estado ${r.status}`);
    rep.comprobar(/no-store/.test(r.headers.get('cache-control') || ''),
      'el alta responde con Cache-Control: no-store', `cabecera «${r.headers.get('cache-control')}»`);

    const yo = await alta.get('/api/auth/me');
    rep.comprobar(yo.status === 200 && yo.body?.email === 'sesion@prueba.test', 'la sesión del alta sirve para /api/auth/me', `estado ${yo.status}`);
    rep.comprobar(!('pass_hash' in (yo.body || {})), '/api/auth/me no filtra el hash de la contraseña', Object.keys(yo.body || {}).join(','));

    /* Dos dispositivos del mismo taller: el segundo login no puede tirar al
       primero — el dueño usa el celular en la rampa y la tablet en el mostrador. */
    const segundo = crearCliente(ctx.base);
    const log2 = await segundo.post('/api/auth/login', { email: 'sesion@prueba.test', password: CLAVE });
    rep.comprobar(log2.status === 200, 'segundo login del mismo taller', `estado ${log2.status}`);
    rep.comprobar((await alta.get('/api/auth/me')).status === 200, 'la primera sesión sigue viva tras el segundo login');
    rep.comprobar((await segundo.get('/api/auth/me')).status === 200, 'la segunda sesión también vale');

    /* Y cerrar una no puede cerrar la otra. */
    await segundo.post('/api/auth/logout', {});
    rep.comprobar((await segundo.get('/api/auth/me')).status === 401, 'tras el logout la sesión cerrada ya no vale');
    rep.comprobar((await alta.get('/api/auth/me')).status === 200, 'el logout de un dispositivo NO cierra el otro');

    // Credenciales incorrectas
    const malaClave = await crearCliente(ctx.base).post('/api/auth/login', { email: 'sesion@prueba.test', password: 'incorrecta-larga' });
    rep.comprobar(malaClave.status === 401, 'contraseña incorrecta responde 401', `estado ${malaClave.status}`);
    const noExiste = await crearCliente(ctx.base).post('/api/auth/login', { email: 'fantasma@prueba.test', password: CLAVE });
    rep.comprobar(noExiste.status === 401, 'cuenta inexistente responde 401', `estado ${noExiste.status}`);
    /* Mismo texto en los dos: un mensaje distinto revela qué correos existen. */
    rep.comprobar(malaClave.body?.error === noExiste.body?.error,
      'el error no distingue «clave mala» de «cuenta inexistente»', `«${malaClave.body?.error}» vs «${noExiste.body?.error}»`);

    // Tokens inventados
    for (const [desc, token] of [['vacío', ''], ['basura', 'aaaa'], ['de otro formato', 'Bearer x'], ['larguísimo', 'z'.repeat(500)]]) {
      const res = await crearCliente(ctx.base).get('/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
      rep.comprobar(res.status === 401, `un token ${desc} responde 401`, `estado ${res.status}`);
    }

    // Sesión caducada: se escribe con fecha pasada y tiene que rechazarse y limpiarse
    const crypto = require('node:crypto');
    const { hashToken } = require('./comun');
    const tokenViejo = crypto.randomBytes(24).toString('base64url');
    const ws = ctx.db.prepare('SELECT id FROM workshops WHERE email = ?').get('sesion@prueba.test');
    ctx.db.prepare('INSERT INTO sessions (token_hash, workshop_id, expires_at) VALUES (?,?,?)')
      .run(hashToken(tokenViejo), ws.id, new Date(Date.now() - 3600_000).toISOString());
    const cad = await crearCliente(ctx.base).get('/api/auth/me', { headers: { authorization: `Bearer ${tokenViejo}` } });
    rep.comprobar(cad.status === 401, 'una sesión caducada responde 401', `estado ${cad.status}`);
    const quedan = ctx.db.prepare('SELECT COUNT(*) n FROM sessions WHERE token_hash = ?').get(hashToken(tokenViejo)).n;
    rep.comprobar(quedan === 0, 'la sesión caducada se borra al detectarla', `quedan ${quedan} filas`);
  } finally { ctx.cerrar(); }
}

/* ------------------------------------------------------------------------ */
async function main() {
  const restaurar = silenciarHttp();
  const rep = new Reporte('Registro y sesiones');
  try {
    await matrizValidacion(rep);
    await normalizacion(rep);
    await limitador(rep);
    await masivo(rep);
    await bloqueoDelBucle(rep);
    await carreraDeCorreo(rep);
    await ciclosDeSesion(rep);
  } finally { restaurar(); }
  return rep.resumen();
}

if (require.main === module) {
  main().then(ok => process.exit(ok ? 0 : 1))
    .catch(e => { console.error('\n💥 El robot de registro reventó:\n', e); process.exit(1); });
}
module.exports = { main };
