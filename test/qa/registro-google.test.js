'use strict';
process.env.NODE_ENV = 'test';
/* ============================================================================
   El alta Y el acceso del taller en PRODUCCIÓN: solo con Google.

   `src/routes/auth.js` cierra las dos puertas de contraseña cuando NODE_ENV es
   production: POST /api/auth/register (403 `register_google_only`) y
   POST /api/auth/login (403 `login_google_only`). En desarrollo y pruebas se
   dejan abiertas para poder trabajar sin credenciales de Google. Ese 403 es lo
   que convierte "solo Google" en una restricción de verdad y no en un botón
   escondido, así que tiene que estar cubierto.

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
       ser `.internal` no exige PG_CA_PATH. El pool de `pg` NO conecta hasta la
       primera consulta, y aquí no se consulta: la app se monta con adaptadores
       en MEMORIA inyectados. Resultado: no se abre ninguna base en disco ni se
       habla con ningún servidor.
   ========================================================================= */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const SERVER = require.resolve('../../server-pg');
const DB = require.resolve('../../db');

describe('taller en producción: alta y acceso solo con Google', () => {
  it('register y login responden 403 y no crean ninguna cuenta', () => {
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
          const post = async (ruta, cuerpo) => {
            const r = await fetch(base + ruta, {
              method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
            });
            const b = await r.json().catch(() => ({}));
            return { status: r.status, code: b.code };
          };
          const register = await post('/api/auth/register', { email: 'nuevo@prueba.test', password: 'clave-larga-123', name: 'Taller Nuevo' });
          const login = await post('/api/auth/login', { email: 'nuevo@prueba.test', password: 'clave-larga-123' });
          const filas = db.prepare('SELECT COUNT(*) n FROM workshops').get().n;
          escribir({ register, login, filas });
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
    assert.equal(r.register.status, 403, 'el alta por contraseña no puede existir en producción');
    assert.equal(r.register.code, 'register_google_only', 'el cliente tiene que poder distinguirlo');
    assert.equal(r.login.status, 403, 'el acceso por contraseña no puede existir en producción');
    assert.equal(r.login.code, 'login_google_only', 'el cliente tiene que poder distinguirlo');
    assert.equal(r.filas, 0, 'un 403 no puede haber dejado la cuenta creada');
  });
});
