'use strict';
/* ==========================================================================
   4.3 — Migración de la base de ESTADÍSTICAS (stats.db).

   Vive aparte porque es OTRA base (AGENTS.md §4.9: el seed borra el catálogo y
   las estadísticas no pueden perder el contador de visitas por eso). Contiene
   las tablas del contador, la meta y los límites del chat.
   ========================================================================== */
module.exports = {
  id: 'stats-001-esquema',
  nombre: 'Esquema de la base de estadísticas',
  sentencias: () => [
    `CREATE TABLE IF NOT EXISTS visit_days (
       day          TEXT NOT NULL,
       visitor_hash TEXT NOT NULL,
       PRIMARY KEY (day, visitor_hash)
     )`,
    `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS chat_limits (
       day TEXT NOT NULL,
       device_id TEXT NOT NULL,
       count INTEGER NOT NULL,
       PRIMARY KEY (day, device_id)
     )`,
    `CREATE TABLE IF NOT EXISTS missing_searches (
       day TEXT NOT NULL,
       q TEXT NOT NULL,
       count INTEGER NOT NULL DEFAULT 0,
       PRIMARY KEY (day, q)
     )`,
  ],
};
