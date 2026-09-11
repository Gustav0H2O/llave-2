'use strict';
process.env.NODE_ENV = 'test';
/* ============================================================================
   Pruebas del chat de IA (4.4), incluyendo los arreglos 2.39 (contexto bajo
   demanda en vez del catálogo entero en el prompt) y 2.41 (tope de 30 s con
   AbortController).

   NUNCA se llama a un proveedor real: se levanta un proveedor falso en
   localhost y se apunta la configuración a él. La base tampoco es real: los
   dobles de `db`/`statsDb` son objetos con las mismas tres operaciones, así que
   ninguna prueba abre una base de datos (AGENTS.md §5).
   ========================================================================= */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');
const { montarChat, resumenCatalogo } = require('../../src/services/chat');

const CLAVE = 'clave-de-prueba';

/* ---------- Dobles ---------- */

/* Proveedor falso compatible con OpenAI: guarda lo que se le mandó para poder
   comprobar QUÉ prompt salió del servidor. */
async function proveedorFalso(responder) {
  const recibidas = [];
  const server = http.createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (c) => { cuerpo += c; });
    req.on('end', () => {
      let json = null;
      try { json = JSON.parse(cuerpo); } catch (e) { json = null; }
      recibidas.push({ url: req.url, autorizacion: req.headers.authorization || '', json });
      responder(req, res);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}/v1`,
    recibidas,
    cerrar() { if (server.closeAllConnections) server.closeAllConnections(); server.close(); },
  };
}

const respondeCon = (texto) => (req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content: texto } }] }));
};

/* Catálogo de mentira: contesta al resumen y a las coincidencias igual que lo
   haría SQL, sin abrir ninguna base. */
function dbCatalogo({ coincidencias = [], resumen = null } = {}) {
  return {
    get: async (sql) => (/COUNT\(\*\) AS n, MIN/.test(sql)
      ? (resumen === 'error' ? Promise.reject(new Error('base caída')) : (resumen || { n: 208, desde: 1990, hasta: 2026 }))
      : null),
    all: async (sql) => {
      if (/GROUP BY b\.name/.test(sql)) return [{ marca: 'Nissan', n: 40 }, { marca: 'Chevrolet', n: 32 }];
      if (/GROUP BY it\.name/.test(sql)) return [{ sistema: 'MFI', n: 120 }, { sistema: 'TBI', n: 40 }];
      if (/WHERE/.test(sql)) return coincidencias;
      return [];
    },
  };
}

function configDe(baseProveedor, extra = {}) {
  return {
    BASE_URL: 'https://prueba.test',
    PROD: false,
    CHAT_DAILY_LIMIT: 3,
    CHAT_IP_CEILING: 30,
    CHAT_GLOBAL_CEILING: 150,
    CHAT_TIMEOUT_MS: 5000,
    GEMINI_API_KEY: '',
    GEMINI_MODEL: 'gemini-1.5-flash',
    GROQ_API_KEY: CLAVE,
    GROQ_MODELS: ['modelo-de-prueba'],
    GROQ_BASE: baseProveedor || 'http://127.0.0.1:9/v1',
    NVIDIA_API_KEY: '', NVIDIA_MODELS: [], NVIDIA_BASE: 'https://nvidia.test/v1',
    OPENROUTER_API_KEY: '', OPENROUTER_MODELS: [], OPENROUTER_BASE: 'https://openrouter.test/api/v1',
    ...extra,
  };
}

/* Monta la ruta como la monta server-pg.js, sobre un Express pelado. */
async function levantar({ baseProveedor, cfg = {}, db = {}, statsDb } = {}) {
  const app = express();
  app.use(express.json());
  const stats = statsDb || { exec: async () => {}, get: async () => null, run: async () => ({}) };
  await montarChat(app, {
    db: { get: async () => null, all: async () => [], ...db },
    statsDb: stats,
    config: configDe(baseProveedor, cfg),
  });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    cerrar() { if (server.closeAllConnections) server.closeAllConnections(); server.close(); },
  };
}

const pedir = async (base, cuerpo) => {
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
  });
  return { status: res.status, body: await res.json() };
};

/* ---------- Pruebas ---------- */

describe('Chat de IA (4.4) — validación y errores', () => {
  it('sin ninguna clave de proveedor responde 503 con noKey', async () => {
    const app = await levantar({ cfg: { GROQ_API_KEY: '', GEMINI_API_KEY: '' } });
    try {
      const r = await pedir(app.base, { message: 'hola' });
      assert.equal(r.status, 503);
      assert.equal(r.body.noKey, true);
      assert.match(r.body.error, /no configurada/);
    } finally { app.cerrar(); }
  });

  it('valida el mensaje, el historial y el modo antes de gastar cuota', async () => {
    const app = await levantar({ db: dbCatalogo() });
    try {
      assert.equal((await pedir(app.base, { message: '   ' })).status, 400);
      assert.equal((await pedir(app.base, { message: 'hola', history: { no: 'es array' } })).status, 400);
      assert.equal((await pedir(app.base, { message: 'hola', modo: 'inventado' })).status, 400);
      const vacio = await pedir(app.base, { message: '' });
      assert.equal(vacio.body.error, 'Mensaje vacío');
    } finally { app.cerrar(); }
  });

  it('una respuesta del proveedor llega al cliente con el cupo descontado', async () => {
    const prov = await proveedorFalso(respondeCon('Revisa la presión de riel.'));
    const app = await levantar({ baseProveedor: prov.base, db: dbCatalogo() });
    try {
      const r = await pedir(app.base, { message: '¿qué presión lleva un motor?' });
      assert.equal(r.status, 200);
      assert.equal(r.body.response, 'Revisa la presión de riel.');
      assert.equal(r.body.remaining, 2, '3 de cupo menos la consulta recién hecha');
      assert.equal(prov.recibidas.length, 1);
      assert.equal(prov.recibidas[0].url, '/v1/chat/completions');
      assert.match(prov.recibidas[0].autorizacion, new RegExp(`^Bearer ${CLAVE}$`));
    } finally { app.cerrar(); prov.cerrar(); }
  });

  it('el cupo diario se respeta y no se llama al proveedor', async () => {
    const prov = await proveedorFalso(respondeCon('no debería llegar aquí'));
    const app = await levantar({
      baseProveedor: prov.base, db: dbCatalogo(),
      statsDb: { exec: async () => {}, run: async () => ({}), get: async () => ({ count: 3 }) },
    });
    try {
      const r = await pedir(app.base, { message: '¿otra vez?' });
      assert.equal(r.status, 200);
      assert.equal(r.body.limitReached, true);
      assert.equal(r.body.remaining, 0);
      assert.equal(prov.recibidas.length, 0, 'con el cupo agotado no se gasta una llamada');
    } finally { app.cerrar(); prov.cerrar(); }
  });

  it('el techo por red y el global cortan antes que el cupo por dispositivo', async () => {
    const porRed = await levantar({
      db: dbCatalogo(),
      statsDb: { exec: async () => {}, run: async () => ({}), get: async (sql, params) => (String(params?.[1] || '').startsWith('ipcap:') ? { count: 30 } : { count: 0 }) },
    });
    const global = await levantar({
      db: dbCatalogo(),
      statsDb: { exec: async () => {}, run: async () => ({}), get: async (sql, params) => (params?.[1] === 'global:todos' ? { count: 150 } : { count: 0 }) },
    });
    try {
      const a = await pedir(porRed.base, { message: 'hola' });
      assert.match(a.body.message, /límite diario de consultas desde esta red/);
      const b = await pedir(global.base, { message: 'hola' });
      assert.match(b.body.message, /cupo global del día/);
    } finally { porRed.cerrar(); global.cerrar(); }
  });
});

describe('2.39 — el prompt lleva contexto bajo demanda, no el catálogo entero', () => {
  it('manda el resumen compacto y NO la lista completa de vehículos', async () => {
    const prov = await proveedorFalso(respondeCon('ok'));
    const app = await levantar({ baseProveedor: prov.base, db: dbCatalogo() });
    try {
      const r = await pedir(app.base, { message: '¿qué presión de riel lleva un motor de inyección?' });
      assert.equal(r.status, 200);
      const prompt = prov.recibidas[0].json.messages[0].content;
      assert.match(prompt, /208 vehículos de 2 marcas/, 'falta el resumen del catálogo');
      assert.match(prompt, /Nissan 40/, 'falta el conteo por marca');
      assert.match(prompt, /MFI 120/, 'falta el conteo por sistema');
      // El volcado antiguo (dbDump) metía una línea "PSI:x-y" por vehículo.
      assert.equal(/PSI:\d/.test(prompt), false, 'el prompt sigue volcando vehículos del catálogo');
      assert.ok(prompt.length < 2500, `el prompt pesa ${prompt.length} caracteres: eso ya no es un resumen`);
    } finally { app.cerrar(); prov.cerrar(); }
  });

  it('si el usuario nombra un vehículo, se consultan solo las coincidencias', async () => {
    const prov = await proveedorFalso(respondeCon('ok'));
    const fila = { brand: 'Toyota', model: 'Yaris', year_from: 2006, year_to: 2014, engine: '1.5L L4', rail_pressure_psi_min: 38, rail_pressure_psi_max: 44 };
    const app = await levantar({ baseProveedor: prov.base, db: dbCatalogo({ coincidencias: [fila] }) });
    try {
      await pedir(app.base, { message: '¿qué presión lleva un Toyota Yaris 2010?' });
      const prompt = prov.recibidas[0].json.messages[0].content;
      assert.match(prompt, /Toyota Yaris 2006-2014/, 'la coincidencia puntual debería ir en el contexto');
      assert.match(prompt, /PSI:38-44/);
    } finally { app.cerrar(); prov.cerrar(); }
  });

  it('sin coincidencias el chat responde igual, solo con menos detalle', async () => {
    const prov = await proveedorFalso(respondeCon('ok'));
    const app = await levantar({ baseProveedor: prov.base, db: dbCatalogo({ coincidencias: [] }) });
    try {
      const r = await pedir(app.base, { message: 'zzzz' });
      assert.equal(r.status, 200);
      assert.equal(r.body.response, 'ok');
    } finally { app.cerrar(); prov.cerrar(); }
  });

  it('si el catálogo no responde, el resumen no se cachea y el chat sigue en pie', async () => {
    let llamadas = 0;
    const db = { get: async () => { llamadas++; throw new Error('base caída'); }, all: async () => [] };
    const cache = { valor: null };
    const primero = await resumenCatalogo(db, cache);
    assert.match(primero, /no está disponible/);
    assert.equal(cache.valor, null, 'un fallo de base no puede quedar cacheado');
    await resumenCatalogo(db, cache);
    assert.equal(llamadas, 2, 'el siguiente intento vuelve a preguntar');
  });
});

describe('2.41 — ninguna llamada a la IA puede dejar la petición colgada', () => {
  it('corta con 504 y un mensaje accionable cuando el proveedor no contesta', async () => {
    const prov = await proveedorFalso(() => { /* nunca responde */ });
    const app = await levantar({ baseProveedor: prov.base, db: dbCatalogo(), cfg: { CHAT_TIMEOUT_MS: 300 } });
    try {
      const t0 = Date.now();
      const r = await pedir(app.base, { message: '¿y si el proveedor se cuelga?' });
      assert.equal(r.status, 504, 'debe cortar, no esperar para siempre');
      assert.match(r.body.error, /tardó más de 0\.3 s/);
      assert.ok(Date.now() - t0 < 5000, 'el corte tiene que llegar en el tope configurado');
      assert.equal(prov.recibidas.length, 1, 'la petición sí salió: se abortó la respuesta');
    } finally { app.cerrar(); prov.cerrar(); }
  });

  it('un error del proveedor sigue siendo 502 (no se disfraza de corte por tiempo)', async () => {
    const prov = await proveedorFalso((req, res) => { res.writeHead(500, { 'content-type': 'application/json' }); res.end('{"error":"boom"}'); });
    const app = await levantar({ baseProveedor: prov.base, db: dbCatalogo() });
    try {
      const r = await pedir(app.base, { message: 'hola' });
      assert.equal(r.status, 502);
      assert.match(r.body.error, /Error al comunicar con la IA/);
    } finally { app.cerrar(); prov.cerrar(); }
  });

  it('un 429 del modelo pasa al siguiente de la cadena', async () => {
    const prov = await proveedorFalso((req, res) => {
      if (req.url === '/v1/chat/completions' && prov.recibidas.length === 1) {
        res.writeHead(429, { 'content-type': 'application/json' });
        return res.end('{"error":"rate limited"}');
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'respuesta del segundo modelo' } }] }));
    });
    const app = await levantar({ baseProveedor: prov.base, db: dbCatalogo(), cfg: { GROQ_MODELS: ['saturado', 'disponible'] } });
    try {
      const r = await pedir(app.base, { message: 'hola' });
      assert.equal(r.status, 200);
      assert.equal(r.body.response, 'respuesta del segundo modelo');
      assert.equal(prov.recibidas.length, 2);
      assert.equal(prov.recibidas[0].json.model, 'saturado');
      assert.equal(prov.recibidas[1].json.model, 'disponible');
    } finally { app.cerrar(); prov.cerrar(); }
  });
});
