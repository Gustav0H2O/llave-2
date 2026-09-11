'use strict';
/* ==========================================================================
   4.3 — Migración 002: columnas y tablas de negocio añadidas DESPUÉS del esquema
   base, sobre bases que ya estaban creadas (upgrade sin pérdida de datos).

   Es, byte a byte, el bloque de ALTER TABLE / CREATE TABLE / CREATE INDEX que
   antes vivía en línea dentro de createApp(). Conserva su MISMA tolerancia: cada
   sentencia se intenta y, si la columna o la tabla ya existen, se ignora. Por
   eso declara `tolerarErrores: true`, que reproduce el `try/catch` del bucle
   anterior.

   Un cambio de esquema NUEVO no debe reutilizar esta bandera: va en su propia
   migración numerada, sin tolerancia, para que un error de verdad no se pierda.
   ========================================================================== */
module.exports = {
  id: '002-columnas-negocio',
  nombre: 'Columnas y tablas de negocio posteriores al esquema base',
  tolerarErrores: true,
  sentencias: () => [
    `ALTER TABLE workshops ADD COLUMN phone TEXT`,
    `ALTER TABLE workshops ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE workshops ADD COLUMN verify_token_hash TEXT`,
    `ALTER TABLE workshops ADD COLUMN verify_expires_at TEXT`,
    `ALTER TABLE workshops ADD COLUMN slug TEXT`,
    `ALTER TABLE workshops ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE workshops ADD COLUMN bio TEXT`,
    `ALTER TABLE workshops ADD COLUMN city TEXT`,
    `ALTER TABLE workshops ADD COLUMN services TEXT`,
    `ALTER TABLE workshops ADD COLUMN owner_name TEXT`,
    `ALTER TABLE workshops ADD COLUMN doc_id TEXT`,
    `ALTER TABLE workshops ADD COLUMN address TEXT`,
    `ALTER TABLE workshops ADD COLUMN business_type TEXT`,
    `ALTER TABLE workshops ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0`,
    /* Estado de cuenta y bloqueo temporal (regla 3.3). DEFAULT 'active' para
       que las filas preexistentes cuenten como activas sin migración adicional. */
    `ALTER TABLE workshops ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`,
    `ALTER TABLE workshops ADD COLUMN locked_until TEXT`,
    /* Huella de seguridad (regla 7): última IP y fecha de login exitoso, para
       auditoría. NO guarda contraseñas, tokens ni datos sensibles. */
    `ALTER TABLE workshops ADD COLUMN last_login_at TEXT`,
    `ALTER TABLE workshops ADD COLUMN last_login_ip TEXT`,
    `ALTER TABLE workshops ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_slug ON workshops(slug)`,
    `CREATE TABLE IF NOT EXISTS workshop_reviews (
       id INTEGER PRIMARY KEY, workshop_id INTEGER NOT NULL,
       author TEXT NOT NULL, rating INTEGER NOT NULL, comment TEXT,
       author_hash TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       UNIQUE (workshop_id, author_hash))`,
    `ALTER TABLE workshops ADD COLUMN donor_level INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE workshops ADD COLUMN total_donated REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE workshops ADD COLUMN avatar_url TEXT`,
    `CREATE TABLE IF NOT EXISTS donations (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       workshop_id INTEGER REFERENCES workshops(id) ON DELETE SET NULL,
       donor_name TEXT, email TEXT, method TEXT NOT NULL, reference TEXT NOT NULL,
       amount REAL NOT NULL, note TEXT, proof_data TEXT, status TEXT NOT NULL DEFAULT 'pending',
       approve_token TEXT UNIQUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       reviewed_at DATETIME, reviewed_by TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_donations_ws ON donations(workshop_id)`,
    `CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status)`,
    `CREATE TABLE IF NOT EXISTS workshop_notifications (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       workshop_id INTEGER NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
       title TEXT NOT NULL, message TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'info',
       is_read INTEGER NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE INDEX IF NOT EXISTS idx_wn_ws ON workshop_notifications(workshop_id)`,
  ],
};
