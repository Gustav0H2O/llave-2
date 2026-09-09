'use strict';
/* ============================================================================
   QA del panel de administración.

   OJO: ADMIN_PASSWORD se lee cuando se carga el módulo del servidor, así que
   hay que definirla ANTES de requerir nada. node:test corre cada archivo en su
   propio proceso, de modo que esto no afecta al resto de las suites.
   ========================================================================= */
process.env.ADMIN_PASSWORD = 'clave-de-prueba-del-panel';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { levantarServidor, crearCliente } = require('../helpers');

/* Cliente que manda el token de admin en cada petición. */
function conToken(base, token) {
  const c = crearCliente(base);
  const original = c.req.bind(c);
  c.req = (ruta, opts = {}) => original(ruta, {
    ...opts,
    headers: { ...(opts.headers || {}), 'x-admin-token': token, authorization: `Bearer ${token}` },
  });
  return c;
}

describe('Panel de administración', () => {
  let ctx, anon, admin, token;

  before(async () => {
    ctx = await levantarServidor();
    anon = crearCliente(ctx.base);
    const login = await anon.post('/api/admin/login', { password: 'clave-de-prueba-del-panel' });
    assert.equal(login.status, 200, `el login de admin devolvió ${login.status}: ${JSON.stringify(login.body)}`);
    token = login.body.token;
    admin = conToken(ctx.base, token);
  });
  after(() => ctx.cerrar());

  it('el login entrega un token con expiración', () => {
    assert.match(token, /^\d+\./, 'el token debe llevar la expiración por delante');
    const [exp] = token.split('.');
    assert.ok(Number(exp) > Date.now(), 'el token nace ya expirado');
  });

  it('rechaza la contraseña equivocada', async () => {
    const r = await anon.post('/api/admin/login', { password: 'otra-cosa' });
    assert.equal(r.status, 401);
  });

  it('rechaza una contraseña de otra longitud sin filtrarlo por el tiempo de respuesta', async () => {
    // La comparación es timingSafeEqual, que exige la misma longitud; el
    // servidor debe responder 401 igual, no reventar.
    for (const pass of ['', 'x', 'clave-de-prueba-del-panel-mas-larga']) {
      assert.equal((await anon.post('/api/admin/login', { password: pass })).status, 401);
    }
  });

  it('un token inventado no abre nada', async () => {
    const falso = conToken(ctx.base, '9999999999999.firmaInventada');
    assert.equal((await falso.get('/api/admin/bootstrap')).status, 401);
  });

  it('un token caducado no sirve', async () => {
    const caducado = conToken(ctx.base, `${Date.now() - 1000}.loQueSea`);
    assert.equal((await caducado.get('/api/admin/bootstrap')).status, 401);
  });

  it('/api/admin/bootstrap devuelve catálogos, enums y conteos', async () => {
    const r = await admin.get('/api/admin/bootstrap');
    assert.equal(r.status, 200);
    for (const clave of ['brands', 'injection_types', 'pumps', 'enums', 'counts']) {
      assert.ok(r.body[clave], `falta "${clave}" en el bootstrap`);
    }
    assert.ok(Array.isArray(r.body.enums.body_types));
    assert.ok(Array.isArray(r.body.enums.zones));
    assert.ok(Number.isFinite(Number(r.body.counts.vehicles)));
    assert.ok(Number.isFinite(Number(r.body.counts.unverified)), 'el conteo de no verificados es lo que guía la carga de datos');
  });

  it('el bootstrap no se cachea', async () => {
    const r = await admin.get('/api/admin/bootstrap');
    assert.match(r.headers.get('cache-control') || '', /no-store/);
  });

  it('lista vehículos y trae uno por id', async () => {
    const lista = await admin.get('/api/admin/vehicles');
    assert.equal(lista.status, 200);
    const filas = Array.isArray(lista.body) ? lista.body : (lista.body.items || []);
    assert.ok(filas.length > 0, 'el panel no ve ningún vehículo');

    const uno = await admin.get(`/api/admin/vehicles/${filas[0].id}`);
    assert.equal(uno.status, 200);
    assert.equal((uno.body.vehicle || uno.body).id, filas[0].id);
  });

  it('un id inexistente devuelve 404, no 500', async () => {
    assert.equal((await admin.get('/api/admin/vehicles/999999')).status, 404);
    assert.ok((await admin.get('/api/admin/vehicles/abc')).status < 500);
  });

  it('da de alta una marca', async () => {
    const r = await admin.post('/api/admin/brands', { name: 'MarcaDePrueba' });
    assert.ok(r.status === 200 || r.status === 201, `devolvió ${r.status}: ${JSON.stringify(r.body)}`);
    const boot = await admin.get('/api/admin/bootstrap');
    assert.ok(boot.body.brands.some(b => b.name === 'MarcaDePrueba'), 'la marca no aparece en el bootstrap');
  });

  it('rechaza una marca sin nombre', async () => {
    assert.equal((await admin.post('/api/admin/brands', { name: '' })).status, 400);
  });

  it('da de alta una pila', async () => {
    const r = await admin.post('/api/admin/pumps', {
      code: 'PRUEBA-001', manufacturer: 'Genérica', pump_style: 'Turbina',
      max_psi_direct: 95, amperage_a: 8, flow_lph_free: 120, diagram_key: 'pump_generic',
    });
    assert.ok(r.status === 200 || r.status === 201, `devolvió ${r.status}: ${JSON.stringify(r.body)}`);
    const lista = await crearCliente(ctx.base).get('/api/pumps');
    assert.ok(lista.body.some(p => p.code === 'PRUEBA-001'), 'la pila nueva no aparece en el catálogo público');
  });

  it('crea, edita, verifica y borra un vehículo', async () => {
    const boot = (await admin.get('/api/admin/bootstrap')).body;
    const marca = boot.brands[0];
    const inyeccion = boot.injection_types.find(i => i.code === 'MFI') || boot.injection_types[0];

    // El alta del panel exige el vehículo, su módulo y la ubicación: un vehículo
    // sin módulo no le sirve de nada al mecánico, por eso van juntos.
    const cuerpo = (model) => ({
      brand_id: marca.id, model, year_from: 2010, year_to: 2016,
      engine: '1.6L L4', body_type: 'sedan', injection_type_id: inyeccion.id,
      rail_pressure_psi_min: 50, rail_pressure_psi_max: 60, data_verified: 0,
      module: {
        code: 'FTM-PRU-999', name: 'Módulo de prueba', assembly_type: 'module_returnless',
        regulated_psi: 60, flow_lph: 110, diagram_key: 'module_intank_returnless',
      },
      link: { location_text: 'Bajo el asiento trasero', location_zone: 'rear_seat', requires_tank_removal: 0 },
    });

    const alta = await admin.post('/api/admin/vehicles', cuerpo('ModeloDePrueba'));
    assert.ok(alta.status === 200 || alta.status === 201, `alta devolvió ${alta.status}: ${JSON.stringify(alta.body)}`);
    const id = alta.body.id;
    assert.ok(id > 0);

    const edicion = await admin.put(`/api/admin/vehicles/${id}`, cuerpo('ModeloEditado'));
    assert.equal(edicion.status, 200, `edición devolvió ${edicion.status}`);
    const traido = await admin.get(`/api/admin/vehicles/${id}`);
    assert.equal((traido.body.vehicle || traido.body).model, 'ModeloEditado');

    const verificado = await admin.post(`/api/admin/vehicles/${id}/verify`, { data_verified: 1 });
    assert.equal(verificado.status, 200, 'marcar como verificado es lo que quita el aviso rojo de la ficha');
    const traidoTrasVerificar = await admin.get(`/api/admin/vehicles/${id}`);
    assert.equal(Number((traidoTrasVerificar.body.vehicle || traidoTrasVerificar.body).data_verified), 1,
      'el vehículo sigue marcado como no verificado: el UPDATE no llegó a la base');

    assert.equal((await admin.del(`/api/admin/vehicles/${id}`)).status, 200);
    assert.equal((await admin.get(`/api/admin/vehicles/${id}`)).status, 404);
  });

  it('la importación masiva acepta un lote y reporta el resultado', async () => {
    const boot = (await admin.get('/api/admin/bootstrap')).body;
    const marca = boot.brands[0].name;
    const inyeccion = (boot.injection_types.find(i => i.code === 'MFI') || boot.injection_types[0]).code;

    const r = await admin.post('/api/admin/vehicles/import', {
      rows: [
        { brand: marca, model: 'ImportadoUno', year_from: 2001, year_to: 2005, engine: '1.8L L4', injection: inyeccion, psi_min: 50, psi_max: 60 },
        { brand: marca, model: 'ImportadoDos', year_from: 2006, year_to: 2010, engine: '2.0L L4', injection: inyeccion, psi_min: 50, psi_max: 60 },
      ],
    });
    assert.ok(r.status < 400, `la importación devolvió ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal(typeof r.body, 'object', 'la importación debe reportar qué pasó con cada fila');
  });

  it('la importación masiva rechaza un cuerpo sin filas', async () => {
    const r = await admin.post('/api/admin/vehicles/import', {});
    assert.ok(r.status >= 400, 'importar sin filas debería ser un error explícito');
  });

  it('/api/admin/missing lista las búsquedas sin resultado', async () => {
    // Es la hoja de ruta de datos: qué buscan los mecánicos y no está.
    const r = await admin.get('/api/admin/missing');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body) || Array.isArray(r.body.items), 'debe devolver una lista');
  });

  it('SIN token, ninguna ruta de admin responde 2xx', async () => {
    const rutas = [
      ['GET', '/api/admin/bootstrap'], ['GET', '/api/admin/vehicles'], ['GET', '/api/admin/missing'],
      ['POST', '/api/admin/brands'], ['POST', '/api/admin/pumps'], ['POST', '/api/admin/vehicles'],
      ['POST', '/api/admin/vehicles/import'],
    ];
    for (const [metodo, ruta] of rutas) {
      const r = metodo === 'GET' ? await anon.get(ruta) : await anon.post(ruta, {});
      assert.ok(r.status >= 400, `${metodo} ${ruta} respondió ${r.status} sin token de admin`);
    }
  });

  it('el panel de admin no permite borrar vehículos sin token', async () => {
    const r = await anon.del('/api/admin/vehicles/1');
    assert.ok(r.status >= 400, `borrado sin token devolvió ${r.status}`);
    const sigue = await admin.get('/api/admin/vehicles/1');
    assert.equal(sigue.status, 200, 'un anónimo consiguió borrar el vehículo 1');
  });

  describe('Administración de Talleres y Resiliencia de Cuentas', () => {
    let wsId, wsEmail;

    before(async () => {
      wsEmail = `taller-admin-test-${Date.now()}@example.com`;
      const reg = await anon.post('/api/auth/register', {
        name: 'Taller Para Admin Test',
        email: wsEmail,
        password: 'Password123!',
        phone: '+584120001122',
        city: 'Valencia',
        doc_id: 'J-99887766-0',
        business_type: 'Mecánica General'
      });
      assert.equal(reg.status, 201);
      wsId = reg.body.id;
    });

    it('GET /api/admin/workshops lista talleres con métricas operativas', async () => {
      const r = await admin.get('/api/admin/workshops');
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body), 'debe devolver un array de talleres');
      const found = r.body.find(w => w.id === wsId);
      assert.ok(found, 'debe encontrar el taller recién creado');
      assert.equal(found.name, 'Taller Para Admin Test');
      assert.equal(typeof found.clients_count, 'number');
      assert.equal(typeof found.orders_count, 'number');
    });

    it('PUT /api/admin/workshops/:id edita información del taller', async () => {
      const r = await admin.put(`/api/admin/workshops/${wsId}`, {
        name: 'Taller Editado Por Admin',
        city: 'Maracaibo',
        phone: '+584145554433',
        business_type: 'Especialista en Inyección y Bombas',
        onboarding_completed: true,
        donor_level: 2,
        total_donated: 15.00
      });
      assert.equal(r.status, 200);
      assert.equal(r.body.workshop.name, 'Taller Editado Por Admin');
      assert.equal(r.body.workshop.city, 'Maracaibo');
      assert.equal(r.body.workshop.donor_level, 2);
      assert.equal(r.body.workshop.total_donated, 15);
    });

    it('POST /api/admin/workshops/:id/password cambia contraseña directamente', async () => {
      const r = await admin.post(`/api/admin/workshops/${wsId}/password`, {
        new_password: 'NuevaPassword456!'
      });
      assert.equal(r.status, 200);

      // Verificamos que el taller puede loguearse con su nueva contraseña
      const login = await anon.post('/api/auth/login', {
        email: wsEmail,
        password: 'NuevaPassword456!'
      });
      assert.equal(login.status, 200, 'el taller debe poder autenticarse con la nueva contraseña');
    });

    it('GET /api/admin/workshops/:id/backup exporta el JSON de respaldo completo', async () => {
      const r = await admin.get(`/api/admin/workshops/${wsId}/backup`);
      assert.equal(r.status, 200);
      assert.equal(typeof r.body, 'object');
      assert.equal(r.body.workshop.id, wsId);
      assert.ok(Array.isArray(r.body.clients));
      assert.ok(Array.isArray(r.body.orders));
      assert.ok(Array.isArray(r.body.inventory));
    });

    it('POST /api/admin/workshops/:id/wipe vacía datos operativos conservando la cuenta', async () => {
      const r = await admin.post(`/api/admin/workshops/${wsId}/wipe`, {});
      assert.equal(r.status, 200);

      // La cuenta de taller sigue existiendo
      const check = await admin.get('/api/admin/workshops');
      const found = check.body.find(w => w.id === wsId);
      assert.ok(found, 'la cuenta del taller debe mantenerse tras el vaciado');
      assert.equal(found.clients_count, 0);
      assert.equal(found.orders_count, 0);
    });

    it('DELETE /api/admin/workshops/:id elimina la cuenta de forma definitiva en cascada', async () => {
      const r = await admin.del(`/api/admin/workshops/${wsId}`);
      assert.equal(r.status, 200);

      // Ya no debe existir
      const check = await admin.get('/api/admin/workshops');
      const found = check.body.find(w => w.id === wsId);
      assert.equal(found, undefined, 'el taller debe quedar eliminado');
    });

    it('GET /api/donations/public es pública y no expone datos sensibles', async () => {
      const r = await anon.get('/api/donations/public');
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body), 'debe devolver lista de aportes');
      for (const item of r.body) {
        assert.equal(item.pass_hash, undefined, 'nunca debe exponer pass_hash');
        assert.equal(item.email, undefined, 'nunca debe exponer email del donador');
        assert.equal(item.doc_id, undefined, 'nunca debe exponer documentos fiscales');
      }
    });
  });
});
