'use strict';
/* ==========================================================================
   Migración 006: Inspección de recepción, servicios y labor técnica en taller.
   Inspirado en mejores prácticas de gestión automotriz:
   - work_orders: odómetro de entrada, nivel de combustible, notas de recepción,
     tipo de servicio (correctivo/preventivo) y mecánico asignado.
   - work_order_items: item_type ('part' repuestos con stock, 'labor' mano de obra sin stock).
   - client_vehicles: vin (número de chasis) y mileage (último kilometraje).
   ========================================================================== */
module.exports = {
  id: '006-taller-inspeccion-labor',
  nombre: 'Inspección de recepción, servicios y labor (odometer, fuel_level, reception_notes, service_type, assigned_mechanic, item_type, vin, mileage)',
  tolerarErrores: true,
  sentencias: () => [
    `ALTER TABLE work_orders ADD COLUMN odometer INTEGER`,
    `ALTER TABLE work_orders ADD COLUMN fuel_level TEXT`,
    `ALTER TABLE work_orders ADD COLUMN reception_notes TEXT`,
    `ALTER TABLE work_orders ADD COLUMN service_type TEXT`,
    `ALTER TABLE work_orders ADD COLUMN assigned_mechanic TEXT`,
    `ALTER TABLE work_order_items ADD COLUMN item_type TEXT NOT NULL DEFAULT 'part'`,
    `ALTER TABLE client_vehicles ADD COLUMN vin TEXT`,
    `ALTER TABLE client_vehicles ADD COLUMN mileage INTEGER`,
  ],
};
