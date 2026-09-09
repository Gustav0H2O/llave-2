'use strict';
/* ============================================================================
   QA de Donaciones, Rangos de Donador y Aprobación Rápida.
   ========================================================================= */
process.env.ADMIN_PASSWORD = 'clave-de-prueba-del-panel';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { levantarServidor, crearCliente } = require('../helpers');

function conToken(base, token) {
  const c = crearCliente(base);
  const original = c.req.bind(c);
  c.req = (ruta, opts = {}) => original(ruta, {
    ...opts,
    headers: { ...(opts.headers || {}), 'x-admin-token': token, authorization: `Bearer ${token}` },
  });
  return c;
}

describe('Donaciones y Rangos de Donador', () => {
  let ctx, anon, taller, admin, tallerId;

  before(async () => {
    ctx = await levantarServidor();
    anon = crearCliente(ctx.base);
    taller = crearCliente(ctx.base);
    const reg = await taller.registrar('Donar');
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    tallerId = reg.body.id;

    const login = await anon.post('/api/admin/login', { password: 'clave-de-prueba-del-panel' });
    assert.equal(login.status, 200);
    admin = conToken(ctx.base, login.body.token);
  });
  after(() => ctx.cerrar());

  it('rechaza donaciones con método inválido o sin referencia', async () => {
    const r1 = await anon.post('/api/donations', { method: 'paypal', reference: '123', amount: 10 });
    assert.equal(r1.status, 400);

    const r2 = await anon.post('/api/donations', { method: 'zinli', reference: '', amount: 10 });
    assert.equal(r2.status, 400);

    const r3 = await anon.post('/api/donations', { method: 'binance', reference: '999', amount: -5 });
    assert.equal(r3.status, 400);
  });

  it('registra una donación pública con Zinli vinculada a un taller', async () => {
    const res = await anon.post('/api/donations', {
      method: 'zinli',
      reference: 'ZIN-REF-001',
      amount: 15,
      donor_name: 'Donante Solidario',
      email: 'taller-donaciones-qa@example.com',
      workshop_id: tallerId,
      note: 'Aporte para el desarrollo de módulos',
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.id > 0);
  });

  it('GET /api/admin/donations requiere admin y lista la solicitud', async () => {
    const unauth = await anon.get('/api/admin/donations');
    assert.equal(unauth.status, 401);

    const res = await admin.get('/api/admin/donations');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const encontrada = res.body.find(d => d.reference === 'ZIN-REF-001');
    assert.ok(encontrada, 'la donación registrada debe aparecer en la lista del admin');
    assert.equal(encontrada.status, 'pending');
    assert.equal(encontrada.amount, 15);
    assert.equal(encontrada.workshop_id, tallerId);
  });

  it('POST /api/admin/donations/:id/approve aprueba y sube el nivel del taller', async () => {
    const lista = await admin.get('/api/admin/donations');
    const don = lista.body.find(d => d.reference === 'ZIN-REF-001');
    assert.ok(don);

    const appRes = await admin.post(`/api/admin/donations/${don.id}/approve`, { amount: 15 });
    assert.equal(appRes.status, 200);
    assert.equal(appRes.body.status, 'approved');

    // Verificar perfil del taller: nivel 3 ($15 = Destacado Oro)
    const me = await taller.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.donor_level, 3);
    assert.equal(me.body.total_donated, 15);
  });

  it('POST /api/admin/donations/:id/reject rechaza la solicitud', async () => {
    const nueva = await anon.post('/api/donations', {
      method: 'binance',
      reference: 'BIN-REJECT-99',
      amount: 5,
      donor_name: 'Prueba Rechazo',
    });
    assert.equal(nueva.status, 201);

    const rej = await admin.post(`/api/admin/donations/${nueva.body.id}/reject`, { reason: 'Referencia no encontrada' });
    assert.equal(rej.status, 200);
    assert.equal(rej.body.status, 'rejected');
  });

  it('GET /api/donations/quick-approve aprueba en 1 clic mediante enlace con token criptográfico', async () => {
    // Registrar donación de $35 para alcanzar nivel 5 ($15 anterior + $35 = $50 -> Socio Fundador Diamante)
    const nueva = await anon.post('/api/donations', {
      method: 'binance',
      reference: 'BIN-TOKEN-005',
      amount: 35,
      workshop_id: tallerId,
      donor_name: 'Mecánico Estrella',
    });
    assert.equal(nueva.status, 201);

    const lista = await admin.get('/api/admin/donations');
    const don = lista.body.find(d => d.id === nueva.body.id);
    assert.ok(don.approve_token, 'la donación debe generar un token de aprobación rápida');

    // Visitar el enlace directo
    const quickRes = await anon.get(`/api/donations/quick-approve?token=${don.approve_token}`);
    assert.equal(quickRes.status, 200);
    assert.ok(quickRes.body.includes('Aprobado'));

    // Verificar que el taller ahora es nivel 5 (Socio Fundador Diamante con $50 acumulados)
    const me = await taller.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.donor_level, 5);
    assert.equal(me.body.total_donated, 50);
  });
});
