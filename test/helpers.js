'use strict';
process.env.NODE_ENV = 'test';
/* ============================================================================
   Utilidades compartidas por las suites de prueba.

   Regla dura: TODA suite monta la app con bases en MEMORIA usando el modo
   'local' del adaptador. Nunca se toca fueltech.db, stats.db ni la base de
   Turso — aunque .env tenga TURSO_URL configurada. Si escribes una prueba que
   no pase por aquí, explica en el archivo por qué es segura.
   ========================================================================= */
const Database = require('better-sqlite3');
const { createApp } = require('../server-pg');
const { DBAdapter } = require('../db');
const { seedTestDb } = require('./seed-test');

const STATS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS visit_days (
    day TEXT NOT NULL, visitor_hash TEXT NOT NULL, PRIMARY KEY (day, visitor_hash)
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS chat_limits (
    day TEXT NOT NULL, device_id TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (day, device_id)
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS missing_searches (
    day TEXT NOT NULL, q TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, q)
  ) WITHOUT ROWID;
`;

/* Levanta la app real (server-pg.js, el mismo archivo que corre en producción)
   sobre bases en memoria, en un puerto libre. Devuelve un contexto con cerrar(). */
async function levantarServidor({ semilla = seedTestDb } = {}) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  semilla(db);

  const statsDb = new Database(':memory:');
  statsDb.pragma('foreign_keys = ON');
  statsDb.exec(STATS_SCHEMA);

  const app = await createApp(new DBAdapter(db, 'local'), new DBAdapter(statsDb, 'local'));
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  return {
    server, db, statsDb,
    port: server.address().port,
    base: `http://127.0.0.1:${server.address().port}`,
    /* closeAllConnections es imprescindible: fetch (undici) deja sockets
       keep-alive abiertos y server.close() se queda esperándolos para siempre,
       así que el proceso de pruebas nunca termina. */
    cerrar() {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      server.close();
      db.close();
      statsDb.close();
    },
  };
}

/* Cliente HTTP con tarro de cookies propio: dos clientes = dos talleres
   distintos, que es lo que hace falta para probar el aislamiento entre cuentas. */
function crearCliente(base) {
  const jar = new Map();
  const cliente = {
    async req(ruta, opts = {}) {
      const headers = {
        accept: 'application/json',
        ...(opts.body ? { 'content-type': 'application/json' } : {}),
        ...(opts.headers || {}),
      };
      if (jar.has('ftm_session')) headers.cookie = `ftm_session=${jar.get('ftm_session')}`;
      const res = await fetch(base + ruta, { ...opts, headers, redirect: 'manual' });
      for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
        const m = c.match(/^ftm_session=([^;]*)/);
        if (m) jar.set('ftm_session', m[1]);
      }
      const ct = res.headers.get('content-type') || '';
      const body = ct.includes('json') ? await res.json() : await res.text();
      return { status: res.status, headers: res.headers, body };
    },
    get(p, o) { return cliente.req(p, o); },
    post(p, body, o = {}) { return cliente.req(p, { ...o, method: 'POST', body: JSON.stringify(body) }); },
    put(p, body, o = {}) { return cliente.req(p, { ...o, method: 'PUT', body: JSON.stringify(body) }); },
    del(p, o = {}) { return cliente.req(p, { ...o, method: 'DELETE' }); },
    /* Registra un taller nuevo y deja la sesión guardada en este cliente. */
    async registrar(sufijo) {
      const email = `taller${sufijo}@prueba.test`;
      const r = await cliente.post('/api/auth/register', { email, password: 'clave-larga-123', name: `Taller ${sufijo}` });
      return { ...r, email };
    },
  };
  return cliente;
}

/* Archivos que declaran rutas de la API: server-pg.js y los módulos de src/
   (el chat de IA se montó en src/services/chat.js, 4.4: si el escáner mirara
   solo server-pg.js, esa ruta dejaría de estar cubierta por las pruebas de
   contrato y de seguridad sin que nadie se enterara). */
function archivosConRutas() {
  const fs = require('fs');
  const path = require('path');
  const raiz = path.join(__dirname, '..');
  const out = ['server-pg.js'];
  const recorrer = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) { recorrer(p); continue; }
      if (f.name.endsWith('.js')) out.push(path.relative(raiz, p).replace(/\\/g, '/'));
    }
  };
  const src = path.join(raiz, 'src');
  if (fs.existsSync(src)) recorrer(src);
  return out;
}

/* Todas las rutas de la API declaradas en el servidor, leídas del propio
   código. Sirve para que ninguna ruta nueva quede sin prueba de contrato. */
function rutasDeclaradas() {
  const fs = require('fs');
  const path = require('path');
  const out = [];
  for (const archivo of archivosConRutas()) {
    const src = fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8');
    for (const m of src.matchAll(/app\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2([^)]*)/g)) {
      const middlewares = m[4];
      out.push({
        metodo: m[1].toUpperCase(),
        ruta: m[3],
        middlewares,
        protegida: /requireWorkshop/.test(middlewares),
        admin: /requireAdmin/.test(middlewares),
        limitada: /Limiter/.test(middlewares),
        archivo,
        linea: src.slice(0, m.index).split('\n').length,
      });
    }
  }
  return out;
}

module.exports = { levantarServidor, crearCliente, rutasDeclaradas, STATS_SCHEMA };
