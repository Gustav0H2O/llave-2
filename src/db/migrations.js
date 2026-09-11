'use strict';
/* ============================================================================
   4.3 — Runner de migraciones versionadas.

   Aplica, en orden, las migraciones que todavía no están registradas en la tabla
   `schema_migrations`, y anota cada una. El arranque (y createApp, que es lo que
   montan las pruebas) NO aplica DDL suelto: todo el esquema pasa por aquí.

   Forma de una migración (ver src/db/migrations/):
     · id            — identificador estable y ordenado ('001-…').
     · nombre        — descripción legible, para la tabla de versiones.
     · sentencias(db)— array de sentencias SQL, en orden.
     · tolerarErrores— opcional. Si es true, una sentencia que falle no aborta la
       migración; lo usa la 002, que reproduce el viejo bucle de ALTER que
       ignoraba "ya existe". Las migraciones NUEVAS no deben ponerlo: un error
       real tiene que verse.

   Vive en src/ (no en lib/): habla de bases de datos y lee archivos, así que no
   es una función pura (AGENTS.md §3).
   ========================================================================= */
const { principal: MIGRACIONES_PRINCIPAL, stats: MIGRACIONES_STATS } = require('./migrations/index');

const TABLA_VERSIONES = 'schema_migrations';

/* Un error de "ya existe" no es un fallo real: la migración 001 es idempotente
   (IF NOT EXISTS) y la 002 tolera duplicados. Cualquier otro error SÍ sube. */
const yaExiste = (e) =>
  /already exists|duplicate column|duplicate key|ya existe|columna duplicada/i.test(String((e && e.message) || e || ''));

/* Aplica las migraciones pendientes sobre `db`. Devuelve cuántas aplicó. */
async function migrar(db, migraciones, tabla = TABLA_VERSIONES) {
  await db.exec(`CREATE TABLE IF NOT EXISTS ${tabla} (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  const aplicadas = new Set((await db.all(`SELECT id FROM ${tabla}`)).map((r) => r.id));
  let aplicadasAhora = 0;
  for (const m of migraciones) {
    if (aplicadas.has(m.id)) continue;
    for (const sentencia of m.sentencias(db)) {
      try {
        await db.exec(sentencia);
      } catch (e) {
        if (!m.tolerarErrores && !yaExiste(e)) throw e;
      }
    }
    await db.run(`INSERT INTO ${tabla} (id, name) VALUES (?, ?)`, [m.id, m.nombre]);
    aplicadasAhora++;
  }
  return aplicadasAhora;
}

/* Envolturas con nombre para el esquema principal y el de estadísticas. */
const migrarPrincipal = (db) => migrar(db, MIGRACIONES_PRINCIPAL);
const migrarStats = (statsDb) => migrar(statsDb, MIGRACIONES_STATS);

module.exports = {
  migrar, migrarPrincipal, migrarStats,
  TABLA_VERSIONES, MIGRACIONES_PRINCIPAL, MIGRACIONES_STATS,
};
