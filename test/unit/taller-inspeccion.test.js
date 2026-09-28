'use strict';
/* ============================================================================
   test/unit/taller-inspeccion.test.js

   Pruebas unitarias para las mejoras de inspección de recepción, servicios,
   labor técnica (item_type) y datos técnicos de vehículos (vin, mileage).
   ========================================================================= */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { migrarPrincipal } = require('../../src/db/migrations');
const mig006 = require('../../src/db/migrations/006-taller-inspeccion-labor');
const { FUEL_LEVELS, SERVICE_TYPES, ITEM_TYPES } = require('../../src/routes/orders');

describe('Migración 006: Inspección, labor y datos de vehículos', () => {
  it('la migración declara id, nombre, tolerarErrores y sentencias', () => {
    assert.equal(mig006.id, '006-taller-inspeccion-labor');
    assert.ok(typeof mig006.nombre === 'string');
    assert.equal(mig006.tolerarErrores, true);
    assert.ok(Array.isArray(mig006.sentencias()));
    assert.equal(mig006.sentencias().length, 8);
  });

  it('migrarPrincipal aplica la migración 006 en una base limpia', async () => {
    const raw = new Database(':memory:');
    const db = {
      isPg: false,
      exec: async (sql) => raw.exec(sql),
      run: async (sql, params = []) => raw.prepare(sql).run(...params),
      get: async (sql, params = []) => raw.prepare(sql).get(...params),
      all: async (sql, params = []) => raw.prepare(sql).all(...params),
    };

    const aplicadas = await migrarPrincipal(db);
    assert.ok(aplicadas >= 6, 'Debió aplicar al menos 6 migraciones');

    // Verificar que la migración quedó registrada
    const reg = await db.get('SELECT * FROM schema_migrations WHERE id = ?', ['006-taller-inspeccion-labor']);
    assert.ok(reg, 'La migración 006 debe estar en schema_migrations');

    // Verificar columnas en work_orders
    const colsOrders = (await db.all("PRAGMA table_info('work_orders')")).map(c => c.name);
    for (const col of ['odometer', 'fuel_level', 'reception_notes', 'service_type', 'assigned_mechanic']) {
      assert.ok(colsOrders.includes(col), `work_orders debe incluir columna ${col}`);
    }

    // Verificar columna en work_order_items
    const colsItems = (await db.all("PRAGMA table_info('work_order_items')")).map(c => c.name);
    assert.ok(colsItems.includes('item_type'), 'work_order_items debe incluir item_type');

    // Verificar columnas en client_vehicles
    const colsVehs = (await db.all("PRAGMA table_info('client_vehicles')")).map(c => c.name);
    assert.ok(colsVehs.includes('vin'), 'client_vehicles debe incluir vin');
    assert.ok(colsVehs.includes('mileage'), 'client_vehicles debe incluir mileage');

    // Ejecutar de nuevo migrarPrincipal debe ser idempotente y aplicar 0
    const segundaVez = await migrarPrincipal(db);
    assert.equal(segundaVez, 0, 'La segunda ejecución no debe reaplicar migraciones');

    raw.close();
  });
});

describe('Enums de Órdenes y Partidas de Taller', () => {
  it('FUEL_LEVELS contiene los 5 niveles estándar de combustible', () => {
    assert.deepEqual(FUEL_LEVELS, ['vacio', '1/4', '1/2', '3/4', 'lleno']);
  });

  it('SERVICE_TYPES distingue entre correctivo y preventivo', () => {
    assert.deepEqual(SERVICE_TYPES, ['correctivo', 'preventivo']);
  });

  it('ITEM_TYPES clasifica entre part y labor', () => {
    assert.deepEqual(ITEM_TYPES, ['part', 'labor']);
  });
});
