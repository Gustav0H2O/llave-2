'use strict';
process.env.NODE_ENV = 'test';
/* ============================================================================
   Pruebas del Store de express-rate-limit respaldado por la base
   (src/services/rate-limit-store.js — deuda de escalado).

   Se prueba la LÓGICA del Store sobre una base SQLite en memoria con el
   adaptador en modo 'local' (nunca la base real, AGENTS.md §5). La tabla no se
   crea a mano: la aplica `migrarPrincipal`, que es como nace en producción, así
   que estas pruebas también cubren la migración 003.
   ========================================================================= */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { DBAdapter } = require('../../db');
const { migrarPrincipal } = require('../../src/db/migrations');
const { StoreBD } = require('../../src/services/rate-limit-store');

describe('StoreBD — Store de rate limit sobre la base', () => {
  let sqlite, db;

  before(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    db = new DBAdapter(sqlite, 'local');
    await migrarPrincipal(db);
  });

  after(() => sqlite.close());

  /* Cada prueba empieza con la tabla de conteos vacía. */
  beforeEach(() => sqlite.exec('DELETE FROM rate_limits'));

  it('la migración 003 crea rate_limits y login_attempts', async () => {
    const tablas = (await db.all("SELECT name FROM sqlite_master WHERE type = 'table'"))
      .map((t) => t.name);
    assert.ok(tablas.includes('rate_limits'), 'falta la tabla de los rate limits');
    assert.ok(tablas.includes('login_attempts'), 'falta la tabla del lockout');
  });

  it('declara localKeys = false: las claves las ven otras instancias', () => {
    // Con localKeys = true, express-rate-limit asumiría un almacén por proceso
    // (el MemoryStore) y avisaría de doble conteo al escalar. La base es lo
    // contrario: el conteo es compartido.
    assert.equal(new StoreBD(db, 'x').localKeys, false);
  });

  it('init fija la ventana y el incremento arranca en 1 y sube', async () => {
    const store = new StoreBD(db, 'catalogo');
    await store.init({ windowMs: 60_000 });
    assert.equal(store.windowMs, 60_000);

    const uno = await store.increment('1.2.3.4');
    assert.equal(uno.totalHits, 1);
    assert.ok(uno.resetTime instanceof Date);
    assert.ok(uno.resetTime.getTime() > Date.now(), 'la ventana debe vencer en el futuro');

    const dos = await store.increment('1.2.3.4');
    assert.equal(dos.totalHits, 2);
    assert.equal(dos.resetTime.getTime(), uno.resetTime.getTime(), 'la ventana no se corre con cada golpe');
  });

  it('el incremento es atómico: 20 golpes simultáneos dan 20', async () => {
    const store = new StoreBD(db, 'concurrente');
    await store.init({ windowMs: 60_000 });
    const resultados = await Promise.all(
      Array.from({ length: 20 }, () => store.increment('9.9.9.9'))
    );
    assert.equal(Math.max(...resultados.map((r) => r.totalHits)), 20, 'el UPSERT pierde golpes');
    const fila = await db.get('SELECT hits FROM rate_limits WHERE clave = ?', ['concurrente|9.9.9.9']);
    assert.equal(Number(fila.hits), 20);
  });

  it('pasada la ventana, el contador vuelve a 1', async () => {
    const store = new StoreBD(db, 'ventana');
    await store.init({ windowMs: 60_000 });
    await store.increment('k');
    // Se fuerza el vencimiento sin esperar: la fila queda caducada.
    await db.run('UPDATE rate_limits SET expira_ms = ? WHERE clave = ?', [Date.now() - 1, 'ventana|k']);
    const deNuevo = await store.increment('k');
    assert.equal(deNuevo.totalHits, 1, 'una ventana vencida reinicia el conteo');
  });

  it('resetKey borra solo esa clave; decrement no baja de cero', async () => {
    const store = new StoreBD(db, 'reset');
    await store.init({ windowMs: 60_000 });
    await store.increment('a');
    await store.increment('b');
    await store.resetKey('a');
    assert.ok(!(await db.get('SELECT hits FROM rate_limits WHERE clave = ?', ['reset|a'])), 'resetKey borra la fila de esa clave');
    assert.ok(await db.get('SELECT hits FROM rate_limits WHERE clave = ?', ['reset|b']));

    await store.decrement('b');
    await store.decrement('b');
    const fila = await db.get('SELECT hits FROM rate_limits WHERE clave = ?', ['reset|b']);
    assert.equal(Number(fila.hits), 0, 'decrement no puede dejar un conteo negativo');
  });

  it('dos stores del MISMO limitador comparten el conteo (una fila por clave)', async () => {
    // Esto es exactamente lo que hace el escalado: la instancia A suma y la B lo ve.
    const a = new StoreBD(db, 'compartido');
    const b = new StoreBD(db, 'compartido');
    await a.init({ windowMs: 60_000 });
    await b.init({ windowMs: 60_000 });
    await a.increment('ip');
    await a.increment('ip');
    const visto = await b.increment('ip');
    assert.equal(visto.totalHits, 3, 'el conteo debe vivirse en la base, no en el proceso');
  });

  it('stores de limitadores distintos NO se pisan aunque la IP sea la misma', async () => {
    const catalogo = new StoreBD(db, 'catalogo');
    const login = new StoreBD(db, 'login');
    await catalogo.init({ windowMs: 60_000 });
    await login.init({ windowMs: 60_000 });
    await catalogo.increment('ip');
    await catalogo.increment('ip');
    const login1 = await login.increment('ip');
    assert.equal(login1.totalHits, 1, 'el cupo del catálogo no puede contar en el login');
  });

  it('resetAll vacía el espacio de nombres propio y respeta los demás', async () => {
    const uno = new StoreBD(db, 'uno');
    const dos = new StoreBD(db, 'dos');
    await uno.init({ windowMs: 60_000 });
    await dos.init({ windowMs: 60_000 });
    await uno.increment('ip');
    await dos.increment('ip');
    await uno.resetAll();
    assert.ok(!(await db.get('SELECT hits FROM rate_limits WHERE clave = ?', ['uno|ip'])), 'resetAll borra el espacio de nombres propio');
    assert.ok(await db.get('SELECT hits FROM rate_limits WHERE clave = ?', ['dos|ip']), 'resetAll no debe borrar otros limitadores');
  });

  it('exige la base inyectada (nunca el singleton de producción)', () => {
    assert.throws(() => new StoreBD(undefined, 'x'), /db inyectado/);
  });
});
