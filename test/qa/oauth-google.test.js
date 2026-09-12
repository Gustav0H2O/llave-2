'use strict';
process.env.NODE_ENV = 'test';
/* ============================================================================
   Google OAuth de punta a punta (alta, login mixto y verificación del correo).

   Por qué existe esta prueba
   Con el alta en manos de Google, el callback pasa a ser LA puerta del sitio:
   si ahí se cuela algo, se cuela todo. Aquí se ejercita el camino completo
   —state firmado, intercambio de código, lectura del perfil, decisión de alta
   o reclamo, y emisión de sesión— con un DOBLE LOCAL de los dos extremos de
   Google (GOOGLE_TOKEN_URL / GOOGLE_USERINFO_URL): sin red y sin cuenta real.

   Lo que se vigila:
     1. Un correo que Google NO da por verificado se rechaza. Es la comprobación
        en la que se apoya todo lo demás (damos el correo por bueno y dejamos
        reclamar una cuenta existente por coincidencia de correo).
     2. Un alta nueva nace con email_verified=1, pass_hash 'google_oauth' y
        onboarding pendiente (los datos del taller los pide el modal).
     3. Una cuenta con CONTRASEÑA del mismo correo puede entrar con Google y
        CONSERVA su contraseña (login mixto: los dos caminos siguen vivos).
     4. Cuenta suspendida y bloqueada no se cuelan por el carril de Google.
     5. El state es obligatorio: sin él, no hay sesión.
   ========================================================================= */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { levantarServidor } = require('../helpers');
const { hashPassword } = require('../../src/services/auth');

