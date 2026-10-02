'use strict';
/* ==========================================================================
   Migración 012: desglose fiscal de los documentos.

   El documento guardaba un único `total` = suma de qty × precio. Con eso
   el papel no podía decir cuánto fue la base imponible y cuánto el
   impuesto: el cotizador (public/microapps.js) sí calcula subtotal,
   descuento e IVA, pero se perdían al emitir, y el PDF salía con un
   «TOTAL» solo.

   - subtotal   — suma de las partidas, antes de descuento
   - descuento  — el importe que se resta (queda el %, no solo el dinero)
   - iva_pct    — el porcentaje aplicado, para reimprimir igual
   - iva        — el impuesto calculado sobre la base ya descontada
   - moneda     — 'USD' por defecto; se guarda para que reimprimir con
                  otra tasa no reescriba el documento ya emitido

   `total` se conserva y sigue siendo el importe a cobrar (subtotal −
   descuento + IVA), para que todo lo que ya lo leía no cambie: es el
   mismo número, solo que ahora además se sabe de dónde sale.
   ========================================================================== */
module.exports = {
  id: '012-documento-fiscal',
  nombre: 'Desglose fiscal del documento (subtotal, descuento, IVA)',
  sentencias: () => [
    'ALTER TABLE documents ADD COLUMN subtotal REAL NOT NULL DEFAULT 0',
    'ALTER TABLE documents ADD COLUMN descuento REAL NOT NULL DEFAULT 0',
    'ALTER TABLE documents ADD COLUMN iva_pct REAL NOT NULL DEFAULT 0',
    'ALTER TABLE documents ADD COLUMN iva REAL NOT NULL DEFAULT 0',
    "ALTER TABLE documents ADD COLUMN moneda TEXT NOT NULL DEFAULT 'USD'",
  ],
};