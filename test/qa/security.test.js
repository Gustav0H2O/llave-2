'use strict';
/* ============================================================================
   QA de seguridad.

   La app dejó de ser un catálogo público: hoy guarda clientes, órdenes de
   trabajo, inventario, documentos y caja de talleres distintos en las MISMAS
   tablas. El único muro entre el taller A y el taller B es que cada consulta
   filtre por workshop_id. Esta suite existe para que ese muro no se caiga en
   silencio: prueba el aislamiento recurso por recurso, no "de ejemplo".

   Si agregas un recurso nuevo por taller, agrégalo a RECURSOS y a las pruebas
   de fuga. Si no lo haces, la prueba de cobertura de más abajo te va a fallar.
   ========================================================================= */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { levantarServidor, crearCliente, rutasDeclaradas } = require('../helpers');

/* Recursos con datos privados de cada taller. Cada uno declara cómo se crea uno
   y cómo se listan, para poder probar la fuga entre cuentas de forma uniforme.

   La fuga se comprueba de dos maneras a la vez:
     · por id  — el id que creó el taller A no puede aparecer en la lista de B;
     · por texto — una cadena marcada no puede aparecer en la respuesta de B
       (esto además caza fugas indirectas a través de JOINs).
   `marcaEnLista: false` es para los recursos cuya lista no incluye el texto
   (los documentos listan cabecera, no partidas). */
const RECURSOS = [
  { nombre: 'inventario', crear: ['/api/inventory', { sku: 'P-1', name: 'Pila secreta A' }], listar: '/api/inventory', marca: 'Pila secreta A' },
  { nombre: 'clientes', crear: ['/api/clients', { name: 'Cliente secreto A', phone: '5551234567' }], listar: '/api/clients', marca: 'Cliente secreto A' },
  { nombre: 'ordenes', crear: ['/api/orders', { title: 'Orden secreta A' }], listar: '/api/orders', marca: 'Orden secreta A' },
  { nombre: 'documentos', crear: ['/api/documents', { kind: 'presupuesto', items: [{ descr: 'Documento secreto A', qty: 1, unit_price: 10 }] }], listar: '/api/documents', marca: 'Documento secreto A', marcaEnLista: false },
  { nombre: 'notas', crear: ['/api/notes', { text: 'Nota secreta A' }], listar: '/api/notes', marca: 'Nota secreta A' },
  { nombre: 'caja', crear: ['/api/cash', { concept: 'Movimiento secreto A', amount: 500 }], listar: '/api/cash', marca: 'Movimiento secreto A' },
  { nombre: 'diagnosticos', crear: ['/api/diagnostics', { brand: 'Nissan', model: 'Diagnostico secreto A', measured_psi: 55 }], listar: '/api/diagnostics', marca: 'Diagnostico secreto A' },
];

/* Saca el id de un alta, sin importar cómo lo envuelva cada ruta. */
const idDe = (body) => body?.id ?? body?.item?.id ?? body?.client?.id ?? body?.order?.id ?? null;

/* Normaliza una respuesta de lista a array de filas. */
const filas = (body) => (Array.isArray(body) ? body : (body?.items || body?.rows || []));

