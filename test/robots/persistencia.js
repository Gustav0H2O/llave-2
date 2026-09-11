'use strict';
/* ============================================================================
   ROBOT DE PERSISTENCIA E INTEGRIDAD DE DATOS
   
   Garantiza que toda cuenta creada y todo dato de taller (clientes, vehículos,
   órdenes, inventario, documentos, notas, caja):
     1. Permanezca PERMANENTEMENTE y nunca desaparezca por reinicio de servidor.
     2. Sobreviva intacto a ejecuciones de esquemas o migraciones (schema.sql).
     3. No sufra daños colaterales ante borrados o acciones de otros talleres.
     4. Mantenga integridad relacional y consistencia transaccional.

   Uso:
     node test/robots/persistencia.js
   ========================================================================= */
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { createApp } = require('../../server-pg');
const { DBAdapter } = require('../../db');
const { seedTestDb } = require('../seed-test');
const { crearCliente } = require('../helpers');
const {
  exigirEntornoSeguro, Reporte, silenciarHttp,
} = require('./comun');

exigirEntornoSeguro();

const CLAVE_TALLER = 'clave-super-segura-2026';
const SCHEMA_SQL_PATH = path.join(__dirname, '..', '..', 'schema.sql');

/* Crea un contexto de servidor sobre una base de datos en memoria dada */
async function montarServidorSobreBd(db, statsDb) {
  const app = await createApp(new DBAdapter(db, 'local'), new DBAdapter(statsDb, 'local'));
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });
  return {
    server,
    base: `http://127.0.0.1:${server.address().port}`,
    cerrar() {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      server.close();
    },
  };
}

