'use strict';
/* ============================================================================
   src/services/rate-limit-store.js — Store de express-rate-limit v8 sobre la
   BASE DE DATOS (matriz 4.x / deuda de escalado horizontal).

   POR QUÉ EXISTE
   Hasta ahora cada limitador usaba el MemoryStore por defecto: el contador de
   golpes vivía en un Map del proceso. Con dos instancias del servidor detrás de
   un balanceador, cada una contaba por su cuenta (el doble de tráfico permitido)
   y un reinicio borraba todos los contadores (una ráfaga podía empezar de cero).
   El objetivo de escalado es que ese estado viva en la base, que sí se comparte
   entre instancias y sobrevive a los reinicios.

   POR QUÉ AQUÍ Y NO EN lib/
   Habla con la base de datos y con las opciones de express: es servidor, no
   regla del taller (AGENTS.md §3). lib/ sigue puro.

   CÓMO SE USA
   El Store recibe el adaptador `db` INYECTADO (el mismo que recibe createApp),
   nunca el singleton del módulo ./db: los tests montan una base en memoria por
   app y jamás deben tocar la base real (AGENTS.md §5).

     const store = new StoreBD(db, 'catalog');
     rateLimit({ windowMs: 60_000, limit: 30, store, standardHeaders: true, legacyHeaders: false });

   Cada limitador construye SU PROPIA instancia (express-rate-limit lo exige:
   la validación `ERR_ERL_STORE_REUSE` prohíbe compartir un Store entre
   limitadores). El aislamiento entre limitadores que da el MemoryStore —una
   copia por limitador— se reproduce aquí con un prefijo por Store: la clave que
   se guarda es `nombre|clave`, así el cupo del catálogo no se mezcla con el del
   login de admin aunque la IP sea la misma.

   ATOMICIDAD
   El incremento es un único UPSERT `INSERT ... ON CONFLICT(clave) DO UPDATE`,
   así que dos peticiones simultáneas de la misma clave no se pisan: lo resuelve
   el motor. El adaptador ya traduce los `?` a `$n` en PostgreSQL, y `excluded.`
   existe en SQLite, Turso y PG.
   ========================================================================= */

/* Tabla creada por la migración versionada 003-estado-escalado (src/db/migrations/).
   No se crea aquí en caliente: el esquema lo aplica el runner de migraciones. */
const TABLA = 'rate_limits';

/* Cada cuántos incrementos se lanzan a limpiar las filas caducadas. Se hace
   "de vez en cuando" (init + cada N incrementos) y NO en cada petición: una
   purga por request convertiría cada golpe de cupo en tres consultas. */
const CADA_PURGA = 500;

class StoreBD {
  /* `db` es el adaptador inyectado; `nombre` da el espacio de nombres de este
     limitador dentro de la tabla compartida (ver cabecera). */
  constructor(db, nombre) {
    if (!db) throw new Error('StoreBD necesita el adaptador db inyectado');
    this.db = db;
    this.nombre = String(nombre || 'default');
    /* Ventana por defecto (60 s) hasta que init() reciba la real del limitador.
       Se asigna por defecto porque init() es async y el primer await no ocurre
       hasta después de fijar el valor, así que queda listo de forma síncrona. */
    this.windowMs = 60_000;
    /* Flag del contrato de express-rate-limit v8: `false` = las claves las ve
       otro proceso (la base), no solo este. Es lo que desactiva las validaciones
       pensadas para almacenes locales. */
    this.localKeys = false;
    /* Prefijo que el contrato usa en la validación de doble conteo; el prefijo
       real se aplica en clave(). */
    this.prefix = this.nombre;
    this._incrementos = 0;
  }

  /* express-rate-limit llama a init() al construir el middleware, ANTES de la
     primera petición. La asignación de windowMs va antes del primer await para
     que quede fijada de forma síncrona (el contrato no espera la promesa). */
  async init(options) {
    if (options && Number.isFinite(options.windowMs)) this.windowMs = options.windowMs;
    await this._purgar();
  }

  /* Clave real en la tabla: espacio de nombres + clave del limitador. */
  clave(key) { return `${this.nombre}|${key}`; }

  /* Incremento ATÓMICO en UN SOLO viaje a la base. Si la fila no existe arranca
     en 1; si existe y AÚN NO ha caducado, suma; si ya caducó, reinicia el conteo
     y la ventana. Devuelve el mismo par que MemoryStore: { totalHits, resetTime }.

     POR QUÉ RETURNING: antes eran dos viajes (el UPSERT y luego un SELECT para
     leer el total). Este limitador se ejecuta en CADA petición a /api, así que
     ese viaje de más se paga siempre — y con la base en la nube se nota en la
     latencia de cada llamada. `RETURNING` existe en SQLite 3.35+, libSQL/Turso y
     PostgreSQL, así que vale en los tres motores. */
  async increment(key) {
    const ahora = Date.now();
    const expira = ahora + this.windowMs;
    const k = this.clave(key);
    const fila = await this.db.get(
      `INSERT INTO ${TABLA} (clave, hits, expira_ms) VALUES (?, 1, ?)
       ON CONFLICT(clave) DO UPDATE SET
         hits = CASE WHEN ${TABLA}.expira_ms <= ? THEN 1 ELSE ${TABLA}.hits + 1 END,
         expira_ms = CASE WHEN ${TABLA}.expira_ms <= ? THEN ? ELSE ${TABLA}.expira_ms END
       RETURNING hits, expira_ms`,
      [k, expira, ahora, ahora, expira]
    );
    this._incrementos++;
    if (this._incrementos % CADA_PURGA === 0) this._purgar().catch(() => {});
    return {
      totalHits: Number(fila?.hits ?? 1),
      resetTime: new Date(Number(fila?.expira_ms ?? expira)),
    };
  }

  /* decrement lo usa express-rate-limit con skipSuccessfulRequests/FailedRequests.
     Ningún limitador del proyecto lo activa hoy, pero el contrato de Store lo
     exige: se implementa para que el Store sea completo. */
  async decrement(key) {
    await this.db.run(
      `UPDATE ${TABLA} SET hits = CASE WHEN hits > 0 THEN hits - 1 ELSE 0 END WHERE clave = ?`,
      [this.clave(key)]
    );
  }

  /* get opcional del contrato: total actual sin incrementar. */
  async get(key) {
    const fila = await this.db.get(`SELECT hits, expira_ms FROM ${TABLA} WHERE clave = ?`, [this.clave(key)]);
    if (!fila || Number(fila.expira_ms) <= Date.now()) return undefined;
    return { totalHits: Number(fila.hits), resetTime: new Date(Number(fila.expira_ms)) };
  }

  /* Borra el contador de una clave (solo de este limitador). */
  async resetKey(key) {
    await this.db.run(`DELETE FROM ${TABLA} WHERE clave = ?`, [this.clave(key)]);
  }

  /* Borra TODOS los contadores de ESTE limitador, no los de los demás: cada
     Store tiene su espacio de nombres en la tabla compartida. */
  async resetAll() {
    await this.db.run(`DELETE FROM ${TABLA} WHERE clave LIKE ?`, [`${this.nombre}|%`]);
  }

  /* Purga perezosa de filas caducadas. Se llama en init() y cada CADA_PURGA
     incrementos, nunca en cada petición. */
  async _purgar() {
    await this.db.run(`DELETE FROM ${TABLA} WHERE expira_ms <= ?`, [Date.now()]);
  }
}

module.exports = { StoreBD, TABLA };
