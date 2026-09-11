'use strict';
/* ============================================================================
   QA de contrato de la API.

   No prueba qué calcula cada ruta (de eso se encargan api.test.js y
   business.test.js), sino que TODAS se comporten igual entre sí: mismos
   códigos de estado, misma forma de error, mismo tipo de contenido, y que
   ninguna ruta nueva quede sin tocar por ninguna prueba.
   ========================================================================= */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { levantarServidor, crearCliente, rutasDeclaradas } = require('../helpers');

describe('Contrato — forma de las respuestas', () => {
  let ctx, c, taller;

  before(async () => {
    ctx = await levantarServidor();
    c = crearCliente(ctx.base);
    taller = crearCliente(ctx.base);
    await taller.registrar('Contrato');
  });
  after(() => ctx.cerrar());

  it('todo error responde con JSON y una propiedad "error" de texto', async () => {
    const casos = [
      ['GET', '/api/vehicles/999999'],
      ['GET', '/api/modules/999999'],
      ['GET', '/api/pumps/999999'],
      ['GET', '/api/inventory'],          // 401 sin sesión
      ['GET', '/api/ruta-que-no-existe'], // 404 del router
      ['POST', '/api/auth/login'],        // 401 sin credenciales
    ];
    for (const [metodo, ruta] of casos) {
      const r = metodo === 'GET' ? await c.get(ruta) : await c.post(ruta, {});
      assert.ok(r.status >= 400, `${metodo} ${ruta} devolvió ${r.status}, se esperaba un error`);
      assert.equal(typeof r.body, 'object', `${metodo} ${ruta}: el error no vino en JSON`);
      assert.equal(typeof r.body.error, 'string', `${metodo} ${ruta}: falta la propiedad "error" de texto`);
      assert.ok(r.body.error.length > 0, `${metodo} ${ruta}: mensaje de error vacío`);
    }
  });

  it('los mensajes de error están en español (el usuario es un mecánico hispanohablante)', async () => {
    const r = await c.get('/api/vehicles/999999');
    assert.match(r.body.error, /[áéíóúñ¿¡]|no encontrado|inválid|requerid|sesión/i,
      `mensaje de error en inglés o genérico: "${r.body.error}"`);
  });

  it('ningún error de cliente se disfraza de 500', async () => {
    const casos = ['/api/vehicles/abc', '/api/modules/abc', '/api/pumps/abc', '/api/vehicles?limit=abc'];
    for (const ruta of casos) {
      const { status } = await c.get(ruta);
      assert.notEqual(status, 500, `${ruta} devolvió 500: un parámetro inválido es culpa del cliente (4xx)`);
    }
  });

  it('las listas siempre devuelven un array, nunca null', async () => {
    for (const ruta of ['/api/vehicles', '/api/modules', '/api/pumps']) {
      const { body } = await c.get(ruta);
      const lista = Array.isArray(body) ? body : (body.items || body.rows);
      assert.ok(Array.isArray(lista), `${ruta} no devolvió un array`);
    }
  });

  it('las rutas privadas responden con Cache-Control: no-store', async () => {
    // Sin esto, un proxy o el propio navegador puede guardar datos de un taller
    // y servírselos a otro en un equipo compartido del local.
    for (const ruta of ['/api/auth/me', '/api/inventory', '/api/clients', '/api/orders', '/api/documents']) {
      const r = await taller.get(ruta);
      if (r.status !== 200) continue;
      const cc = r.headers.get('cache-control') || '';
      assert.match(cc, /no-store/, `${ruta} no marca no-store (Cache-Control: "${cc}")`);
    }
  });

  it('el catálogo público sí se puede cachear (es el mismo para todos)', async () => {
    const r = await c.get('/api/pumps');
    const cc = r.headers.get('cache-control') || '';
    assert.match(cc, /max-age/, 'el catálogo de pilas debería cachearse: es idéntico para todos los visitantes');
  });

  it('/healthz responde rápido y sin depender de la base', async () => {
    const r = await c.get('/healthz');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true });
  });

  it('un método no permitido no devuelve 500', async () => {
    const r = await c.req('/healthz', { method: 'DELETE' });
    assert.ok(r.status === 404 || r.status === 405, `DELETE /healthz devolvió ${r.status}`);
  });

  it('el cuerpo JSON mal formado devuelve 400, no 500', async () => {
    const res = await fetch(ctx.base + '/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{esto no es json',
    });
    assert.equal(res.status, 400, `un JSON roto devolvió ${res.status}`);
  });
});

