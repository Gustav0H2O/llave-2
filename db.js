require('dotenv').config();
const { Pool } = require('pg');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function sanitizeEnv(val) {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '').trim();
}

const TURSO_URL = sanitizeEnv(process.env.TURSO_URL);
const TURSO_AUTH_TOKEN = sanitizeEnv(process.env.TURSO_AUTH_TOKEN);
const DATABASE_URL = sanitizeEnv(process.env.DATABASE_URL);

// Prioridad de backend: Turso (TURSO_URL) > PostgreSQL (DATABASE_URL) > SQLite local
const USE_TURSO = !!(TURSO_URL && TURSO_AUTH_TOKEN);
const USE_PG = !USE_TURSO && !!DATABASE_URL;

let pgPool = null;
let sqliteDb = null;
let sqliteStats = null;
let tursoClient = null;

if (USE_TURSO) {
  const { createClient } = require('@libsql/client');
  tursoClient = createClient({
    url: TURSO_URL,
    authToken: TURSO_AUTH_TOKEN
  });
  console.log('☁️  Conectado a Turso (libSQL)');
} else if (USE_PG) {
  const isInternal = DATABASE_URL.includes('.internal');
  const PG_CA_PATH = sanitizeEnv(process.env.PG_CA_PATH);
  const PG_POOL_MAX_RAW = parseInt(sanitizeEnv(process.env.PG_POOL_MAX) || '10', 10);
  // F-11: TLS verificado. .internal va sin ssl (red privada); fuera de ella se
  // exige rejectUnauthorized:true + CA. Falla cerrado en prod si no hay CA.
  function buildPgSsl() {
    if (isInternal) return false;
    if (PG_CA_PATH) {
      try {
        const ca = fs.readFileSync(PG_CA_PATH, 'utf8');
        return { rejectUnauthorized: true, ca };
      } catch (err) {
        console.error(`FATAL: No se pudo leer PG_CA_PATH=${PG_CA_PATH}: ${err && err.message}`);
        process.exit(1);
      }
    }
    if (process.env.NODE_ENV === 'production') {
      console.error('FATAL: En producción PostgreSQL requiere TLS verificado: define PG_CA_PATH con el certificado CA.');
      process.exit(1);
    }
    return { rejectUnauthorized: true };
  }
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: buildPgSsl(),
    max: Number.isFinite(PG_POOL_MAX_RAW) && PG_POOL_MAX_RAW > 0 ? PG_POOL_MAX_RAW : 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000
  });
  pgPool.on('error', (err) => {
    console.error('❌ Error inesperado en PostgreSQL:', err);
  });
  console.log('🔗 Conectado a PostgreSQL');
} else {
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_LOCAL_SQLITE_PROD) {
    console.error('FATAL: En producción se requiere TURSO_URL y TURSO_AUTH_TOKEN (o DATABASE_URL). No se permite SQLite local efímero para asegurar la persistencia de cuentas y datos.');
    process.exit(1);
  }
  sqliteDb = new Database(path.join(__dirname, 'llave.db'), { timeout: 10000 });
  try {
    sqliteDb.pragma('journal_mode = WAL');
  } catch (_) {}
  sqliteDb.pragma('busy_timeout = 10000');
  sqliteDb.pragma('foreign_keys = ON');

  sqliteStats = new Database(path.join(__dirname, 'stats.db'), { timeout: 10000 });
  try {
    sqliteStats.pragma('journal_mode = WAL');
  } catch (_) {}
  sqliteStats.pragma('busy_timeout = 10000');
  console.log('📦 Conectado a SQLite (Local)');
}

/* Traducción de parámetros al dialecto de PostgreSQL: los `?` posicionales y
   los `@nombre` con nombre se convierten en $1, $2, $3…

   Es una función PURA y se exporta aparte a propósito: parseQuery corta antes
   cuando el backend no es PG, así que sin esto la traducción no se puede probar
   sin levantar un PostgreSQL de verdad. Un error aquí no da síntoma en SQLite
   ni en Turso — solo en producción sobre PG, escribiendo valores en la columna
   equivocada. Cubierta por test/unit/db-adapter.test.js. */
function toPgQuery(sql, params) {
  if (!params) return { sql, arr: [] };

  if (Array.isArray(params) || typeof params !== 'object') {
    let i = 1;
    const arr = Array.isArray(params) ? params : [params];
    const pgSql = sql.replace(/\?/g, () => '$' + (i++));
    return { sql: pgSql, arr };
  }

  let i = 1;
  const arr = [];
  const pgSql = sql.replace(/@([a-zA-Z0-9_]+)/g, (_, key) => {
    arr.push(params[key]);
    return '$' + (i++);
  });

  return { sql: pgSql, arr };
}

function parseQuery(sql, params) {
  if (!USE_PG) return { sql, params };
  return toPgQuery(sql, params);
}

