'use strict';
/* ==========================================================================
   Migración 005: Mejoras administrativas en taller.
   - cost_price en inventory_items para cálculo de rentabilidad.
   - doc_id en clients para identificación de cliente.
   - exchange_rate en documents para trazabilidad monetaria.
   - suppliers para gestión de proveedores y repuesteras.
   ========================================================================== */
module.exports = {
  id: '005-taller-mejoras-admin',
  nombre: 'Mejoras administrativas de taller (cost_price, doc_id, suppliers, exchange_rate)',
  tolerarErrores: true,
  sentencias: () => [
    `ALTER TABLE inventory_items ADD COLUMN cost_price REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE clients ADD COLUMN doc_id TEXT`,
    `ALTER TABLE documents ADD COLUMN exchange_rate REAL DEFAULT 1.0`,
    `CREATE TABLE IF NOT EXISTS suppliers (
       id INTEGER PRIMARY KEY,
       workshop_id INTEGER NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
       name TEXT NOT NULL,
       rif TEXT,
       phone TEXT,
       email TEXT,
       address TEXT,
       specialty TEXT,
       contact_person TEXT,
       notes TEXT,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE INDEX IF NOT EXISTS idx_suppliers_ws ON suppliers(workshop_id)`,
  ],
};