describe('Seguridad — aislamiento entre talleres', () => {
  let ctx, tallerA, tallerB, creados;

  before(async () => {
    ctx = await levantarServidor();
    tallerA = crearCliente(ctx.base);
    tallerB = crearCliente(ctx.base);
    await tallerA.registrar('A');
    await tallerB.registrar('B');

    // El taller A crea un registro de cada tipo.
    creados = {};
    for (const r of RECURSOS) {
      const res = await tallerA.post(r.crear[0], r.crear[1]);
      assert.ok(res.status < 400, `no se pudo crear ${r.nombre}: ${res.status} ${JSON.stringify(res.body)}`);
      creados[r.nombre] = res.body;
    }
  });

  after(() => ctx.cerrar());

  for (const r of RECURSOS) {
    it(`el taller B NO ve el ${r.nombre} del taller A`, async () => {
      const { status, body } = await tallerB.get(r.listar);
      assert.equal(status, 200, `${r.listar} respondió ${status}`);

      const idA = idDe(creados[r.nombre]);
      assert.equal(filas(body).some(f => f.id === idA), false,
        `FUGA DE DATOS: ${r.listar} le mostró al taller B el registro id=${idA} del taller A`);

      assert.equal(JSON.stringify(body).includes(r.marca), false,
        `FUGA DE DATOS: ${r.listar} le mostró al taller B el texto "${r.marca}" del taller A`);
    });

    it(`el taller A sí ve su propio ${r.nombre}`, async () => {
      const { body } = await tallerA.get(r.listar);
      const idA = idDe(creados[r.nombre]);
      assert.ok(filas(body).some(f => f.id === idA),
        `el taller A no encuentra su propio registro (id=${idA}) en ${r.listar}: el filtro por workshop_id quedó demasiado estricto`);
      if (r.marcaEnLista !== false) {
        assert.ok(JSON.stringify(body).includes(r.marca), `${r.listar} no devuelve el texto del propio registro`);
      }
    });

    it(`sin sesión, ${r.listar} responde 401 y no filtra nada`, async () => {
      const anonimo = crearCliente(ctx.base);
      const { status, body } = await anonimo.get(r.listar);
      assert.equal(status, 401, `${r.listar} sin sesión debería ser 401, fue ${status}`);
      assert.equal(JSON.stringify(body).includes(r.marca), false, 'una respuesta 401 no puede traer datos');
    });
  }

  it('el taller B no puede BORRAR un registro del taller A conociendo su id (IDOR)', async () => {
    const id = idDe(creados.clientes);
    assert.ok(id, 'el alta de cliente debería devolver un id');

    const del = await tallerB.del(`/api/clients/${id}`);
    assert.ok([401, 403, 404].includes(del.status),
      `borrado cruzado devolvió ${del.status}: debe ser 404 (o 403), nunca 200`);

    // Y el registro debe seguir existiendo para su dueño.
    const { body } = await tallerA.get('/api/clients');
    assert.ok(JSON.stringify(body).includes('Cliente secreto A'),
      'el taller B logró borrar un cliente del taller A');
  });

  it('el taller B no puede MODIFICAR inventario del taller A conociendo su id (IDOR)', async () => {
    const id = idDe(creados.inventario);
    assert.ok(id, 'el alta de inventario debería devolver un id');

    const put = await tallerB.put(`/api/inventory/${id}`, { code: 'HACKEADO', name: 'HACKEADO' });
    assert.ok([401, 403, 404].includes(put.status), `edición cruzada devolvió ${put.status}`);

    const { body } = await tallerA.get('/api/inventory');
    assert.equal(JSON.stringify(body).includes('HACKEADO'), false,
      'el taller B logró editar inventario del taller A');
  });

  it('la exportación de respaldo solo trae datos del taller que la pide', async () => {
    const { status, body } = await tallerB.get('/api/backup');
    if (status === 200) {
      const texto = JSON.stringify(body);
      for (const r of RECURSOS) {
        assert.equal(texto.includes(r.marca), false,
          `FUGA EN EL RESPALDO: /api/backup le dio al taller B el registro "${r.marca}" del taller A`);
      }
    }
  });

  it('la exportación de inventario en CSV tampoco cruza cuentas', async () => {
    const { status, body } = await tallerB.get('/api/inventory/export');
    if (status === 200) {
      assert.equal(String(body).includes('Pila secreta A'), false,
        'FUGA EN CSV: /api/inventory/export cruzó datos entre talleres');
    }
  });
});

