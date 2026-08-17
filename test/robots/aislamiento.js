'use strict';
/* ============================================================================
   ROBOT DE AISLAMIENTO ENTRE TALLERES

   El riesgo número uno de este producto, tal cual lo dice AGENTS.md §4.5: los
   talleres COMPARTEN TABLAS. Una sola consulta sin `workshop_id` en el WHERE es
   una fuga de datos de un negocio a otro — el inventario, los clientes y la
   caja de un taller visibles desde la cuenta de otro.

   Las suites de `test/qa/` comprueban esto a mano en unas cuantas rutas. Este
   robot lo hace al revés y de forma exhaustiva: LEE las rutas protegidas
   directamente de server-pg.js (con `rutasDeclaradas()`), crea datos reales en
   el taller B y luego intenta alcanzarlos TODOS desde la sesión del taller A.
   Cuando alguien añada una ruta nueva y se olvide del filtro, esto la caza sin
   que nadie tenga que acordarse de escribir la prueba.

   Tres formas de fuga, y las tres se comprueban:
     1. Lectura   — A pide el recurso de B por id y lo recibe.
     2. Escritura — A modifica o borra el recurso de B.
     3. Listado   — el listado de A incluye filas de B.

   Uso: node test/robots/aislamiento.js [--talleres=8]
   ========================================================================= */
const {
  exigirEntornoSeguro, opciones, Reporte, nuevoServidor, sembrarTalleres, clienteDe, silenciarHttp,
} = require('./comun');
const { rutasDeclaradas } = require('../helpers');

exigirEntornoSeguro();
const o = opciones({ talleres: 8 });

/* Marcador único e inconfundible: si aparece en una respuesta de A, la fuga es
   segura y no una coincidencia de datos de catálogo. */
const MARCA = 'SECRETO-DEL-TALLER-B-9F3K';
/* PNG de 1×1 transparente: el endpoint de fotos exige una data URL de imagen. */
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/* --------------------------------------------------------------------------
   Puebla un taller con una fila en cada tabla de negocio y devuelve los ids.
   ------------------------------------------------------------------------ */
async function poblar(cli, marca) {
  const ids = {};
  const r = async (p, b) => (await cli.post(p, b)).body;

  ids.cliente = (await r('/api/clients', { name: `Cliente ${marca}`, phone: '5512345678', city: `Ciudad ${marca}` }))?.id;
  ids.vehiculo = (await r(`/api/clients/${ids.cliente}/vehicles`, { brand: 'Nissan', model: `Tsuru ${marca}`, year: 2015, plate: 'ABC123' }))?.id;
  ids.pieza = (await r('/api/inventory', { name: `Pila ${marca}`, sku: `SKU-${marca}`, qty: 10, unit_price: 850 }))?.id;
  ids.orden = (await r('/api/orders', { title: `Orden ${marca}`, client_id: ids.cliente, vehicle_id: ids.vehiculo, descr: `Falla ${marca}` }))?.id;
  ids.partida = (await r(`/api/orders/${ids.orden}/items`, { descr: `Partida ${marca}`, qty: 1, unit_price: 500 }))?.id;
  ids.foto = (await r(`/api/orders/${ids.orden}/photos`, { photo: PNG_1PX, caption: `Foto ${marca}` }))?.id;
  ids.documento = (await r('/api/documents', { kind: 'entrega', client_id: ids.cliente, order_id: ids.orden, items: [{ descr: `Concepto ${marca}`, qty: 1, unit_price: 900 }] }))?.id;
  ids.nota = (await r('/api/notes', { text: `Nota ${marca}`, vehicle_ref: `Ref ${marca}` }))?.id;
  ids.caja = (await r('/api/cash', { concept: `Movimiento ${marca}`, amount: 1234, type: 'ingreso' }))?.id;
  ids.diagnostico = (await r('/api/diagnostics', { measured_psi: 55, brand: 'Nissan', model: `Tsuru ${marca}`, year: 2015, notes: `Diagnóstico ${marca}` }))?.id;
  return ids;
}

