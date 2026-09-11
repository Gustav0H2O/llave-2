'use strict';
process.env.NODE_ENV = 'test';
/* ============================================================================
   QA — Estado de escalado: rate limits y lockout compartidos por la base.

   La deuda que se cierra aquí: el contador de cada express-rate-limit y el
   `failedLoginAttempts` del login vivían en la memoria del proceso, así que dos
   instancias (o un reinicio) no compartían el conteo. Estas pruebas montan DOS
   apps sobre la MISMA base en memoria —el equivalente a dos procesos detrás de
   un balanceador, o a un servidor que se reinicia— y comprueban que:

     (a) el cupo de un limitador lo ven las dos apps (StoreBD), y
     (b) el lockout de login se cuenta entre las dos (login_attempts).

   La base es SIEMPRE ':memory:' con el adaptador en modo 'local' (AGENTS.md §5):
   nunca se toca fueltech.db, stats.db ni Turso.
   ========================================================================= */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createApp } = require('../../server-pg');
const { DBAdapter } = require('../../db');
const { seedTestDb } = require('../seed-test');
const { STATS_SCHEMA } = require('../helpers');

/* Dos apps (dos servidores) sobre el MISMO adaptador de base: es el escenario
   que antes rompía, porque cada proceso llevaba su propio estado. */
async function levantarDos() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  seedTestDb(db);

  const statsDb = new Database(':memory:');
  statsDb.pragma('foreign_keys = ON');
  statsDb.exec(STATS_SCHEMA);

  const adaptador = new DBAdapter(db, 'local');
  const adaptadorStats = new DBAdapter(statsDb, 'local');

  const apps = [];
  for (let i = 0; i < 2; i++) {
    const app = await createApp(adaptador, adaptadorStats);
    const server = await new Promise((resolve, reject) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
      s.on('error', reject);
    });
    apps.push({ server, base: `http://127.0.0.1:${server.address().port}` });
  }

  return {
    apps, db,
    cerrar() {
      for (const a of apps) {
        if (typeof a.server.closeAllConnections === 'function') a.server.closeAllConnections();
        a.server.close();
      }
      db.close();
      statsDb.close();
    },
  };
}

const estadoDe = async (url) => {
  const res = await fetch(url);
  await res.text();
  return res.status;
};

const login = (base, email, password) => fetch(`${base}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

describe('Escalado — el rate limit vive en la base y lo comparten las instancias', () => {
  let ctx;
  before(async () => { ctx = await levantarDos(); });
  after(() => ctx.cerrar());

  it('20 golpes por una app + 10 por otra agotan el MISMO cupo', async () => {
    const [a, b] = ctx.apps;
    /* `catalogLimiter` limita /api/meta a 30/min. Si el conteo fuera por
       proceso, 30 golpes entre las dos apps (20+10) no agotarían nada. */
    for (let i = 0; i < 20; i++) {
      assert.equal(await estadoDe(`${a.base}/api/meta`), 200, `app A, golpe ${i + 1}`);
    }
    for (let i = 0; i < 10; i++) {
      assert.equal(await estadoDe(`${b.base}/api/meta`), 200, `app B, golpe ${i + 1}`);
    }
    /* El golpe 31 lo corta la app B aunque ella solo hizo 11: eso prueba que el
       contador no estaba en la memoria de A. */
    assert.equal(await estadoDe(`${b.base}/api/meta`), 429, 'la app B debe ver el conteo de la app A');
    assert.equal(await estadoDe(`${a.base}/api/meta`), 429, 'la app A ya agotó el cupo compartido');
  });
});

describe('Escalado — el lockout de login persiste en la base entre instancias', () => {
  let ctx;
  before(async () => { ctx = await levantarDos(); });
  after(() => ctx.cerrar());

  it('la cuenta se bloquea con los intentos fallidos de las DOS apps', async () => {
    const [a, b] = ctx.apps;
    const email = 'bloqueo-escalado@prueba.test';

    const reg = await fetch(`${a.base}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'clave-larga-123', name: 'Taller Escalado' }),
    });
    await reg.text();
    assert.equal(reg.status, 201);

    /* Cuatro fallos por la app A: dentro del mismo umbral de siempre (5). */
    for (let i = 0; i < 4; i++) {
      const r = await login(a.base, email, 'clave-incorrecta');
      await r.text();
      assert.equal(r.status, 401, `intento ${i + 1} de A debe ser 401`);
    }

    /* El QUINTO intento lo hace la app B. Si el contador fuera del proceso, B
       vería su primer intento y respondería 401; compartido en la base, es el
       quinto y bloquea. */
    const quinto = await login(b.base, email, 'clave-incorrecta');
    assert.equal(quinto.status, 423, 'la app B debe contar los fallos registrados por la A');
    assert.equal((await quinto.json()).code, 'account_locked');

    /* Ya bloqueada, la app A responde 423 sin volver a comprobar la contraseña. */
    const bloqueada = await login(a.base, email, 'clave-larga-123');
    await bloqueada.text();
    assert.equal(bloqueada.status, 423, 'el bloqueo debe valer para las dos instancias');
  });
});