describe('Seguridad — sesiones y credenciales', () => {
  let ctx, cliente;

  before(async () => {
    ctx = await levantarServidor();
    cliente = crearCliente(ctx.base);
  });
  after(() => ctx.cerrar());

  it('la cookie de sesión es HttpOnly y con SameSite', async () => {
    const r = await cliente.post('/api/auth/register', {
      email: 'cookie@prueba.test', password: 'clave-larga-123', name: 'Taller Cookie',
    });
    assert.equal(r.status, 201);
    const cookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    const sesion = cookies.find(c => c.startsWith('ftm_session='));
    assert.ok(sesion, 'el registro debe entregar la cookie de sesión');
    assert.match(sesion, /HttpOnly/i, 'sin HttpOnly, cualquier XSS roba la sesión');
    assert.match(sesion, /SameSite/i, 'sin SameSite, la sesión queda expuesta a CSRF');
  });

  it('la respuesta de registro NUNCA devuelve el hash de la contraseña', async () => {
    const r = await cliente.post('/api/auth/register', {
      email: 'hash@prueba.test', password: 'clave-larga-123', name: 'Taller Hash',
    });
    const texto = JSON.stringify(r.body);
    assert.equal(/pass_hash|scrypt\$/.test(texto), false, `el alta devolvió material de contraseña: ${texto}`);
  });

  it('/api/auth/me nunca expone el hash ni los tokens de verificación', async () => {
    const c = crearCliente(ctx.base);
    await c.registrar('Me');
    const { body } = await c.get('/api/auth/me');
    const texto = JSON.stringify(body);
    for (const campo of ['pass_hash', 'scrypt$', 'verify_token_hash', 'token_hash']) {
      assert.equal(texto.includes(campo), false, `/api/auth/me filtró "${campo}"`);
    }
  });

  it('rechaza contraseñas de menos de 8 caracteres', async () => {
    const r = await cliente.post('/api/auth/register', {
      email: 'corta@prueba.test', password: 'abc', name: 'Taller Corto',
    });
    assert.equal(r.status, 400);
  });

  it('rechaza correos con formato inválido', async () => {
    for (const email of ['no-es-correo', '@sinusuario.com', 'sin@dominio', '']) {
      const r = await cliente.post('/api/auth/register', { email, password: 'clave-larga-123', name: 'X' });
      assert.equal(r.status, 400, `aceptó el correo inválido "${email}"`);
    }
  });

  it('no permite registrar dos veces el mismo correo', async () => {
    const datos = { email: 'repetido@prueba.test', password: 'clave-larga-123', name: 'Taller' };
    assert.equal((await cliente.post('/api/auth/register', datos)).status, 201);
    assert.equal((await cliente.post('/api/auth/register', datos)).status, 409);
  });

  it('el mensaje de login fallido no revela si el correo existe', async () => {
    const existente = await cliente.post('/api/auth/login', { email: 'repetido@prueba.test', password: 'clave-equivocada' });
    const inexistente = await cliente.post('/api/auth/login', { email: 'nadie@prueba.test', password: 'clave-equivocada' });
    assert.equal(existente.status, inexistente.status, 'distinto código de estado permite enumerar cuentas');
    assert.deepEqual(existente.body, inexistente.body, 'distinto mensaje permite enumerar cuentas');
  });

  it('un token de sesión inventado no sirve', async () => {
    const falso = crearCliente(ctx.base);
    const r = await falso.get('/api/inventory', { headers: { cookie: 'ftm_session=token-inventado-123' } });
    assert.equal(r.status, 401);
  });

  it('un Bearer inventado tampoco sirve', async () => {
    const falso = crearCliente(ctx.base);
    const r = await falso.get('/api/inventory', { headers: { authorization: 'Bearer token-inventado-123' } });
    assert.equal(r.status, 401);
  });

  it('tras cerrar sesión el token deja de servir de inmediato', async () => {
    const c = crearCliente(ctx.base);
    await c.registrar('Logout');
    assert.equal((await c.get('/api/inventory')).status, 200);
    await c.post('/api/auth/logout', {});
    assert.equal((await c.get('/api/inventory')).status, 401, 'la sesión debe morir en el servidor, no solo en el navegador');
  });
});