describe('Google OAuth — alta, login mixto y correo verificado', () => {
  let ctx, stub, perfilGoogle;

  /* Cookie con nombre del tarro de una respuesta (Set-Cookie). */
  const cookieDe = (res, nombre) => {
    const re = new RegExp('^' + nombre + '=([^;]*)');
    for (const c of res.headers.getSetCookie()) {
      const m = c.match(re);
      if (m) return decodeURIComponent(m[1]);
    }
    return null;
  };

  before(async () => {
    perfilGoogle = {};
    stub = http.createServer((req, res) => {
      if (req.url.startsWith('/token')) {
        req.resume();
        req.on('end', () => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ access_token: 'token-de-prueba', token_type: 'bearer' }));
        });
        return;
      }
      if (req.url.startsWith('/userinfo')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(perfilGoogle));
        return;
      }
      res.writeHead(404); res.end();
    });
    await new Promise(r => stub.listen(0, '127.0.0.1', r));
    const puerto = stub.address().port;

    /* Se fijan ANTES de montar la app: el router de auth lee estos valores al
       montarse (igual que antes dentro de createApp). */
    process.env.GOOGLE_CLIENT_ID = 'cid-de-prueba';
    process.env.GOOGLE_CLIENT_SECRET = 'secreto-google-de-prueba';
    process.env.GOOGLE_TOKEN_URL = `http://127.0.0.1:${puerto}/token`;
    process.env.GOOGLE_USERINFO_URL = `http://127.0.0.1:${puerto}/userinfo`;

    ctx = await levantarServidor();
  });

  after(() => { ctx.cerrar(); stub.close(); });

  const taller = (email) => ctx.db.prepare('SELECT * FROM workshops WHERE email = ?').get(email);

  /* Arranca el flujo como lo haría el navegador: sigue el 302 a Google, se
     queda con el `state` firmado y con las cookies que lo atan a este cliente. */
  const empezar = async (modo) => {
    const r = await fetch(`${ctx.base}/api/auth/google?mode=${modo}`, { redirect: 'manual' });
    assert.equal(r.status, 302, 'el inicio del flujo debe redirigir a Google');
    const state = new URL(r.headers.get('location')).searchParams.get('state');
    const cookie = `google_oauth_state=${cookieDe(r, 'google_oauth_state')}; google_oauth_mode=${cookieDe(r, 'google_oauth_mode')}`;
    return { state, cookie };
  };

  /* Vuelve del callback con el estado y las cookies del arranque. */
  const volver = async ({ state, cookie }, code = 'codigo-de-prueba') => {
    const r = await fetch(`${ctx.base}/api/auth/google/callback?code=${code}&state=${encodeURIComponent(state)}`, {
      redirect: 'manual',
      headers: { cookie },
    });
    return { status: r.status, destino: r.headers.get('location') || '', sesion: cookieDe(r, 'ftm_session') };
  };

  const flujo = async (modo, code) => volver(await empezar(modo), code);

  it('rechaza el correo que Google NO da por verificado y no crea nada', async () => {
    perfilGoogle = { email: 'sin-verificar@prueba.test', verified_email: false, name: 'Falso' };
    const r = await flujo('register');
    assert.match(r.destino, /login=google_email_unverified/, 'un correo sin verificar no puede entrar');
    assert.equal(r.sesion, null, 'no debe emitirse sesión');
    assert.equal(taller('sin-verificar@prueba.test'), undefined, 'no puede haberse creado la cuenta');
  });

  it('un correo que sí está verificado se acepta (campo email_verified del perfil OIDC)', async () => {
    perfilGoogle = { email: 'oidc@prueba.test', email_verified: true, name: 'Cuenta OIDC' };
    const r = await flujo('register');
    assert.match(r.destino, /login=google_registered/);
    const ws = taller('oidc@prueba.test');
    assert.ok(ws, 'la cuenta debe existir');
    assert.equal(Number(ws.email_verified), 1);
  });

  it('el alta nace verificada, sin contraseña y con el onboarding pendiente', async () => {
    perfilGoogle = { email: 'nueva@prueba.test', verified_email: true, name: 'Taller Nuevo', picture: 'https://lh3.example/x.png' };
    const r = await flujo('register');
    assert.match(r.destino, /login=google_registered/, `destino inesperado: ${r.destino}`);
    assert.ok(r.sesion, 'el alta tiene que dejar sesión abierta');

    const ws = taller('nueva@prueba.test');
    assert.equal(ws.pass_hash, 'google_oauth', 'una cuenta de Google no tiene contraseña');
    assert.equal(Number(ws.email_verified), 1, 'Google ya verificó el correo');
    assert.equal(ws.status, 'active');
    assert.equal(Number(ws.onboarding_completed), 0, 'los datos del taller los pide el modal antifraude');
    assert.equal(ws.name, 'Taller Nuevo');
  });

  it('una cuenta con CONTRASEÑA del mismo correo entra con Google y conserva su contraseña', async () => {
    const email = 'con-clave@prueba.test';
    const hash = await hashPassword('clave-larga-123');
    ctx.db.prepare('INSERT INTO workshops (email, pass_hash, name, status, onboarding_completed) VALUES (?, ?, ?, ?, 1)')
      .run(email, hash, 'Taller con Clave', 'active');

    perfilGoogle = { email, verified_email: true, name: 'Taller con Clave' };
    const r = await flujo('login');
    assert.match(r.destino, /login=google_ok/, `debe entrar, no rebotar: ${r.destino}`);
    assert.ok(r.sesion, 'la sesión de Google tiene que emitirse');

    const ws = taller(email);
    assert.equal(ws.pass_hash, hash, 'la contraseña se conserva: el login mixto sigue vivo');
    assert.equal(Number(ws.email_verified), 1, 'Google probó el correo: queda verificado');
  });

  it('una cuenta suspendida no se cuela por Google', async () => {
    ctx.db.prepare('INSERT INTO workshops (email, pass_hash, name, status) VALUES (?, ?, ?, ?)')
      .run('suspendida@prueba.test', 'google_oauth', 'Taller Suspendido', 'suspended');
    perfilGoogle = { email: 'suspendida@prueba.test', verified_email: true };
    const r = await flujo('login');
    assert.match(r.destino, /login=google_suspended/);
    assert.equal(r.sesion, null);
  });

  it('son dos puertas: «entrar» con un correo sin cuenta manda a crearla, no la crea sola', async () => {
    perfilGoogle = { email: 'sin-cuenta@prueba.test', verified_email: true };
    const r = await flujo('login');
    assert.match(r.destino, /login=google_not_registered/, `debe mandar al alta: ${r.destino}`);
    assert.equal(r.sesion, null, 'no debe emitirse sesión');
    assert.equal(taller('sin-cuenta@prueba.test'), undefined, 'el botón de entrar no puede dar de alta');
  });

  it('y «crear cuenta» con un correo que ya existe manda a entrar (no la duplica ni la pisa)', async () => {
    ctx.db.prepare('INSERT INTO workshops (email, pass_hash, name, status) VALUES (?, ?, ?, ?)')
      .run('ya-existe@prueba.test', 'google_oauth', 'Ya Existe', 'active');
    perfilGoogle = { email: 'ya-existe@prueba.test', verified_email: true };
    const r = await flujo('register');
    assert.match(r.destino, /login=google_already_registered/, `debe mandar al acceso: ${r.destino}`);
    assert.equal(r.sesion, null, 'no debe emitirse sesión: le toca entrar por su puerta');
  });

  it('sin state válido no hay sesión (CSRF del callback)', async () => {
    perfilGoogle = { email: 'nueva@prueba.test', verified_email: true };
    const { cookie } = await empezar('login');
    const r = await volver({ state: 'falsificado_1_ff', cookie });
    assert.match(r.destino, /login=google_error/);
    assert.equal(r.sesion, null, 'un state que no cuadra no puede emitir sesión');
  });
});
