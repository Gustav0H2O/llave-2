'use strict';
/* ==========================================================================
   Migración 015: registro persistente de códigos de Google ya canjeados.

   El callback de Google puede entregarse MÁS DE UNA VEZ —en el móvil, el
   gesto «atrás», una recarga o la repetición de la navegación lo provocan— y
   un código de Google es de UN SOLO USO: la segunda entrega recibía
   invalid_grant y el usuario se quedaba fuera con «No se pudo entrar con
   Google».

   La primera solución fue un Map EN MEMORIA del proceso. No servía: Render
   (plan free) apaga el servicio tras unos minutos sin tráfico y lo vuelve a
   levantar, así que entre una entrega y la otra el proceso ya es otro y el
   Map está vacío. El invalid_grant volvía a aparecer justo en el móvil, que
   es donde más se repite la entrega.

   Con esta tabla el registro sobrevive al reinicio: guarda el hash del código
   (nunca el código), el hash de la sesión que emitió, el state con el que se
   canjeó y la hora. Se cadenan a los 30 minutos.

   Por qué es seguro reutilizar la sesión: solo se reutiliza si el state que
   llega es VÁLIDO (el HMAC lo firma el servidor, así que hay CSRF real) y
   coincide con el del canjeo anterior, y si esa sesión sigue viva. Es decir,
   es la MISMA entrega del MISMO inicio de sesión, no un intento distinto: el
   resultado es el mismo taller con la misma sesión, solo que sin volver a
   canjear un código gastado.
   ========================================================================== */
module.exports = {
  id: '015-oauth-codigos-canjeados',
  nombre: 'Códigos de Google ya canjeados (callback idempotente)',
  sentencias: () => [
    /* Sin estado ni 'status': es un registro de paso, no una entidad de negocio.
       El borrado lo hace la purga por antigüedad (created_at). */
    'CREATE TABLE IF NOT EXISTS oauth_codigos (code_hash TEXT PRIMARY KEY, token_hash TEXT NOT NULL, state TEXT NOT NULL, created_at DATETIME NOT NULL)',
    /* La purga borra por antigüedad, así que hace falta índice: sin él, cada
       pasada del limpiador hace un recorrido completo de la tabla. */
    'CREATE INDEX IF NOT EXISTS idx_oauth_codigos_created ON oauth_codigos (created_at)',
  ],
};