describe('Seguridad — cabeceras y superficie pública', () => {
  let ctx, c;
  before(async () => { ctx = await levantarServidor(); c = crearCliente(ctx.base); });
  after(() => ctx.cerrar());

  it('envía las cabeceras de seguridad básicas', async () => {
    const r = await c.get('/healthz');
    const esperadas = {
      'content-security-policy': /default-src/,
      'x-content-type-options': /nosniff/,
      'referrer-policy': /strict-origin/,
      'permissions-policy': /geolocation=\(\)/,
    };
    for (const [cabecera, patron] of Object.entries(esperadas)) {
      const v = r.headers.get(cabecera);
      assert.ok(v, `falta la cabecera ${cabecera}`);
      assert.match(v, patron, `${cabecera} con valor inesperado: ${v}`);
    }
  });

  it('la CSP no abre unsafe-eval ni deja objectSrc libre', async () => {
    const csp = (await c.get('/healthz')).headers.get('content-security-policy');
    assert.equal(/unsafe-eval/.test(csp), false, 'unsafe-eval permite ejecutar strings como código');
    assert.match(csp, /object-src 'none'/, "object-src debe ser 'none'");
    assert.match(csp, /base-uri 'self'/, 'sin base-uri, una inyección puede reescribir todas las URLs relativas');
  });

  it('no revela la tecnología del servidor', async () => {
    const r = await c.get('/healthz');
    assert.equal(r.headers.get('x-powered-by'), null, 'x-powered-by le regala la pila al atacante');
  });

  it('rechaza cuerpos JSON gigantes en vez de tragárselos', async () => {
    const enorme = { name: 'x'.repeat(200_000) };
    const r = await c.post('/api/auth/register', enorme);
    assert.ok(r.status === 413 || r.status === 400, `un cuerpo de 200 KB devolvió ${r.status}`);
  });

  it('los parámetros basura no producen 500', async () => {
    const rutas = [
      '/api/vehicles?limit=abc', '/api/vehicles?limit=-999999', '/api/vehicles?limit=9999999999999999999',
      '/api/vehicles?offset=NaN', '/api/vehicles?q=' + '%00'.repeat(10),
      '/api/vehicles/abc', '/api/vehicles/-1', '/api/vehicles/0',
      '/api/modules/abc', '/api/pumps/abc',
    ];
    for (const ruta of rutas) {
      const { status } = await c.get(ruta);
      assert.ok(status < 500, `${ruta} devolvió ${status}: un parámetro basura nunca debe tirar el servidor`);
    }
  });

  it('una inyección SQL clásica no rompe ni devuelve de más', async () => {
    const payloads = [
      "' OR '1'='1", "'; DROP TABLE vehicles; --", "1 UNION SELECT * FROM workshops",
      "%27%20OR%201=1--",
    ];
    for (const p of payloads) {
      const { status } = await c.get('/api/vehicles?q=' + encodeURIComponent(p));
      assert.ok(status < 500, `payload "${p}" devolvió ${status}`);
    }
    // Y la tabla debe seguir viva.
    const { status, body } = await c.get('/api/vehicles');
    assert.equal(status, 200);
    assert.ok((body.items || body).length > 0, 'el catálogo desapareció tras la inyección');
  });

  it('el HTML renderizado en servidor escapa el contenido de la base', async () => {
    // La ficha del vehículo interpola datos en HTML. Si algún día un dato trae
    // "<", tiene que salir escapado o es un XSS almacenado.
    const r = await c.get('/vehiculo/nissan-tsuru-1992-2017-1');
    if (r.status === 200) {
      const html = String(r.body);
      const dentroDeScripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/g) || [];
      const sinScripts = dentroDeScripts.reduce((h, s) => h.replace(s, ''), html);
      assert.equal(/<script(?![^>]*type="application\/ld\+json")/i.test(sinScripts.replace(/<script[^>]*><\/script>/g, '')), false,
        'apareció una etiqueta script inesperada en el contenido');
    }
  });

  it('el panel /admin está desactivado cuando no hay ADMIN_PASSWORD', async () => {
    // Seguro por defecto: sin contraseña configurada, nadie entra.
    const r = await c.post('/api/admin/login', { password: 'lo-que-sea' });
    assert.ok(r.status >= 400, `el login de admin sin contraseña configurada devolvió ${r.status}`);
  });

  it('las rutas de admin rechazan a quien no es admin', async () => {
    // 503 es la respuesta correcta cuando ADMIN_PASSWORD no está configurada:
    // el panel entero queda desactivado (seguro por defecto). 401/403 es la
    // respuesta cuando sí está configurada y el token falta o no vale.
    // Lo que NUNCA puede pasar es un 2xx.
    for (const ruta of ['/api/admin/vehicles', '/api/admin/missing']) {
      const { status } = await c.get(ruta);
      assert.ok([401, 403, 503].includes(status), `${ruta} devolvió ${status} sin credenciales de admin`);
    }
  });

  it('una ruta inexistente no devuelve 500 ni refleja lo que le mandes', async () => {
    const r = await c.get('/api/no-existe-<script>alert(1)</script>');
    assert.ok(r.status === 404 || r.status === 400, `devolvió ${r.status}`);
    assert.equal(String(r.body).includes('<script>alert(1)</script>'), false, 'la respuesta refleja HTML sin escapar');
  });
});

