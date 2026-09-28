'use strict';
/* ==========================================================================
   Migración 004: Columna method en cash_moves para métodos de pago.
   Soporta: efectivo_usd, efectivo_bs, pago_movil, zelle.
   ========================================================================== */
module.exports = {
  id: '004-cash-method',
  nombre: 'Columna method en cash_moves para registro de pagos',
  sentencias: () => [
    `ALTER TABLE cash_moves ADD COLUMN method TEXT DEFAULT 'efectivo_usd'`,
  ],
};
