'use strict';
process.env.NODE_ENV = 'test';
/* ============================================================================
   Alta del taller en PRODUCCIÓN: solo Google.

   `src/routes/auth.js` cierra POST /api/auth/register cuando NODE_ENV es
   production (403 `register_google_only`); en desarrollo y pruebas se deja
   abierta para poder trabajar sin credenciales de Google. Ese 403 es lo que
   convierte "el alta es con Google" en una restricción de verdad y no en un
   botón escondido, así que tiene que estar cubierto.

   POR QUÉ UN PROCESO HIJO
   `PROD` se fija al cargar src/config (una sola vez por proceso, es su razón de
   ser), así que no se puede cambiar dentro de este proceso sin mentirle a toda
   la suite. Se lanza un node aparte con el entorno del host, igual que hace
   test/unit/config.test.js con VISIT_SALT.

   POR QUÉ ESE ENTORNO TAN RARO
   Arrancar de verdad en producción dispara los guardarraíles que el proyecto
   tiene a propósito para no perder datos. Aquí se satisfacen SIN tocar nada:
     · TURSO_URL / TURSO_AUTH_TOKEN vacías → db.js no abre Turso (dotenv no pisa
       una clave ya presente, así que el .env local tampoco las cuela).
     · DATABASE_URL con un host `.internal` → db.js entra por PostgreSQL, y por
       ser `.internal` no exige PG_CA_PATH (db.js:49). El pool de `pg` NO
       conecta hasta la primera consulta, y aquí no se consulta: la app se monta
       con adaptadores en MEMORIA inyectados. Resultado: no se abre ninguna base
       en disco ni se habla con ningún servidor.
   ========================================================================= */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const SERVER = require.resolve('../../server-pg');
const DB = require.resolve('../../db');

describe('alta de taller: en producción solo con Google', () => {
  it('POST /api/auth/register responde 403 y no crea ninguna cuenta', () => {
    /* El guion escupe el resultado con writeSync (síncrono): con process.exit()
       una tubería puede quedarse sin volcar el stdout. */
    const guion = `
      process.env.NODE_ENV = 'production';
      const fs = require('fs');
      const escribir = (o) => fs.writeSync(1, JSON.stringify(o));
      const Database = require('better-sqlite3');
      const { createApp } = require(${JSON.stringify(SERVER)});
      const { DBAdapter } = require(${JSON.stringify(DB)});
      (async () => {
        const db = new Database(':memory:');
        const stats = new Database(':memory:');
        const app = await createApp(new DBAdapter(db, 'local'), new DBAdapter(stats, 'local'));
        const srv = app.listen(0, '127.0.0.1', async () => {
          const base = 'http://127.0.0.1:' + srv.address().port;
          const r = await fetch(base + '/api/auth/register', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: 'nuevo@prueba.test', password: 'clave-larga-123', name: 'Taller Nuevo' }),
          });
          const b = await r.json().catch(() => ({}));
          const filas = db.prepare('SELECT COUNT(*) n FROM workshops').get().n;
          escribir({ status: r.status, code: b.code, filas });
          if (typeof srv.closeAllConnections === 'function') srv.closeAllConnections();
          srv.close(); db.close(); stats.close();
          process.exit(0);
        });
      })().catch(e => { escribir({ error: String(e && e.message) }); process.exit(1); });
    `;

    const entorno = {
      ...process.env,
      NODE_ENV: 'production',
      /* En producción son obligatorias (validarConfig y la sesión). */
      VISIT_SALT: 'sal-fija-de-prueba',
      ADMIN_PASSWORD: 'clave-admin-de-prueba',
      /* Blindaje: el hijo no puede tocar Turso ni SQLite en disco. */
      TURSO_URL: '', TURSO_AUTH_TOKEN: '',
      DATABASE_URL: 'postgres://prueba:prueba@localhost.internal:5432/prueba',
      ALLOW_LOCAL_SQLITE_PROD: '',
    };

    let salida = '', error = '';
    try {
      salida = execFileSync(process.execPath, ['-e', guion], { encoding: 'utf8', stdio: 'pipe', env: entorno });
    } catch (e) {
      error = String(e.stderr || '') || String(e.message || '');
    }
    /* dotenv imprime su banner en stdout, así que no se puede parsear la salida
       entera: se toma la última línea que sea un objeto. */
    const linea = salida.trim().split('\n').map(l => l.trim()).filter(l => l.startsWith('{')).pop();
    assert.ok(linea, `el proceso hijo no devolvió un resultado.\n${error}\n${salida}`);
    const r = JSON.parse(linea);
    assert.equal(r.error, undefined, `el proceso hijo falló: ${r.error}`);
    assert.equal(r.status, 403, 'el alta por contraseña no puede existir en producción');
    assert.equal(r.code, 'register_google_only', 'el cliente tiene que poder distinguirlo para ofrecer Google');
    assert.equal(r.filas, 0, 'un 403 no puede haber dejado la cuenta creada');
  });
});