describe('Seguridad — cobertura de la protección (análisis estático)', () => {
  /* Estas tres pruebas son las que impiden que alguien agregue un recurso nuevo
     sin protegerlo. No hacen peticiones: leen server-pg.js. */

  const PUBLICAS_A_PROPOSITO = new Set([
    'POST /api/visit',
    'GET /api/meta', 'GET /api/vehicles', 'GET /api/vehicles/:id',
    'GET /api/vehicles/:id/comments', 'POST /api/vehicles/:id/comments',
    'GET /api/modules', 'GET /api/modules/:id', 'GET /api/pumps', 'GET /api/pumps/:id',
    'POST /api/chat', 'GET /api/catalog/export',
    // La puerta del panel: es la ruta que ENTREGA el token de admin, así que no
    // puede exigirlo. Se protege con contraseña + rate limit, no con middleware.
    'POST /api/admin/login',
    'POST /api/auth/register', 'POST /api/auth/login', 'POST /api/auth/logout',
    'GET /api/auth/verify',
    'GET /api/workshops', 'GET /api/workshops/:slug', 'POST /api/workshops/:slug/reviews',
    'GET /api/connect/profiles', 'POST /api/connect/profiles',
    'GET /api/connect/match', 'POST /api/connect/locate',
  ]);

  it('toda ruta /api nueva está protegida, o declarada pública a propósito', () => {
    const sinProteger = rutasDeclaradas()
      .filter(r => r.ruta.startsWith('/api/') && !r.protegida && !r.admin)
      .map(r => `${r.metodo} ${r.ruta}`)
      .filter(k => !PUBLICAS_A_PROPOSITO.has(k));

    assert.deepEqual(sinProteger, [],
      'Rutas /api sin requireWorkshop ni requireAdmin. Protégelas, o si de verdad son ' +
      'públicas agrégalas a PUBLICAS_A_PROPOSITO en esta prueba explicando por qué.');
  });

  it('la lista de excepciones no acumula rutas que ya no existen', () => {
    const existentes = new Set(rutasDeclaradas().map(r => `${r.metodo} ${r.ruta}`));
    const fantasmas = [...PUBLICAS_A_PROPOSITO].filter(k => !existentes.has(k));
    assert.deepEqual(fantasmas, [], 'quita de PUBLICAS_A_PROPOSITO las rutas que ya no existen');
  });

  it('las rutas de admin usan requireAdmin sin excepción', () => {
    const flojas = rutasDeclaradas()
      .filter(r => r.ruta.startsWith('/api/admin/') && !r.admin && r.ruta !== '/api/admin/login')
      .map(r => `${r.metodo} ${r.ruta} (línea ${r.linea})`);
    assert.deepEqual(flojas, [], 'rutas de admin sin requireAdmin');
  });

  it('las rutas de autenticación llevan limitador de intentos (fuerza bruta)', () => {
    const sinLimite = rutasDeclaradas()
      .filter(r => ['/api/auth/login', '/api/auth/register'].includes(r.ruta) && !r.limitada)
      .map(r => `${r.metodo} ${r.ruta}`);
    assert.deepEqual(sinLimite, [], 'login y registro necesitan rate limit o son fuerza bruta gratis');
  });
});