/* Sustituye los parámetros de una ruta declarada por los ids reales de B.
   Devuelve null cuando la ruta lleva un parámetro que no sabemos rellenar:
   mejor no probarla que probarla con basura y creer que está a salvo. */
function concretar(ruta, ids) {
  /* Sin parámetros no hay nada que atacar: `GET /api/notes` devuelve las notas
     DE QUIEN PREGUNTA, así que un 200 ahí es lo correcto, no una fuga. Esas
     rutas se comprueban en la fase 3, buscando el marcador de B dentro del
     listado de A, que es donde la fuga sí sería demostrable. */
  if (!ruta.includes(':')) return null;
  const mapa = {
    ':id': null, ':iid': ids.partida, ':pid': ids.foto, ':vid': ids.vehiculo, ':slug': null,
  };
  const porPrefijo = [
    [/^\/api\/clients\/:id/, ids.cliente], [/^\/api\/inventory\/:id/, ids.pieza],
    [/^\/api\/orders\/:id/, ids.orden], [/^\/api\/documents\/:id/, ids.documento],
    [/^\/api\/notes\/:id/, ids.nota], [/^\/api\/cash\/:id/, ids.caja],
  ];
  let out = ruta;
  if (out.includes(':id')) {
    const hit = porPrefijo.find(([re]) => re.test(ruta));
    if (!hit || hit[1] == null) return null;
    out = out.replace(':id', String(hit[1]));
  }
  for (const [p, v] of Object.entries(mapa)) {
    if (p === ':id' || !out.includes(p)) continue;
    if (v == null) return null;
    out = out.replace(p, String(v));
  }
  return out.includes(':') ? null : out;
}

/* Cuerpo mínimo válido para que la ruta llegue a la comprobación de propiedad
   y no se quede antes en un 400 de validación —un 400 no demuestra nada. */
function cuerpoPara(ruta) {
  if (/\/orders\/\d+\/items/.test(ruta)) return { descr: 'intruso', qty: 1, unit_price: 1 };
  if (/\/orders\/\d+\/photos/.test(ruta)) return { photo: PNG_1PX, caption: 'intruso' };
  if (/\/orders\/\d+\/status/.test(ruta)) return { status: 'listo' };
  if (/\/documents\/\d+\/status/.test(ruta)) return { status: 'pagado' };
  if (/\/inventory\/\d+\/moves/.test(ruta)) return { kind: 'entrada', qty: 1 };
  if (/\/clients\/\d+\/vehicles/.test(ruta)) return { brand: 'Intruso', model: 'X', year: 2020 };
  if (/\/api\/clients\/\d+$/.test(ruta)) return { name: 'Renombrado por intruso' };
  if (/\/api\/inventory\/\d+$/.test(ruta)) return { name: 'Renombrado', qty: 99 };
  if (/\/api\/orders\/\d+$/.test(ruta)) return { title: 'Renombrado por intruso' };
  return { name: 'intruso', text: 'intruso', concept: 'intruso', amount: 1 };
}

/* El limitador global de /api deja pasar 120 peticiones por minuto y por IP, y
   un barrido completo pasa de largo esa cifra. Cada fase estrena servidor —y
   con él, contador— en vez de desactivar el limitador: así se sigue midiendo
   la app tal cual corre en producción. Si aun así aparece un 429, es que la
   fase creció demasiado; se avisa como límite del robot y no como fallo de la
   app, que es lo que confundiría a quien lea el informe. */
async function conServidor(rep, fn) {
  const ctx = await nuevoServidor();
  try { return await fn(ctx); } finally { ctx.cerrar(); }
}

function vigilarLimite(rep, res, etiqueta) {
  if (res.status === 429) {
    rep.nota(`⚠ ${etiqueta} recibió 429: la fase supera las 120 peticiones/min del limitador global. Divídela.`);
    return true;
  }
  return false;
}

