'use strict';
/* ============================================================================
   Pruebas del adaptador de base de datos (db.js).

   El adaptador es el punto más peligroso del proyecto: la MISMA consulta corre
   sobre tres motores (SQLite local, Turso/libSQL y PostgreSQL) y solo uno de
   ellos se prueba al desarrollar. Aquí se cubre lo que se puede probar sin red:
   la traducción de parámetros a PG y el comportamiento completo sobre SQLite.
   ========================================================================= */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { DBAdapter, toPgQuery } = require('../../db');

describe('toPgQuery — traducción de parámetros a PostgreSQL', () => {
  it('convierte los ? posicionales en $1, $2, $3 en orden', () => {
    const { sql, arr } = toPgQuery('SELECT * FROM v WHERE a = ? AND b = ? AND c = ?', [1, 2, 3]);
    assert.equal(sql, 'SELECT * FROM v WHERE a = $1 AND b = $2 AND c = $3');
    assert.deepEqual(arr, [1, 2, 3]);
  });

  it('convierte los @nombre y ordena el array según su aparición en el SQL', () => {
    // El orden lo manda el SQL, NO el orden de las llaves del objeto: si esto
    // se invierte, los valores entran en la columna equivocada sin dar error.
    const { sql, arr } = toPgQuery(
      'UPDATE v SET modelo = @modelo, marca = @marca WHERE id = @id',
      { id: 7, marca: 'Nissan', modelo: 'Tsuru' }
    );
    assert.equal(sql, 'UPDATE v SET modelo = $1, marca = $2 WHERE id = $3');
    assert.deepEqual(arr, ['Tsuru', 'Nissan', 7]);
  });

  it('un parámetro repetido se numera dos veces (cada aparición es un placeholder)', () => {
    const { sql, arr } = toPgQuery('SELECT * FROM v WHERE a = @x OR b = @x', { x: 5 });
    assert.equal(sql, 'SELECT * FROM v WHERE a = $1 OR b = $2');
    assert.deepEqual(arr, [5, 5]);
  });

  it('envuelve un escalar suelto en un array', () => {
    const { sql, arr } = toPgQuery('SELECT * FROM v WHERE id = ?', 42);
    assert.equal(sql, 'SELECT * FROM v WHERE id = $1');
    assert.deepEqual(arr, [42]);
  });

  it('un string suelto NO se descompone en caracteres', () => {
    // Object.values('abc') devuelve ['a','b','c']: ese error convertiría una
    // consulta de un parámetro en una de tres.
    const { arr } = toPgQuery('SELECT * FROM v WHERE code = ?', 'ABC');
    assert.deepEqual(arr, ['ABC']);
  });

  it('sin parámetros devuelve el SQL intacto y un array vacío', () => {
    const { sql, arr } = toPgQuery('SELECT 1', null);
    assert.equal(sql, 'SELECT 1');
    assert.deepEqual(arr, []);
  });

  it('no toca correos ni textos con @ dentro de literales entre comillas', () => {
    // Limitación conocida y documentada: el reemplazo es textual. Por eso los
    // valores SIEMPRE van como parámetro, nunca interpolados en el SQL.
    const { sql } = toPgQuery('SELECT * FROM w WHERE email = ?', ['a@b.com']);
    assert.equal(sql, 'SELECT * FROM w WHERE email = $1', 'el @ del VALOR no debe tocarse: va como parámetro');
  });

  it('el número de placeholders coincide siempre con el largo del array', () => {
    const casos = [
      ['SELECT ?', [1]],
      ['SELECT ?, ?, ?', [1, 2, 3]],
      ['INSERT INTO t (a,b,c,d,e) VALUES (?,?,?,?,?)', [1, 2, 3, 4, 5]],
    ];
    for (const [q, p] of casos) {
      const { sql, arr } = toPgQuery(q, p);
      const n = (sql.match(/\$\d+/g) || []).length;
      assert.equal(n, arr.length, `"${q}" generó ${n} placeholders para ${arr.length} valores`);
    }
  });
});

