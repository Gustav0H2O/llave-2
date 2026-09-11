'use strict';
/* ============================================================================
   src/services/caches.js — Cachés de catálogo COMPARTIDAS por proceso.

   metaCache y pumpsCache son estado MUTABLE: el catálogo público
   (src/routes/catalog.js) los LEE y varias rutas que aún viven en el monolito
   los INVALIDAN (el panel de admin: alta/edición/borrado de vehículos, alta de
   marcas y de pilas, y la importación masiva de vehículos).

   Antes eran dos variables de la clausura de createApp. Al mover el catálogo a
   un módulo, el estado se saca aquí para NO duplicarlo: una sola copia por
   proceso, con la misma semántica de instancia única que tenía el monolito
   (producción monta una sola app por proceso).

   Se expone con getters e invalidadores — no con las variables crudas — para
   que nadie las reasigne por accidente desde otro módulo: el catálogo es el
   único que ESCRIBE (set…) y el resto solo puede invalidar.

   No importa express ni la base: es solo estado, así que también es puro de
   dependencias (no vive en lib/ porque no es una regla del taller, es
   infraestructura del servidor).
   ========================================================================= */

const estado = { meta: null, pumps: null };

const leerMetaCache = () => estado.meta;
const setMetaCache = (valor) => { estado.meta = valor; };

const leerPumpsCache = () => estado.pumps;
const setPumpsCache = (valor) => { estado.pumps = valor; };

/* Invalidador fino: solo la caché de meta (marcas/tipos/rango). */
const invalidarMetaCache = () => { estado.meta = null; };
/* Invalidador fino: solo la caché de pilas. */
const invalidarPumpsCache = () => { estado.pumps = null; };
/* Ambas: es lo que hacía `metaCache = null; pumpsCache = null;`. */
const invalidarCatalogos = () => { estado.meta = null; estado.pumps = null; };

module.exports = {
  leerMetaCache, setMetaCache,
  leerPumpsCache, setPumpsCache,
  invalidarMetaCache, invalidarPumpsCache, invalidarCatalogos,
};