async function main() {
  const restaurar = silenciarHttp();
  const rep = new Reporte('Persistencia e Inmutabilidad de Datos');

  try {
    rep.seccion('1. Preparación de almacenamiento y servidor inicial');
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    seedTestDb(db);

    const statsDb = new Database(':memory:');
    statsDb.pragma('foreign_keys = ON');
    statsDb.exec(`
      CREATE TABLE IF NOT EXISTS visit_days (day TEXT, visitor_hash TEXT, PRIMARY KEY (day, visitor_hash)) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS chat_limits (day TEXT, device_id TEXT, count INTEGER, PRIMARY KEY (day, device_id)) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS missing_searches (day TEXT, q TEXT, count INTEGER DEFAULT 0, PRIMARY KEY (day, q)) WITHOUT ROWID;
    `);

    let srv = await montarServidorSobreBd(db, statsDb);
    let cliA = crearCliente(srv.base);

    rep.seccion('2. Registro de cuenta y creación de jerarquía de datos de negocio');
    const regRes = await cliA.post('/api/auth/register', {
      email: 'taller.persistente@prueba.test',
      password: CLAVE_TALLER,
      name: 'Taller Mecánico Central',
    });
    rep.comprobar(regRes.status === 201, 'Registro de cuenta de taller responde 201', `status=${regRes.status}`);
    const tallerId = regRes.body?.id;
    rep.comprobar(Number.isInteger(tallerId) && tallerId > 0, 'ID del taller persistido correctamente');

    // Crear cliente
    const cRes = await cliA.post('/api/clients', {
      name: 'Carlos Mendoza',
      phone: '+58 412 1234567',
      email: 'carlos@cliente.test',
      address: 'Av. Libertador, Local 4',
      city: 'Caracas',
      notes: 'Cliente preferencial',
    });
    rep.comprobar(cRes.status === 201, 'Creación de cliente responde 201');
    const clienteId = cRes.body?.id;

    // Crear vehículo del cliente
    const vRes = await cliA.post(`/api/clients/${clienteId}/vehicles`, {
      brand: 'Toyota',
      model: 'Corolla GLi',
      year: 2018,
      plate: 'AB123CD',
      vin: '1NXBR32E88Z000001',
      notes: 'Bomba de gasolina probada en banco',
    });
    rep.comprobar(vRes.status === 201, 'Creación de vehículo de cliente responde 201');
    const vehiculoId = vRes.body?.id;

    // Crear item de inventario
    const invRes = await cliA.post('/api/inventory', {
      sku: 'BOMBA-COROLLA-2018',
      name: 'Módulo de Gasolina Corolla 1.8',
      qty: 12,
      min_qty: 3,
      unit_price: 65.50,
      cost_price: 42.00,
      location: 'Estante B-3',
    });
    rep.comprobar(invRes.status === 201, 'Creación de item de inventario responde 201');
    const itemId = invRes.body?.id;

    // Crear orden de trabajo
    const ordRes = await cliA.post('/api/orders', {
      title: 'Diagnóstico de presión de combustible y reemplazo de bomba',
      type: 'reparacion',
      status: 'En proceso',
      client_id: clienteId,
      vehicle_id: vehiculoId,
      descr: 'Presión en riel por debajo de 35 PSI. Reemplazo de pila y filtro tamiz.',
    });
    rep.comprobar(ordRes.status === 201, 'Creación de orden de trabajo responde 201');
    const ordenId = ordRes.body?.id;

    // Crear documento (nota de entrega / presupuesto)
    const docRes = await cliA.post('/api/documents', {
      kind: 'entrega',
      client_id: clienteId,
      order_id: ordenId,
      items: [
        { descr: 'Bomba de gasolina alta presión', qty: 1, unit_price: 65.50, item_id: itemId },
        { descr: 'Servicio de mano de obra y diagnóstico', qty: 1, unit_price: 35.00 },
      ],
    });
    rep.comprobar(docRes.status === 201, 'Creación de documento responde 201');
    const docId = docRes.body?.id;
    const docNum = docRes.body?.number;

    // Crear nota rápida
    const noteRes = await cliA.post('/api/notes', {
      text: 'Verificar presión con manómetro antes de entregar el carro al cliente.',
      vehicle_ref: 'Toyota Corolla 2018',
    });
    rep.comprobar(noteRes.status === 201, 'Creación de nota rápida responde 201');

    // Registrar movimiento de caja
    const cashRes = await cliA.post('/api/cash', {
      concept: 'Anticipo de orden de combustible',
      amount: 100.50,
      type: 'ingreso',
    });
    rep.comprobar(cashRes.status === 201, 'Registro de caja responde 201');

    rep.hito('Jerarquía completa creada con éxito en el primer servidor');

    rep.seccion('3. Simulación de reinicio en frío del servidor (Cold Reboot)');
    // Cerramos el servidor 1 simulando apagado o redeploy
    srv.cerrar();

    // Levantamos un nuevo servidor 2 que monta EXACTAMENTE la misma base de datos
    srv = await montarServidorSobreBd(db, statsDb);
    const cliReinicio = crearCliente(srv.base);

    // Intentamos iniciar sesión con las credenciales originales
    const loginRes = await cliReinicio.post('/api/auth/login', {
      email: 'taller.persistente@prueba.test',
      password: CLAVE_TALLER,
    });
    rep.comprobar(loginRes.status === 200, 'Login tras reinicio responde 200 con credenciales originales');
    rep.comprobar(loginRes.body?.id === tallerId, 'ID de taller tras reinicio coincide exactamente');

    // Verificamos /api/auth/me
    const meRes = await cliReinicio.get('/api/auth/me');
    rep.comprobar(meRes.status === 200, '/api/auth/me activo');
    rep.comprobar(meRes.body?.name === 'Taller Mecánico Central', 'Nombre de taller preservado');
    rep.comprobar(meRes.body?.email === 'taller.persistente@prueba.test', 'Email de taller preservado');

    // Verificamos persistencia de cliente
    const clientsRes = await cliReinicio.get('/api/clients');
    rep.comprobar(clientsRes.body?.length === 1, 'Clientes tras reinicio: 1 registro');
    rep.comprobar(clientsRes.body?.[0]?.name === 'Carlos Mendoza', 'Datos del cliente intactos tras reinicio');
    rep.comprobar(clientsRes.body?.[0]?.phone === '+58 412 1234567', 'Teléfono del cliente intacto tras reinicio');

    // Verificamos persistencia de vehículo
    const vehsRes = await cliReinicio.get(`/api/clients/${clienteId}/vehicles`);
    rep.comprobar(vehsRes.body?.length === 1, 'Vehículos tras reinicio: 1 registro');
    rep.comprobar(vehsRes.body?.[0]?.plate === 'AB123CD', 'Placa del vehículo intacta tras reinicio');
    rep.comprobar(vehsRes.body?.[0]?.model === 'Corolla GLi', 'Modelo de vehículo intacto tras reinicio');

    // Verificamos persistencia de inventario
    const invListRes = await cliReinicio.get('/api/inventory');
    rep.comprobar(invListRes.body?.length === 1, 'Inventario tras reinicio: 1 registro');
    rep.comprobar(invListRes.body?.[0]?.sku === 'BOMBA-COROLLA-2018', 'SKU de inventario intacto');
    /* 2.17: la NOTA DE ENTREGA de arriba lleva una partida con `item_id` y
       qty:1, así que la pieza salió del anaquel al emitirla — igual que una
       partida de orden. El stock correcto al reiniciar es 11 (12 − 1), no 12:
       era el robot el que esperaba mal, no el descuento el que sobra. */
    rep.comprobar(Number(invListRes.body?.[0]?.qty) === 11,
      'Stock intacto tras el reinicio: 11 (12 menos la pieza de la nota de entrega, regla 2.17)');

    // Verificamos persistencia de orden
    const ordersRes = await cliReinicio.get('/api/orders');
    rep.comprobar(ordersRes.body?.length === 1, 'Órdenes tras reinicio: 1 registro');
    rep.comprobar(ordersRes.body?.[0]?.id === ordenId, 'ID de orden intacto tras reinicio');
    rep.comprobar(ordersRes.body?.[0]?.status === 'En proceso', 'Estado de orden intacto tras reinicio');

    // Verificamos persistencia de documento
    const docsRes = await cliReinicio.get(`/api/documents/${docId}`);
    rep.comprobar(docsRes.status === 200, 'Documento consultable tras reinicio');
    rep.comprobar(docsRes.body?.number === docNum, 'Número correlativo de documento intacto');
    rep.comprobar(docsRes.body?.items?.length === 2, 'Partidas del documento intactas tras reinicio');
    rep.comprobar(Number(docsRes.body?.total) === 100.50, 'Total del documento intacto ($100.50)');

    // Verificamos persistencia de notas y caja
    const notesRes = await cliReinicio.get('/api/notes');
    rep.comprobar(notesRes.body?.length === 1 && notesRes.body[0].text.includes('Verificar presión'), 'Notas tras reinicio intactas');

    const cashListRes = await cliReinicio.get('/api/cash');
    rep.comprobar(cashListRes.body?.length === 1 && Number(cashListRes.body[0].amount) === 100.50, 'Movimientos de caja tras reinicio intactos');

    rep.hito('100% de los datos sobrevivieron al reinicio en frío sin alteración');

    rep.seccion('4. Ejecución de migraciones y scripts de esquema (Resiliencia)');
    // Leer y re-ejecutar schema.sql para simular una migración en producción
    const schemaSql = fs.readFileSync(SCHEMA_SQL_PATH, 'utf8');
    db.exec(schemaSql);

    // Comprobar que no se alteró ni una fila
    const wsRow = db.prepare('SELECT id, name, email FROM workshops WHERE id = ?').get(tallerId);
    rep.comprobar(wsRow && wsRow.email === 'taller.persistente@prueba.test', 'Cuenta de taller no fue afectada por re-ejecución de schema.sql');

    const clCount = db.prepare('SELECT COUNT(*) as c FROM clients WHERE workshop_id = ?').get(tallerId);
    rep.comprobar(Number(clCount.c) === 1, 'Clientes no se truncaron en migración');

    const ordCount = db.prepare('SELECT COUNT(*) as c FROM work_orders WHERE workshop_id = ?').get(tallerId);
    rep.comprobar(Number(ordCount.c) === 1, 'Órdenes de trabajo intactas tras migración');

    const invCount = db.prepare('SELECT COUNT(*) as c FROM inventory_items WHERE workshop_id = ?').get(tallerId);
    rep.comprobar(Number(invCount.c) === 1, 'Inventario intacto tras migración');

    rep.hito('Re-ejecución de esquemas validada como estrictamente no destructiva');

    rep.seccion('5. Inviolabilidad y protección de datos entre talleres');
    // Registrar segundo taller B
    const cliB = crearCliente(srv.base);
    await cliB.post('/api/auth/register', {
      email: 'taller.segundo@prueba.test',
      password: CLAVE_TALLER,
      name: 'Taller Mecánico Secundario',
    });

    // Taller B intenta borrar la orden del Taller A
    const delOrdRes = await cliB.del(`/api/orders/${ordenId}`);
    rep.comprobar(delOrdRes.status === 404, 'Taller B no puede borrar la orden de Taller A (responde 404)');

    // Taller B intenta modificar el inventario del Taller A
    const putInvRes = await cliB.put(`/api/inventory/${itemId}`, { name: 'Hackeado', qty: 0, unit_price: 1 });
    rep.comprobar(putInvRes.status === 404, 'Taller B no puede alterar inventario de Taller A (responde 404)');

    // Taller B intenta consultar documento del Taller A
    const getDocRes = await cliB.get(`/api/documents/${docId}`);
    rep.comprobar(getDocRes.status === 404, 'Taller B no puede leer documentos de Taller A (responde 404)');

    // Taller B intenta crear una orden asignando el cliente de Taller A (Cross-tenant IDOR)
    const idorRes = await cliB.post('/api/orders', {
      title: 'Ataque IDOR',
      client_id: clienteId,
      vehicle_id: vehiculoId,
    });
    rep.comprobar(idorRes.status === 400, 'Taller B no puede adueñarse de clientes de Taller A en órdenes (responde 400)');

    // Verificar que datos de Taller A siguen intactos
    const verifA = await cliReinicio.get(`/api/orders/${ordenId}`);
    rep.comprobar(verifA.status === 200 && verifA.body?.title.includes('Diagnóstico de presión'), 'Orden de Taller A permanece intacta e inmutable');

    srv.cerrar();
    db.close();
    statsDb.close();

    rep.hito('Pruebas de inmutabilidad y aislamiento completadas con éxito');
  } finally {
    restaurar();
  }

  return rep.resumen();
}

if (require.main === module) {
  main().then(ok => process.exit(ok ? 0 : 1))
    .catch(e => { console.error('\n💥 El robot de persistencia falló:\n', e); process.exit(1); });
}

module.exports = { main };