async function faseAtaque(rep) {
  return conServidor(rep, async (ctx) => {
    const [tallerA, tallerB] = sembrarTalleres(ctx, 2, 'aisla');
    const A = clienteDe(ctx, tallerA);
    const B = clienteDe(ctx, tallerB);

    rep.seccion('Preparación: se puebla el taller B con datos marcados');
    const idsB = await poblar(B, MARCA);
    const faltan = Object.entries(idsB).filter(([, v]) => v == null).map(([k]) => k);
    rep.comprobar(faltan.length === 0, 'el taller B queda poblado en todas las tablas', `sin crear: ${faltan.join(', ')}`);
    rep.nota(`ids de B: ${Object.entries(idsB).map(([k, v]) => `${k}=${v}`).join(' ')}`);

    /* ---------------------------------------------------------------
       1 y 2. A intenta alcanzar cada recurso de B, leyendo y escribiendo
       --------------------------------------------------------------- */
    rep.seccion('1+2. El taller A intenta alcanzar cada recurso del taller B');
    const protegidas = rutasDeclaradas().filter(r => r.protegida);
    let probadas = 0, saltadas = 0;

    for (const r of protegidas) {
      const ruta = concretar(r.ruta, idsB);
      if (!ruta) { saltadas++; continue; }
      probadas++;
      const peticion = {
        GET: () => A.get(ruta),
        DELETE: () => A.del(ruta),
        POST: () => A.post(ruta, cuerpoPara(ruta)),
        PUT: () => A.put(ruta, cuerpoPara(ruta)),
      }[r.metodo];
      if (!peticion) { saltadas++; probadas--; continue; }

      const res = await peticion();
      const etiqueta = `${r.metodo} ${r.ruta}`;
      if (vigilarLimite(rep, res, etiqueta)) continue;

      /* La prueba definitiva de fuga es el MARCADOR: si el texto de B aparece
         en una respuesta pedida con la sesión de A, la consulta no filtró por
         workshop_id. Vale para cualquier método y no depende del código. */
      const texto = typeof res.body === 'string' ? res.body : JSON.stringify(res.body || {});
      rep.comprobar(!texto.includes(MARCA),
        `la respuesta de ${etiqueta} no filtra datos de B`,
        `apareció el marcador en: ${texto.slice(0, 120)} — FUGA ENTRE TALLERES`);

      /* Escribir sobre un recurso ajeno no admite matices: cualquier 2xx en un
         POST/PUT/DELETE contra una fila de B es una fuga de escritura. En un
         GET, en cambio, un 200 con la lista vacía es una respuesta legítima
         (el recurso no existe PARA A) y ahí manda el marcador de arriba. */
      if (r.metodo !== 'GET') {
        rep.comprobar(res.status < 200 || res.status >= 300,
          `A no puede escribir sobre ${etiqueta} de B`,
          `respondió ${res.status} — FUGA DE ESCRITURA`);
      }
      rep.comprobar(res.status !== 500, `${etiqueta} de B no revienta con 500`, `respondió ${res.status}`);
    }
    rep.hito(`${probadas} rutas protegidas atacadas desde la cuenta ajena (${saltadas} sin parámetro deducible)`);

    /* Después del ataque, los datos de B tienen que seguir intactos: un DELETE
       que responde 404 pero borra igual sería el peor de los casos. */
    rep.seccion('Los datos de B sobreviven intactos al ataque');
    for (const [nombre, ruta] of [
      ['clientes', '/api/clients'], ['inventario', '/api/inventory'], ['órdenes', '/api/orders'],
      ['documentos', '/api/documents'], ['notas', '/api/notes'], ['caja', '/api/cash'],
    ]) {
      const res = await B.get(ruta);
      const filas = Array.isArray(res.body) ? res.body : (res.body?.items || res.body?.rows || []);
      rep.comprobar(res.status === 200 && filas.length >= 1,
        `B conserva sus ${nombre} tras el ataque`, `estado ${res.status}, ${filas.length} filas`);
    }

    /* ---------------------------------------------------------------
       3. Los listados de A no pueden contener nada de B
       --------------------------------------------------------------- */
    rep.seccion('3. Los listados del taller A no contienen nada del taller B');
    const listados = protegidas
      .filter(r => r.metodo === 'GET' && !r.ruta.includes(':'))
      .map(r => r.ruta);
    for (const ruta of listados) {
      const res = await A.get(ruta);
      const texto = typeof res.body === 'string' ? res.body : JSON.stringify(res.body || {});
      rep.comprobar(!texto.includes(MARCA),
        `GET ${ruta} de A no incluye datos de B`,
        `apareció el marcador: ${texto.slice(0, 140)}`);
      rep.comprobar(res.status < 500, `GET ${ruta} responde sin error de servidor`, `estado ${res.status}`);
    }
    rep.hito(`${listados.length} listados comprobados`);
    return { protegidas, idsB };
  });
}

