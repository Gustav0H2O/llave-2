'use strict';
/* ============================================================================
   seed.js — siembra la base con el catálogo.

   Este archivo solo ORQUESTA: los datos viven en lib/catalog.js y las reglas
   del taller en lib/domain.js. Si vas a cambiar una presión, una pila o una
   regla, hazlo allí — aquí no hay reglas que tocar.

   Uso:
     npm run seed              → siembra solo si la base está vacía
     FORCE_SEED=1 npm run seed → borra y reconstruye el catálogo
   ========================================================================= */
const fs = require('fs');
const path = require('path');
const { db, statsDb, USE_TURSO, USE_PG } = require('./db');
const { ZONE_LOC, ZONE_ACCESS, PUMPS, V } = require('./lib/catalog');
const {
  bodyType, moduleProfile, railPressure, pumpClass,
  baseFlow, moduleRegulatedPsi, moduleCode, vehicleNote, pumpsForClass,
} = require('./lib/domain');

async function runSeed() {
  if (!process.env.FORCE_SEED) {
    try {
      const row = await db.get('SELECT COUNT(*) c FROM vehicles');
      const n = row ? Number(row.c) : 0;
      if (n > 0) {
        console.log(`seed: la base ya tiene ${n} vehículos — omitido (usa FORCE_SEED=1 para reconstruir).`);
        process.exit(0);
      }
    } catch (e) {
      /* base inexistente/corrupta o sin tablas: reconstruimos abajo */
    }
  }

  console.log(`🌱 Sembrando base de datos en modo: ${USE_TURSO ? 'Turso (libSQL)' : USE_PG ? 'PostgreSQL' : 'SQLite'}`);

  if (process.env.FORCE_SEED) {
    try {
      if (USE_PG) {
        await db.exec(`
          DROP TABLE IF EXISTS module_pumps CASCADE;
          DROP TABLE IF EXISTS vehicle_modules CASCADE;
          DROP TABLE IF EXISTS fuel_pumps CASCADE;
          DROP TABLE IF EXISTS fuel_modules CASCADE;
          DROP TABLE IF EXISTS vehicle_comments CASCADE;
          DROP TABLE IF EXISTS vehicles CASCADE;
          DROP TABLE IF EXISTS brands CASCADE;
          DROP TABLE IF EXISTS injection_types CASCADE;
        `);
      } else {
        await db.exec(`
          PRAGMA foreign_keys = OFF;
          DROP TABLE IF EXISTS module_pumps;
          DROP TABLE IF EXISTS vehicle_modules;
          DROP TABLE IF EXISTS fuel_pumps;
          DROP TABLE IF EXISTS fuel_modules;
          DROP TABLE IF EXISTS vehicle_comments;
          DROP TABLE IF EXISTS vehicles;
          DROP TABLE IF EXISTS brands;
          DROP TABLE IF EXISTS injection_types;
          PRAGMA foreign_keys = ON;
        `);
      }
    } catch (e) {
      console.warn("Aviso al borrar tablas:", e.message);
    }
  }

  const schemaFile = USE_PG ? 'schema-pg.sql' : 'schema.sql';
  await db.exec(fs.readFileSync(path.join(__dirname, schemaFile), 'utf8'));

/* ---------- Inserción ---------- */
  await db.exec('BEGIN');
  try {
    const injIds = {};
    const injSql = `INSERT INTO injection_types (code, name, description) VALUES (?, ?, ?)`;
    injIds.MFI = await db.insertReturningId(injSql, ['MFI', 'Full Injection (Multipunto)', 'Un inyector por cilindro sobre el riel/flauta. Presión media-alta regulada.']);
    injIds.TBI = await db.insertReturningId(injSql, ['TBI', 'TBI (Throttle Body Injection)', 'Inyección monopunto en el cuerpo de aceleración. Presión baja (9–13 PSI).']);
    injIds.VORTEC_CSFI = await db.insertReturningId(injSql, ['VORTEC_CSFI', 'Vortec (CSFI/SCPI)', 'Inyección central secuencial con poppets. Muy sensible a presión: bajo 60 PSI no abre los poppets.']);
    injIds.GDI = await db.insertReturningId(injSql, ['GDI', 'GDI (Inyección Directa)', 'Bomba de baja en tanque + bomba de alta mecánica en motor. La pila del tanque trabaja a 50–90 PSI.']);

    const pumpIds = {};
    const pumpSql = `INSERT INTO fuel_pumps
      (code, manufacturer, pump_style, max_psi_direct, amperage_a, voltage_v, flow_lph_free, inlet_desc, outlet_desc, polarity_desc, diagram_key)
      VALUES (?, ?, ?, ?, ?, 12, ?, ?, ?, ?, ?)`;
    for (const p of PUMPS) pumpIds[p[0]] = await db.insertReturningId(pumpSql, p);

    const brandIds = {};
    const brandSql = `INSERT INTO brands (name) VALUES (?)`;
    const vehSql = `INSERT INTO vehicles
      (brand_id, model, year_from, year_to, engine, body_type, injection_type_id, rail_pressure_psi_min, rail_pressure_psi_max, notes, data_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const modSql = `INSERT INTO fuel_modules
      (code, name, assembly_type, regulated_psi, flow_lph, regulator_type, float_type, strainer_ref, connector_desc, lines_desc, mount_desc, diagram_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const vmSql = `INSERT INTO vehicle_modules
      (vehicle_id, module_id, location_text, location_zone, requires_tank_removal, access_notes)
      VALUES (?, ?, ?, ?, ?, ?)`;
    const mpSql = `INSERT INTO module_pumps (module_id, pump_id, fitment, is_oem, notes) VALUES (?, ?, ?, ?, ?)`;

    let seq = 0;
    for (const [brand, model, y1, y2, engine, inj, psiMinRaw, psiMaxRaw, zone, ret, locOverride, note, verified] of V) {
      seq++;
      if (!brandIds[brand]) brandIds[brand] = await db.insertReturningId(brandSql, [brand]);

      // Regla de taller — PSI en riel. Ver lib/domain.js: railPressure().
      const { min: psiMin, max: psiMax } = railPressure({ brand, model, inj, psiMin: psiMinRaw, psiMax: psiMaxRaw });

      const isVerified = verified === undefined ? 1 : verified;
      const fullNote = vehicleNote({ verified, note });
      const vehId = await db.insertReturningId(vehSql, [brandIds[brand], model, y1, y2, engine, bodyType(model), injIds[inj], psiMin, psiMax, fullNote, isVerified]);

      // Clase de pila según el sistema de inyección (banco de pruebas, pila sola sin regulador)
      const cls = pumpClass({ brand, model, inj });

      const isV8 = /V8/.test(engine);
      const disp = parseFloat((engine.match(/(\d+\.\d+)L/) || [])[1] || 2.0);
      const prof = moduleProfile({ brand, model, y1, y2, inj, ret, zone, isV8, disp, psiMax });

      const modId = await db.insertReturningId(modSql, [
        moduleCode(brand, seq),
        `${prof.namePrefix} ${brand} ${model} ${y1}–${y2}`,
        prof.assembly,
        moduleRegulatedPsi({ inj, engine, psiMax }),
        prof.flow(baseFlow(engine)),
        prof.regulator,
        prof.floatType,
        prof.strainer,
        prof.connector,
        prof.lines,
        prof.mount,
        prof.diagram
      ]);

      await db.run(vmSql, [vehId, modId, locOverride || ZONE_LOC[zone], zone, zone === 'tank_drop' ? 1 : 0, ZONE_ACCESS[zone]]);

      for (const [pumpCode, isOem, pnote] of pumpsForClass(cls)) {
        await db.run(mpSql, [modId, pumpIds[pumpCode], isOem ? 'directa' : 'con adaptación', isOem, pnote]);
      }
    }
    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    console.error("Error sembrando datos:", e);
    process.exit(1);
  }

  console.log('Base de datos creada y sembrada con éxito:');
  for (const t of ['injection_types', 'brands', 'vehicles', 'fuel_modules', 'fuel_pumps', 'vehicle_modules', 'module_pumps']) {
    const r = await db.get(`SELECT COUNT(*) c FROM ${t}`);
    console.log(`  ${t}: ${r ? r.c : 0} filas`);
  }

  // Inicializar statsDb para que las tablas de métricas existan al arrancar
  await statsDb.exec(`
    CREATE TABLE IF NOT EXISTS visit_days (
      day          TEXT NOT NULL,
      visitor_hash TEXT NOT NULL,
      PRIMARY KEY (day, visitor_hash)
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chat_limits (
      day TEXT NOT NULL,
      device_id TEXT NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY (day, device_id)
    );
    CREATE TABLE IF NOT EXISTS missing_searches (
      day TEXT NOT NULL,
      q TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, q)
    );
  `);
  console.log('Tablas de stats inicializadas.');
  process.exit(0);
}

/* El .catch no es adorno: sin él, un fallo al sembrar (base inalcanzable,
   esquema roto) sale como "unhandled rejection" con un volcado ilegible y
   código de salida 1 sin explicación. Con él, el mensaje es claro. */
runSeed().catch((e) => {
  console.error('❌ La siembra falló:', e?.message || e);
  process.exit(1);
});
