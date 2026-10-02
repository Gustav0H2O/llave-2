'use strict';
/* ==========================================================================
   Migración 013: tipo de artículo en el inventario.

   `category` es texto libre y sirve para agrupar ("Bombas", "Filtros"), pero
   no dice QUÉ es la cosa: una bomba y una hora de mano de obra se pueden
   meter en la misma estantería y el almacén no las distingue. work_orders y
   document_items ya tenían item_type ('part' | 'labor'); el inventario no,
   así que un taller no puede tener su propio catálogo de servicios con
   existencias.

   - item_tipo: 'repuesto' | 'servicio' | 'consumible' (NULL = no informado,
     que es como están todas las filas ya escritas: no se inventa la
     clasificación de un artículo que el taller nunca dijo qué era).
   ========================================================================== */
module.exports = {
  id: '013-inventario-tipo',
  nombre: 'Tipo de artículo en el inventario (repuesto, servicio, consumible)',
  sentencias: () => [
    'ALTER TABLE inventory_items ADD COLUMN item_tipo TEXT',
  ],
};