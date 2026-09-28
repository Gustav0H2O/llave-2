'use strict';
/* ==========================================================================
   Migración 007: Operación diaria del taller — agenda, personal, inspecciones
   de entrada/salida, cortes de caja y alertas de stock.

   - mechanics: personal del taller; work_orders.mechanic_id deja de ser solo
     texto libre (assigned_mechanic se conserva como etiqueta imprimible).
   - appointments: la agenda de citas deja de vivir en localStorage.
   - inspections + inspection_items: checklist multipunto ligado a la orden,
     con entrada y salida; la salida completa es la puerta de entrega.
   - cash_closings: corte/arqueo de caja con totales por método de pago.
   - inventory_items.low_stock_alerted: la alerta de stock bajo se emite UNA vez
     por episodio y se rearma al reponer (regla de notificación única).
   - inventory_moves.supplier_id: toda entrada de compra queda ligada a su
     proveedor de la cartera.
   - documents.client_snapshot / vehicle_snapshot: el documento conserva los
     datos del cliente y del vehículo del momento en que se emitió.

   El `id` se declara según el dialecto: `SERIAL` no existe en SQLite e
   `INTEGER PRIMARY KEY` no autoincrementa en PostgreSQL.
   ========================================================================== */
module.exports = {
  id: '007-taller-agenda-operacion',
  nombre: 'Agenda de citas, mecánicos, inspecciones entrada/salida, cortes de caja y alertas de stock',
  sentencias: (db) => {
    const pg = !!(db && db.isPg);
    const idCol = pg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY';
    return [
      `CREATE TABLE IF NOT EXISTS mechanics (
         id ${idCol},
         workshop_id INTEGER NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
         name TEXT NOT NULL,
         phone TEXT,
         role TEXT NOT NULL DEFAULT 'mecanico',
         active INTEGER NOT NULL DEFAULT 1,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,
      `CREATE INDEX IF NOT EXISTS idx_mech_ws ON mechanics(workshop_id)`,
      `ALTER TABLE work_orders ADD COLUMN mechanic_id INTEGER REFERENCES mechanics(id) ON DELETE SET NULL`,
      `ALTER TABLE inventory_items ADD COLUMN low_stock_alerted INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE inventory_moves ADD COLUMN supplier_id INTEGER`,
      `ALTER TABLE documents ADD COLUMN client_snapshot TEXT`,
      `ALTER TABLE documents ADD COLUMN vehicle_snapshot TEXT`,
      `CREATE TABLE IF NOT EXISTS appointments (
         id ${idCol},
         workshop_id INTEGER NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
         client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
         vehicle_id INTEGER REFERENCES client_vehicles(id) ON DELETE SET NULL,
         fecha TEXT NOT NULL,
         hora TEXT,
         client_name TEXT,
         vehicle_ref TEXT,
         servicio TEXT,
         status TEXT NOT NULL DEFAULT 'pendiente',
         notes TEXT,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,
      `CREATE INDEX IF NOT EXISTS idx_appt_ws ON appointments(workshop_id, fecha)`,
      `CREATE TABLE IF NOT EXISTS inspections (
         id ${idCol},
         workshop_id INTEGER NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
         order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
         tipo TEXT NOT NULL,
         status TEXT NOT NULL DEFAULT 'incompleta',
         notes TEXT,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         completed_at TIMESTAMP
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_insp_unq ON inspections(workshop_id, order_id, tipo)`,
      `CREATE TABLE IF NOT EXISTS inspection_items (
         id ${idCol},
         workshop_id INTEGER NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
         inspection_id INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
         seccion TEXT NOT NULL,
         punto TEXT NOT NULL,
         estado TEXT NOT NULL DEFAULT 'pendiente',
         notes TEXT,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,
      `CREATE INDEX IF NOT EXISTS idx_insp_items ON inspection_items(inspection_id)`,
      `CREATE TABLE IF NOT EXISTS cash_closings (
         id ${idCol},
         workshop_id INTEGER NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
         fecha TEXT NOT NULL,
         ingresos REAL NOT NULL DEFAULT 0,
         egresos REAL NOT NULL DEFAULT 0,
         saldo REAL NOT NULL DEFAULT 0,
         por_metodo TEXT,
         movimientos INTEGER NOT NULL DEFAULT 0,
         conteo REAL,
         diferencia REAL,
         notes TEXT,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,
      `CREATE INDEX IF NOT EXISTS idx_cash_close_ws ON cash_closings(workshop_id, fecha)`,
    ];
  },
};