describe('Contrato — paginación y límites', () => {
  let ctx, c;
  before(async () => { ctx = await levantarServidor(); c = crearCliente(ctx.base); });
  after(() => ctx.cerrar());

  it('el límite de página tiene tope: no se puede pedir la base entera', async () => {
    const { body } = await c.get('/api/vehicles?limit=999999');
    const lista = Array.isArray(body) ? body : (body.items || []);
    assert.ok(lista.length <= 200, `devolvió ${lista.length} filas: el tope de página no se está aplicando`);
  });

  it('un límite negativo o cero no vacía la respuesta ni rompe', async () => {
    for (const limite of ['-5', '0']) {
      const { status, body } = await c.get(`/api/vehicles?limit=${limite}`);
      assert.equal(status, 200);
      const lista = Array.isArray(body) ? body : (body.items || []);
      assert.ok(lista.length >= 1, `limit=${limite} devolvió una lista vacía`);
    }
  });

  it('el desplazamiento funciona y no repite filas', async () => {
    const p1 = await c.get('/api/vehicles?limit=5&offset=0');
    const p2 = await c.get('/api/vehicles?limit=5&offset=5');
    const ids = (r) => (Array.isArray(r.body) ? r.body : r.body.items || []).map(v => v.id);
    const a = ids(p1), b = ids(p2);
    assert.ok(a.length > 0 && b.length > 0, 'la paginación no devolvió resultados');
    assert.equal(a.some(id => b.includes(id)), false, 'las páginas 1 y 2 comparten filas');
  });
});

describe('Contrato — cobertura de rutas', () => {
  /* Esta prueba es la red que impide que una ruta nueva nazca sin prueba.
     Lee las rutas de server-pg.js y las busca en los archivos de prueba. */
  const fs = require('fs');
  const path = require('path');

  const textoDePruebas = () => {
    const dir = path.join(__dirname, '..');
    const archivos = [];
    const recorrer = (d) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        if (f.isDirectory()) recorrer(path.join(d, f.name));
        else if (f.name.endsWith('.js')) archivos.push(path.join(d, f.name));
      }
    };
    recorrer(dir);
    return archivos.map(f => fs.readFileSync(f, 'utf8')).join('\n');
  };

  it('toda ruta /api aparece en alguna prueba', () => {
    const pruebas = textoDePruebas();
    const sinProbar = [];
    for (const r of rutasDeclaradas()) {
      if (!r.ruta.startsWith('/api/')) continue;
      // Cada :parámetro se vuelve un comodín, de modo que '/api/orders/:id/items'
      // se da por probado cuando alguna prueba escribe '/api/orders/7/items' o
      // '/api/orders/${ids.orden}/items'.
      const patron = new RegExp(
        r.ruta.split('/')
          .map(seg => seg.startsWith(':')
            ? '[^/\'"`\\s]+'
            : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('/')
      );
      if (!patron.test(pruebas)) sinProbar.push(`${r.metodo} ${r.ruta} (línea ${r.linea})`);
    }
    assert.deepEqual(sinProbar, [],
      'Rutas de la API que ninguna prueba menciona. Cada ruta nueva necesita al menos una prueba ' +
      'que compruebe su caso feliz y su caso de error.');
  });

  it('no hay rutas duplicadas (la segunda quedaría muerta)', () => {
    const vistas = new Map();
    const duplicadas = [];
    for (const r of rutasDeclaradas()) {
      const k = `${r.metodo} ${r.ruta}`;
      if (vistas.has(k)) duplicadas.push(`${k}: líneas ${vistas.get(k)} y ${r.linea}`);
      else vistas.set(k, r.linea);
    }
    assert.deepEqual(duplicadas, [], 'Express usa la primera coincidencia: la ruta repetida nunca se ejecuta');
  });

  it('el 404 del router va después de todas las rutas /api', () => {
    /* 4.9 (W6): el 404 JSON de /api se movió a src/routes/misc.js junto con los
       demás extremos del servidor. La invariante es la misma: dentro de ese
       módulo el 404 tiene que ir después de /api/visit, que es su única ruta. */
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'routes', 'misc.js'), 'utf8');
    const posicion404 = src.indexOf("app.use('/api', (req, res) => res.status(404)");
    assert.ok(posicion404 > 0, 'falta el 404 del router de /api');
    const ultimaRuta = Math.max(...rutasDeclaradas()
      .filter(r => r.ruta.startsWith('/api/'))
      .map(r => src.indexOf(`'${r.ruta}'`)));
    assert.ok(posicion404 > ultimaRuta,
      'el manejador 404 de /api está declarado antes que alguna ruta: esa ruta nunca se alcanza');
  });
});