/* ---------------------------------------------------------------
   4. Muchos talleres a la vez: que el filtro aguante con volumen
   --------------------------------------------------------------- */
async function faseVolumen(rep) {
  return conServidor(rep, async (ctx) => {
    rep.seccion(`4. ${o.talleres} talleres poblados en paralelo, cada uno ve solo lo suyo`);
    const muchos = sembrarTalleres(ctx, o.talleres, 'multi');
    const clientes = muchos.map(t => clienteDe(ctx, t));
    await Promise.all(clientes.map((c, i) => c.post('/api/clients', { name: `Cliente exclusivo de ${i}`, city: `Ciudad ${i}` })));
    await Promise.all(clientes.map((c, i) => c.post('/api/notes', { text: `Nota exclusiva de ${i}` })));
    await Promise.all(clientes.map((c, i) => c.post('/api/cash', { concept: `Caja exclusiva de ${i}`, amount: 100 + i })));

    for (let i = 0; i < clientes.length; i++) {
      for (const [ruta, patron] of [['/api/clients', 'Cliente exclusivo de'], ['/api/notes', 'Nota exclusiva de'], ['/api/cash', 'Caja exclusiva de']]) {
        const res = await clientes[i].get(ruta);
        if (vigilarLimite(rep, res, `GET ${ruta}`)) continue;
        const texto = JSON.stringify(res.body || {});
        const ajenos = [...texto.matchAll(new RegExp(`${patron} (\\d+)`, 'g'))].map(m => Number(m[1])).filter(n => n !== i);
        rep.comprobar(ajenos.length === 0,
          `el taller ${i} solo ve sus propias filas en ${ruta}`,
          `también vio las de: ${[...new Set(ajenos)].join(', ')}`);
      }
    }
    rep.hito(`${o.talleres} talleres × 3 listados comprobados sin cruces`);
  });
}

/* ---------------------------------------------------------------
   5. Sin sesión no se entra a ninguna parte
   --------------------------------------------------------------- */
async function faseAnonima(rep, protegidas) {
  return conServidor(rep, async (ctx) => {
    rep.seccion('5. Sin sesión, toda ruta protegida responde 401');
    const { crearCliente } = require('../helpers');
    const [tallerB] = sembrarTalleres(ctx, 1, 'anon');
    const idsB = await poblar(clienteDe(ctx, tallerB), 'ANON');
    const anonimo = crearCliente(ctx.base);
    let n = 0;
    for (const r of protegidas) {
      const ruta = concretar(r.ruta, idsB);
      if (!ruta) continue;
      const res = await { GET: () => anonimo.get(ruta), DELETE: () => anonimo.del(ruta),
        POST: () => anonimo.post(ruta, cuerpoPara(ruta)), PUT: () => anonimo.put(ruta, cuerpoPara(ruta)) }[r.metodo]();
      if (vigilarLimite(rep, res, `${r.metodo} ${r.ruta}`)) continue;
      n++;
      rep.comprobar(res.status === 401,
        `${r.metodo} ${r.ruta} sin sesión responde 401`, `respondió ${res.status}`);
    }
    rep.hito(`${n} rutas protegidas rechazan al visitante anónimo`);
  });
}

async function main() {
  const restaurar = silenciarHttp();
  const rep = new Reporte('Aislamiento entre talleres');
  try {
    const { protegidas } = await faseAtaque(rep);
    await faseVolumen(rep);
    await faseAnonima(rep, protegidas);
  } finally { restaurar(); }
  return rep.resumen();
}

if (require.main === module) {
  main().then(ok => process.exit(ok ? 0 : 1))
    .catch(e => { console.error('\n💥 El robot de aislamiento reventó:\n', e); process.exit(1); });
}
module.exports = { main };