describe('DBAdapter en modo local (SQLite)', () => {
  let sqlite, db;

  before(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec(`
      CREATE TABLE t (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, psi INTEGER);
      CREATE TABLE hijo (id INTEGER PRIMARY KEY, t_id INTEGER NOT NULL REFERENCES t(id));
    `);
    db = new DBAdapter(sqlite, 'local');
  });

  after(() => sqlite.close());

  it('el modo "local" ignora la configuración global de Turso/PG', () => {
    // Sin esto, las pruebas escribirían en la base de producción si .env tiene
    // TURSO_URL. Es la salvaguarda que hace seguro correr `npm test`.
    assert.equal(db.isTurso, false);
    assert.equal(db.isPg, false);
  });

  it('insertReturningId devuelve el id nuevo', async () => {
    const id = await db.insertReturningId('INSERT INTO t (nombre, psi) VALUES (?, ?)', ['Tsuru', 60]);
    assert.ok(Number(id) > 0);
  });

  it('get devuelve una fila y null cuando no hay nada (nunca undefined)', async () => {
    await db.run('INSERT INTO t (nombre, psi) VALUES (?, ?)', ['Sentra', 50]);
    const fila = await db.get('SELECT * FROM t WHERE nombre = ?', ['Sentra']);
    assert.equal(fila.psi, 50);
    const vacio = await db.get('SELECT * FROM t WHERE nombre = ?', ['NoExiste']);
    assert.ok(vacio === null || vacio === undefined, 'una fila ausente no puede venir como objeto');
  });

  it('all devuelve siempre un array', async () => {
    const filas = await db.all('SELECT * FROM t');
    assert.ok(Array.isArray(filas));
    const vacio = await db.all('SELECT * FROM t WHERE psi > ?', [99999]);
    assert.deepEqual(vacio, []);
  });

  it('run informa cuántas filas cambió', async () => {
    const r = await db.run('UPDATE t SET psi = ? WHERE nombre = ?', [61, 'Sentra']);
    assert.equal(r.changes, 1);
    const r0 = await db.run('UPDATE t SET psi = ? WHERE nombre = ?', [61, 'NoExiste']);
    assert.equal(r0.changes, 0);
  });

  it('acepta parámetros con nombre (@clave) además de posicionales', async () => {
    await db.run('INSERT INTO t (nombre, psi) VALUES (@nombre, @psi)', { nombre: 'March', psi: 44 });
    const fila = await db.get('SELECT psi FROM t WHERE nombre = @nombre', { nombre: 'March' });
    assert.equal(fila.psi, 44);
  });

  it('propaga los errores de SQL en vez de tragárselos', async () => {
    await assert.rejects(() => db.get('SELECT * FROM tabla_que_no_existe'), /no such table/i);
  });

  it('respeta las llaves foráneas (una FK rota debe fallar, no insertarse)', async () => {
    await assert.rejects(
      () => db.run('INSERT INTO hijo (t_id) VALUES (?)', [999999]),
      /FOREIGN KEY/i,
      'foreign_keys = ON debe estar activo o la base acumula huérfanos'
    );
  });

  it('todos los métodos devuelven promesas — olvidar un await es un bug de verdad', async () => {
    // El bug real: `await x.get(...)?.value` lee .value sobre la PROMESA y da
    // undefined siempre. El contador de visitas estuvo clavado en 0 por esto.
    const p = db.get('SELECT 1 AS uno');
    assert.ok(typeof p.then === 'function', 'get debe devolver una promesa');
    assert.equal(p.value, undefined, 'leer una propiedad de la promesa da undefined: por eso SIEMPRE hay que await');
    assert.equal((await p).uno, 1);

    for (const m of ['get', 'all', 'run', 'exec', 'insertReturningId']) {
      assert.equal(typeof db[m], 'function', `falta el método ${m}`);
    }
  });

  it('exec corre varias sentencias de una vez', async () => {
    await db.exec('CREATE TABLE tmp_a (x INTEGER); CREATE TABLE tmp_b (y INTEGER);');
    assert.ok(await db.get("SELECT name FROM sqlite_master WHERE name = 'tmp_a'"));
    assert.ok(await db.get("SELECT name FROM sqlite_master WHERE name = 'tmp_b'"));
  });

  it('prepare() devuelve un objeto con get/all/run asíncronos', async () => {
    const st = db.prepare('SELECT * FROM t WHERE nombre = ?');
    const fila = await st.get(['Tsuru']);
    assert.equal(fila.nombre, 'Tsuru');
    assert.ok(Array.isArray(await st.all(['Tsuru'])));
  });

  it('los parámetros nunca se interpolan: una comilla en el valor no rompe el SQL', async () => {
    const malicioso = "'; DROP TABLE t; --";
    await db.run('INSERT INTO t (nombre) VALUES (?)', [malicioso]);
    const fila = await db.get('SELECT nombre FROM t WHERE nombre = ?', [malicioso]);
    assert.equal(fila.nombre, malicioso, 'el valor debe guardarse literal');
    assert.ok(await db.get("SELECT name FROM sqlite_master WHERE name = 't'"), 'la tabla t debe seguir existiendo');
  });
});
