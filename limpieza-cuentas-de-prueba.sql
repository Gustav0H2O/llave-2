-- Limpieza de las cuentas de PRUEBA creadas el 2026-10-01 por scripts
-- de verificación en navegador que arrancaron el servidor contra Turso.
--
-- NO EJECUTAR A CIEGAS. Revisa primero:
--   SELECT id, name, email, created_at FROM workshops WHERE id >= 3;
-- Deben ser 26 filas con correos @taller.test y fecha 2026-10-01/02.
-- Si aparece cualquier fila que NO sea de prueba, PARA: el id 3 ya no es el tuyo.
--
-- Los talleres REALES son id=1 (Gustavo Heredia) e id=2 (Otra Gota): no se tocan.

-- Las tablas hijas tienen ON DELETE CASCADE sobre workshop_id, pero se listan
-- explícitamente para que quede constancia de qué se borra y no depender de que
-- cada FK esté declarada.
DELETE FROM inspection_items WHERE workshop_id >= 3;
DELETE FROM inspections      WHERE workshop_id >= 3;
DELETE FROM document_items   WHERE workshop_id >= 3;
DELETE FROM documents        WHERE workshop_id >= 3;
DELETE FROM work_order_items WHERE workshop_id >= 3;
DELETE FROM work_order_photos WHERE workshop_id >= 3;
DELETE FROM work_orders      WHERE workshop_id >= 3;
DELETE FROM inventory_moves  WHERE workshop_id >= 3;
DELETE FROM inventory_items  WHERE workshop_id >= 3;
DELETE FROM client_vehicles  WHERE workshop_id >= 3;
DELETE FROM clients          WHERE workshop_id >= 3;
DELETE FROM appointments     WHERE workshop_id >= 3;
DELETE FROM mechanics        WHERE workshop_id >= 3;
DELETE FROM cash_moves       WHERE workshop_id >= 3;
DELETE FROM cash_closings    WHERE workshop_id >= 3;
DELETE FROM workshop_notes   WHERE workshop_id >= 3;
DELETE FROM sessions         WHERE workshop_id >= 3;
DELETE FROM workshops        WHERE id >= 3;

-- EJECUTADO el 2026-10-02: 129 filas borradas. Quedan los 2 talleres reales.
-- Comprobación posterior: debe devolver 2.
-- SELECT COUNT(*) FROM workshops;
