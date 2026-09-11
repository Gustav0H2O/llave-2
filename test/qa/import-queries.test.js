'use strict';
/* ============================================================================
   4.5 — El import de vehículos no hace una consulta por fila.

   Antes, cada fila resolvía su marca (SELECT) y su injection_type (SELECT): con
   el lote de 2 000 filas del panel eran hasta ~8 000 consultas. Ahora marcas e
   injection_types se precargan UNA vez (2 SELECT) y el bucle solo hace sus tres
   inserciones. Esta prueba lo comprueba contando las llamadas al adaptador con
   un envoltorio: no basta con que el resultado sea el mismo, hay que ver que la
   precarga ocurre de verdad (si alguien vuelve a meter un SELECT por fila, el
   contador lo delata).

   OJO: ADMIN_PASSWORD se lee al cargar server-pg.js, así que se define ANTES de
   requerir nada. node:test corre cada archivo en su propio proceso.
   ========================================================================= */
process.env.ADMIN_PASSWORD = 'clave-import-test';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createApp } = require('../../server-pg');
const { DBAdapter } = require('../../db');
const { seedTestDb } = require('../seed-test');
const { STATS_SCHEMA } = require('../helpers');

/* Envuelve un adaptador contando las llamadas de datos que le llegan desde las
   rutas. withTransaction se delega al adaptador real: sus BEGIN/COMMIT internos
   no se cuentan (lo que importa es cuántas consultas dispara el bucle). */
function contarConsultas(adapter) {
  const cuenta = { get: 0, all: 0, run: 0, exec: 0, insertReturningId: 0 };
  const espia = Object.create(adapter);
  for (const metodo of Object.keys(cuenta)) {
    espia[metodo] = (...args) => { cuenta[metodo]++; return adapter[metodo](...args); };
  }
  espia.withTransaction = (fn) => adapter.withTransaction(fn);
  return { espia, cuenta };
}

describe('4.5 — Import de vehículos: precarga en lote, sin N+1', () => {
  let ctx, pedir, cuenta;
  const FILAS = 50;

  before(async () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    seedTestDb(db);
    const envuelto = contarConsultas(new DBAdapter(db, 'local'));
    cuenta = envuelto.cuenta;

    const statsDb = new Database(':memory:');
    statsDb.pragma('foreign_keys = ON');
    statsDb.exec(STATS_SCHEMA);

    const app = await createApp(envuelto.espia, new DBAdapter(statsDb, 'local'));
    const server = await new Promise((resolve, reject) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
      s.on('error', reject);
    });
    ctx = {
      base: `http://127.0.0.1:${server.address().port}`,
      cerrar() {
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        server.close();
        db.close();
        statsDb.close();
      },
    };

    const login = await fetch(`${ctx.base}/api/admin/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'clave-import-test' }),
    });
    const { token } = await login.json();
    pedir = (ruta, body) => fetch(ctx.base + ruta, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  });
  after(() => ctx.cerrar());

  it('50 filas: 2 SELECT de precarga y 3 inserciones por fila, nunca un SELECT por fila', async () => {
    const rows = Array.from({ length: FILAS }, (_, i) => ({
      marca: 'Nissan', modelo: `Importado ${i}`, y1: 2000 + (i % 10), y2: 2010 + (i % 10),
      motor: '1.8L L4', inj: 'MFI', psiMin: 47, psiMax: 51, zona: 'rear_seat', carroceria: 'sedan',
    }));
    for (const k of Object.keys(cuenta)) cuenta[k] = 0; // se cuenta solo el import

    const r = await pedir('/api/admin/vehicles/import', { rows });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, FILAS, `esperaba ${FILAS} altas, hubo ${body.ok}: ${JSON.stringify(body.errors)}`);
    assert.equal(body.skipped, 0);

    // Precarga en lote: exactamente dos SELECT (marcas + injection_types)…
    assert.equal(cuenta.all, 2, `se hicieron ${cuenta.all} SELECT: la marca y la inyección deben precargarse en lote`);
    // …y ni un SELECT puntual por fila para resolver marca/inyección.
    assert.equal(cuenta.get, 0, `se hicieron ${cuenta.get} SELECT puntuales: el bucle no debe consultar por fila`);
    // Inserciones reales: vehículo + módulo (insertReturningId) y vehicle_modules (run).
    assert.equal(cuenta.insertReturningId, FILAS * 2);
    assert.equal(cuenta.run, FILAS);
    // El total queda muy por debajo de las ~5–6 consultas/fila de la versión anterior.
    assert.ok(cuenta.all + cuenta.get + cuenta.run + cuenta.insertReturningId < FILAS * 4,
      'el import sigue haciendo demasiadas consultas por fila');
  });
});
