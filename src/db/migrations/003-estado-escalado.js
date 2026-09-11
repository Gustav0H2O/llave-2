'use strict';
/* ==========================================================================
   4.3 / deuda de escalado — Migración 003: estado compartido entre instancias.

   Dos tablas que antes vivían en la memoria del proceso y rompían el escalado
   horizontal (cada instancia contaba por su cuenta) y la persistencia entre
   reinicios (un reinicio borraba el estado):

     · rate_limits    — contadores de express-rate-limit (StoreBD). Una fila por
                        clave con su ventana: `clave TEXT PRIMARY KEY`, `hits`
                        y `expira_ms`. El `clave` incluye el nombre del limitador
                        (`nombre|ip`) para que dos cupos distintos no se mezclen.
     · login_attempts — lockout del login por `email|IP`: intentos fallidos,
                        hasta cuándo está bloqueada la clave y cuándo se tocó por
                        última vez (para caducar el conteo igual que el Map).

   Es idempotente (CREATE ... IF NOT EXISTS). El esquema NO se crea en el arranque
   de server-pg.js: pasa por el runner de migraciones versionadas, que anota esta
   versión en `schema_migrations` para no volver a aplicarla.

   Los índices sobre las columnas de caducidad existen porque la purga —y la
   comprobación del lockout— filtran por ellas en cada pasada.
   ========================================================================== */
module.exports = {
  id: '003-estado-escalado',
  nombre: 'Estado compartido para escalado: rate limits y lockout de login',
  sentencias: () => [
    `CREATE TABLE IF NOT EXISTS rate_limits (
       clave TEXT PRIMARY KEY,
       hits INTEGER NOT NULL,
       expira_ms INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_rate_limits_expira ON rate_limits(expira_ms)`,
    `CREATE TABLE IF NOT EXISTS login_attempts (
       clave TEXT PRIMARY KEY,
       intentos INTEGER NOT NULL DEFAULT 0,
       bloqueado_hasta_ms INTEGER NOT NULL DEFAULT 0,
       actualizado_ms INTEGER NOT NULL DEFAULT 0)`,
    `CREATE INDEX IF NOT EXISTS idx_login_attempts_actualizado ON login_attempts(actualizado_ms)`,
  ],
};
