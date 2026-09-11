'use strict';
/* ==========================================================================
   4.3 — Migración 001: el esquema base (catálogo + negocio).

   NO reescribe el esquema a mano: reutiliza el archivo que ya existía, para que
   no haya dos copias que se separen. En SQLite/Turso es schema.sql; en
   PostgreSQL, schema-pg.sql (schema.sql NO vale en PG: usa AUTOINCREMENT).

   Es idempotente (todas las sentencias son CREATE ... IF NOT EXISTS), así que
   aplicarla sobre una base que ya tiene las tablas no cambia nada.
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..', '..');

module.exports = {
  id: '001-esquema-base',
  nombre: 'Esquema base (catálogo + negocio)',
  sentencias: (db) => [
    fs.readFileSync(path.join(RAIZ, db.isPg ? 'schema-pg.sql' : 'schema.sql'), 'utf8'),
  ],
};
