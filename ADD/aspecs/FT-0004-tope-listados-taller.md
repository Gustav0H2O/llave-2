# A.SPEC FT-0004 â€” Topes consistentes en listados de taller (clientes e inventario)

## WHY

Robot carga (2 fallos): `GET /api/inventory` y `GET /api/clients` devuelven TODO
(800 filas en la prueba) sin LIMIT, mientras Ã³rdenes/caja topean en 500 y notas en
200. Un taller grande degrada linealmente el payload y la memoria.

## WHAT

Ambos listados llevan tope explÃ­cito de 500 filas â€”el mismo criterio de Ã³rdenes y
cajaâ€”, documentado en el SQL.

## SCOPE

- `server-pg.js`: `LIMIT 500` en los dos SELECT.
- Export CSV de inventario queda SIN tope (es descarga deliberada, no listing).

## OUT OF SCOPE

- PaginaciÃ³n cursor-based, UI de "cargar mÃ¡s".
- Cambiar topes existentes de notas/Ã³rdenes/caja.

## CONTRACT

Post: con >500 filas, la respuesta JSON mide exactamente 500 elementos; con menos,
igual que hoy.

## INVARIANTS

```yaml
invariants:
  - "filtro workshop_id en ambos SELECT (aislamiento)"
  - "Cache-Control: no-store"
  - "latencia /api dentro de presupuestos"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
  - npm run robots:rapido
```

## ROLLBACK

git revert (una palabra por query).

## Change Surface

```yaml
change_surface:
  allowed: [server-pg.js]
  prohibited: [public/, lib/, budgets.json]
```

## Blast Radius

```yaml
blast_radius:
  direct: [/api/inventory, /api/clients]
  indirect: [micro-apps Inventario y Clientes]
  must_not_affect: [/api/inventory/export, Ã³rdenes]
```

## Traceability

- Requirement: AuditorÃ­a P1 + ROBOTS.md carga
- Commit: add/FT-0004-tope-listados-taller
- Deployment: sin cambios

## Definition of Done

- [x] Objective satisfied Â· [x] Invariants preserved Â· [ ] Verification passed