/* Parámetro escalar para SQLite. better-sqlite3 recibe `?` posicionales y
   espera un array o un objeto con claves @named — pero un string vacío es
   falsy y `params || {}` lo convertía en {} → "Too few parameter values".
   Los escalares (string/número) se envuelven SIEMPRE en [valor], vacíos
   incluidos; null/undefined significan "sin parámetros" y van como {}. */
function normalizeScalar(params) {
  if (params === null || params === undefined) return {};
  if (typeof params === 'object') return params; // objeto @named o ya array
  return [params];
}

/* Divide un script SQL multi-sentencia eliminando comentarios de bloque y de línea,
   permitiendo ejecutarlo sentencia por sentencia en motores HTTP como Turso/libSQL. */
function splitSqlStatements(sql) {
  if (!sql) return [];
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map(line => {
      const idx = line.indexOf('--');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join('\n');
  return stripped
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

class DBAdapter {
  // mode: 'auto' (usa USE_TURSO/USE_PG global) | 'local' | 'turso' | 'pg'
  // 'local' fuerza el backend SQLite de la instancia (lo usan los tests con
  // bases en memoria, aunque el .env tenga TURSO_URL seteado).
  constructor(sqliteInstance, mode = 'auto') {
    this.sqlite = sqliteInstance;
    this.mode = mode;
    this.tursoTx = null; // transacción perezosa activa (Turso)
  }
  get isTurso() { return this.mode === 'turso' || (this.mode === 'auto' && USE_TURSO); }
  get isPg() { return this.mode === 'pg' || (this.mode === 'auto' && !USE_TURSO && USE_PG); }

  // Ejecuta en Turso: si hay transacción activa, dentro de ella; si no, directo.
  // Params puede ser: array, objeto (@name) o valor suelto (string/número) → se
  // normaliza a array. OJO: Object.values() de un string devuelve cada carácter,
  // por eso los escalares se envuelven en [valor].
  async tursoExec(sql, params) {
    let args;
    if (Array.isArray(params)) args = params;
    else if (params !== null && params !== undefined && typeof params === 'object') args = Object.values(params);
    else if (params !== null && params !== undefined) args = [params];
    else args = [];
    if (this.tursoTx) return this.tursoTx.execute({ sql, args });
    return tursoClient.execute({ sql, args });
  }

  async get(sql, params) {
    if (this.isTurso) {
      const res = await this.tursoExec(sql, params);
      return res.rows[0] || null;
    }
    if (this.isPg) {
      const { sql: pgSql, arr } = parseQuery(sql, params);
      const res = await pgPool.query(pgSql, arr);
      return res.rows[0] || null;
    } else {
      return Array.isArray(params) ? this.sqlite.prepare(sql).get(...params) : this.sqlite.prepare(sql).get(normalizeScalar(params));
    }
  }

  async all(sql, params) {
    if (this.isTurso) {
      const res = await this.tursoExec(sql, params);
      return res.rows;
    }
    if (this.isPg) {
      const { sql: pgSql, arr } = parseQuery(sql, params);
      const res = await pgPool.query(pgSql, arr);
      return res.rows;
    } else {
      return Array.isArray(params) ? this.sqlite.prepare(sql).all(...params) : this.sqlite.prepare(sql).all(normalizeScalar(params));
    }
  }

  async run(sql, params) {
    if (this.isTurso) {
      const res = await this.tursoExec(sql, params);
      return { changes: res.rowsAffected, lastInsertRowid: res.lastInsertRowid ?? null };
    }
    if (this.isPg) {
      let pgSql = sql;
      let onConflict = '';
      if (pgSql.includes('INSERT OR IGNORE')) {
        pgSql = pgSql.replace('INSERT OR IGNORE', 'INSERT');
        onConflict = ' ON CONFLICT DO NOTHING';
      }
      pgSql = pgSql + onConflict;
      
      const { sql: finalSql, arr } = parseQuery(pgSql, params);
      const res = await pgPool.query(finalSql, arr);
      return { changes: res.rowCount, lastInsertRowid: null };
    } else {
      return Array.isArray(params) ? this.sqlite.prepare(sql).run(...params) : this.sqlite.prepare(sql).run(normalizeScalar(params));
    }
  }

  async exec(sql) {
    if (this.isTurso) {
      // El cliente HTTP de Turso no admite multi-statement: quitamos comentarios
      // de bloque y de línea, dividimos por ';' y ejecutamos uno a uno.
      // BEGIN/COMMIT/ROLLBACK se traducen a una transacción perezosa real con
      // client.transaction() para conservar atomicidad.
      const t = sql.trim().toUpperCase();
      if (t === 'BEGIN') {
        this.tursoTx = await tursoClient.transaction('write');
        return;
      }
      if (t === 'COMMIT') {
        if (this.tursoTx) { await this.tursoTx.commit(); this.tursoTx = null; }
        return;
      }
      if (t === 'ROLLBACK') {
        if (this.tursoTx) { await this.tursoTx.rollback(); this.tursoTx = null; }
        return;
      }
      const stmts = splitSqlStatements(sql);
      for (let i = 0; i < stmts.length; i++) {
        const stmt = stmts[i];
        try {
          if (this.tursoTx) {
            await this.tursoTx.execute(stmt);
          } else {
            await tursoClient.execute(stmt);
          }
        } catch (err) {
          const msg = (err && err.message) || '';
          if (/already exists|duplicate column name/i.test(msg)) {
            continue;
          }
          console.error(`❌ Error en Turso ejecutando sentencia [${i + 1}/${stmts.length}]: ${stmt.slice(0, 80)}...`, msg);
          throw err;
        }
      }
      return;
    }
    if (this.isPg) {
      await pgPool.query(sql);
    } else {
      this.sqlite.exec(sql);
    }
  }

  async insertReturningId(sql, params) {
    if (this.isTurso) {
      const res = await this.tursoExec(sql + ' RETURNING id', params);
      return res.rows[0]?.id ?? null;
    }
    if (this.isPg) {
      let pgSql = sql.replace(/INSERT OR IGNORE/g, 'INSERT') + ' RETURNING id';
      const { sql: finalSql, arr } = parseQuery(pgSql, params);
      const res = await pgPool.query(finalSql, arr);
      return res.rows[0]?.id || null;
    } else {
      const info = Array.isArray(params) ? this.sqlite.prepare(sql).run(...params) : this.sqlite.prepare(sql).run(params || {});
      return info.lastInsertRowid;
    }
  }

  /* AR-C1: transacción atómica. En PG usa cliente dedicado de pool.connect()
     con BEGIN/COMMIT/ROLLBACK + release() en finally (patrón migrate.js).
     En SQLite/Turso degrada a exec BEGIN/COMMIT/ROLLBACK. No rompe la API
     existente: fn recibe un objeto con get/all/run/exec/insertReturningId. */
  async withTransaction(fn) {
    if (this.isPg) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        const tx = {
          isPg: true,
          isTurso: false,
          get: async (sql, params) => {
            const { sql: pgSql, arr } = parseQuery(sql, params);
            const res = await client.query(pgSql, arr);
            return res.rows[0] || null;
          },
          all: async (sql, params) => {
            const { sql: pgSql, arr } = parseQuery(sql, params);
            const res = await client.query(pgSql, arr);
            return res.rows;
          },
          run: async (sql, params) => {
            let pgSql = sql;
            let onConflict = '';
            if (pgSql.includes('INSERT OR IGNORE')) {
              pgSql = pgSql.replace('INSERT OR IGNORE', 'INSERT');
              onConflict = ' ON CONFLICT DO NOTHING';
            }
            pgSql = pgSql + onConflict;
            const { sql: finalSql, arr } = parseQuery(pgSql, params);
            const res = await client.query(finalSql, arr);
            return { changes: res.rowCount, lastInsertRowid: null };
          },
          exec: async (sql) => {
            await client.query(sql);
          },
          insertReturningId: async (sql, params) => {
            const pgSql = sql.replace(/INSERT OR IGNORE/g, 'INSERT') + ' RETURNING id';
            const { sql: finalSql, arr } = parseQuery(pgSql, params);
            const res = await client.query(finalSql, arr);
            return res.rows[0]?.id || null;
          },
          prepare: (prepSql) => ({
            get: async (params) => tx.get(prepSql, params),
            all: async (params) => tx.all(prepSql, params),
            run: async (params) => tx.run(prepSql, params)
          })
        };
        tx.withTransaction = async (nestedFn) => nestedFn(tx);
        tx.enTransaccion = tx.withTransaction;
        const out = await fn(tx);
        await client.query('COMMIT');
        return out;
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw e;
      } finally {
        client.release();
      }
    }
    if (this.isTurso && this.tursoTx) return await fn(this);
    if (!this.isTurso && !this.isPg && this.sqlite && this.sqlite.inTransaction) return await fn(this);
    await this.exec('BEGIN');
    try {
      const out = await fn(this);
      await this.exec('COMMIT');
      return out;
    } catch (e) {
      try { await this.exec('ROLLBACK'); } catch (_) {}
      throw e;
    }
  }

  async enTransaccion(fn) {
    return await this.withTransaction(fn);
  }

  prepare(sql) {
    return {
      get: async (params) => this.get(sql, params),
      all: async (params) => this.all(sql, params),
      run: async (params) => this.run(sql, params)
    };
  }
}

const db = new DBAdapter(sqliteDb);
const statsDb = new DBAdapter(sqliteStats);

module.exports = { db, statsDb, pgPool, tursoClient, USE_TURSO, USE_PG, DBAdapter, parseQuery, toPgQuery, sanitizeEnv, splitSqlStatements };
