# A.SPEC FT-0015 — Extraer órdenes, documentos, conexión, notificaciones, talleres públicos y donaciones de `server-pg.js`

## WHY

`server-pg.js` sigue siendo el monolito de la API. La oleada anterior (matriz
4.8 / AR-F4) sacó inventario, clientes, diagnóstico, notas y caja a
`src/routes/`, y el patrón funcionó: `scripts/rutas.js`, `test/helpers.js`,
`scripts/metrics.js` y `scripts/guard.js` leen `server-pg.js` **y** todo
`src/`, así que una ruta movida sigue entrando en el contrato, en la prueba de
seguridad y en el informe.

Quedan dentro seis dominios completos (~730 líneas) que no son ni admin, ni
auth/oauth, ni catálogo, ni SSR, ni *catch-alls*: órdenes de trabajo,
documentos, conexión cliente ↔ mecánico, notificaciones del taller, perfil
público/reseñas de talleres y donaciones. Mientras vivan ahí, cualquier cambio
en ellos vuelve a tocar el archivo más grande del servidor.

## WHAT

Seis módulos nuevos en `src/routes/`, cada uno con
`module.exports = { montar<Dominio> }` (más los enums que se comparten), y en
`server-pg.js` el bloque correspondiente se sustituye por la llamada
`montar<Dominio>(app, { ... })` **en la misma posición**, porque Express
resuelve por orden de registro:

| Módulo | Rutas | Exporta además |
| --- | --- | --- |
| `orders.js` | `/api/orders`, `/api/orders/:id`, `/api/orders/:id/items`, `/api/orders/:id/items/:iid`, `/api/orders/:id/photos`, `/api/orders/:id/photos/:pid`, `/api/orders/:id/status` | `ORDER_TYPES`, `ORDER_STATUS` |
| `documents.js` | `/api/documents`, `/api/documents/export`, `/api/documents/:id`, `/api/documents/:id/status`, `/api/documents/:id/print` | `DOC_KINDS`, `DOC_STATUS` |
| `connect.js` | `/api/connect/profiles`, `/api/connect/match`, `/api/connect/locate` | — |
| `notifications.js` | `/api/workshop/notifications`, `/api/workshop/notifications/:id/read`, `/api/workshop/notifications/read-all`, `/api/workshop/donations` | — |
| `workshops.js` | `/api/workshops/:slug`, `/api/workshops/:slug/reviews`, `/api/workshops` | — |
| `donations.js` | `/api/donations`, `/api/donations/public` | — |

Los enums se exportan porque el respaldo del taller
(`POST /api/backup/import`) **se queda** en `server-pg.js` y los usa como listas
blancas de las columnas `type`/`status` de `work_orders` y `kind`/`status` de
`documents`. Duplicarlos sería tener dos verdades sobre qué estados acepta el
import.

`recalcularTotalOrden`, `nextDocNumber`, `docConFechas`, `haversineKm`,
`CONNECT_ROLES`, `CONNECT_PUBLICO` y `resumenReseñas` viajan con su dominio
(solo lo usaba él). `visitSalt`, `db`, `requireWorkshop`, `idDe`, `str`, `num`,
`toInt`, `enRango`, `TOPE_*`, `errorAccionable`, `enTransaccion`, `esc`,
`csvEscape`, `fechaISO`, `esDataUrlImagenPermitida`, `normEmail`, `BASE_URL`,
`PROD`, `enviarAvisoDonacion` y `notificarTaller` entran por `deps`. Los
limitadores (`connectLimiter`, `connectMatchLimiter`, `reviewLimiter`,
`donationLimiter`) se crean dentro de su módulo con las **mismas opciones y los
mismos topes**.

## SCOPE

- `src/routes/orders.js`, `documents.js`, `connect.js`, `notifications.js`,
  `workshops.js`, `donations.js` (nuevos), `src/routes/README.md`.
- `server-pg.js`: `require` de los seis módulos + los cuatro enums; seis
  bloques sustituidos por la llamada `montar<Dominio>` en su sitio.

## OUT OF SCOPE

- `admin`, `auth`, `oauth`, catálogo, SSR y los *catch-alls*: siguen en
  `server-pg.js` (fuera del alcance de 4.8).
- El bloque `backup` (`/api/backup`, `/api/backup/import`) no se mueve en esta
  oleada: solo cambia de dónde salen sus enums.
- `test/contract/rutas.json` no se regenera: el contrato (método + ruta + auth)
  no cambia y el snapshot solo guarda esos tres campos.
- Nada del frontend.

## CONTRACT

- Pre: los 103 pares `método + ruta` de la API y su exigencia de auth son los
  mismos que declara `test/contract/rutas.json`.
- Post: cada handler se comporta igual (mismo `return`, mismos `status`, mismos
  campos, mismas cabeceras `Cache-Control`); el único cambio textual es que el
  cuerpo del handler vive en `src/routes/<dominio>.js`.
- Post: el orden de registro de las rutas es el de antes (`notifications`
  → `workshops` → … → `orders` → `documents` → `connect` → `diagnostics`
  → `backup` → `notes` → `cash` → `donations` → 404 de `/api`).
- Post: `npm run metrics` mide `max_lineas_archivo` por debajo del valor
  anterior (el monolito baja de 3 349 a 2 654 líneas).

## INVARIANTS

```yaml
invariants:
  - "las 103 rutas /api siguen existiendo con el mismo método, la misma ruta y la misma exigencia de requireWorkshop/requireAdmin"
  - "los 4 helpers de la API no cambian: GET /api/orders no recalcula el total (leer no escribe), nextDocNumber sigue sacando el consecutivo del MAX y no de COUNT(*)+1, el respaldo sigue leyendo ORDER_TYPES/DOC_KINDS de una sola copia, el hash de autor de reseña sigue saliendo de visitSalt"
  - "los limitadores conservan sus ventanas y topes exactos (connect 10/min, match 20/min — 5000 en test, reseña 10/h, donación 3/h — 5000 en test)"
  - "lib/ sigue puro y sin process.env (npm run guard)"
  - "la cobertura de lib/ no baja de 100 %"
  - "server-pg.js no gana ninguna ruta /api nueva (el monolito sigue congelado)"
```

## VERIFICATION

- `npm run guard:rapido`
- `npm run guard`
- `node --test test/contract/contrato.test.js`
- `npm test`
- `npm run metrics`
- `npm run verify`

## ROLLBACK

`git revert` del commit: los seis módulos desaparecen y cada bloque vuelve a su
sitio en `server-pg.js` (los cuerpos son idénticos, byte a byte). No hay
migración, ni cambio de esquema, ni dato tocado.

## Change Surface

```yaml
change_surface:
  allowed: [server-pg.js, src/routes/orders.js, src/routes/documents.js, src/routes/connect.js, src/routes/notifications.js, src/routes/workshops.js, src/routes/donations.js, src/routes/README.md, ADD/aspecs/FT-0015-extraer-rutas-oleada-2.md]
  prohibited: [lib/, lib/domain.js, lib/pure.js, test/contract/rutas.json, public/, schema.sql, schema-pg.sql]
```

## Blast Radius

```yaml
blast_radius:
  direct: [/api/orders*, /api/documents*, /api/connect*, /api/workshop/*, /api/workshops*, /api/donations*, respaldo del taller (enums), contador de visitas (visitSalt compartido)]
  indirect: [prueba de cobertura de rutas (test/qa/contract.test.js), prueba de seguridad (test/qa/security.test.js), informe de métricas, guard del monolito]
  must_not_affect: [admin, auth/oauth, catálogo, SSR, aislamiento entre talleres, reglas del taller]
```

## Composition

```yaml
composition:
  requires_aspecs: [FT-0014]
  must_compose_with: ["puerta npm run verify"]
  systemic_invariants: ["el escáner scripts/rutas.js es la única definición de qué rutas existen (server-pg.js + src/)"]
  composition_checks: ["test/qa/contract.test.js sigue viendo las 103 rutas /api, incluidas las declaradas en src/routes/", "el 404 de /api sigue declarado después de todas las rutas"]
```

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: one coherent responsibility and one main reason to change
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  preferred_new_logic_locations: [src/routes]
```

## Traceability

- Requirement: 4.8 (AR-F4, ensamblador de rutas) — oleada 2
- Commit: (pendiente)
- Deployment: Render

## Definition of Done

- [x] Objective satisfied
- [x] Scope respected
- [x] Contract satisfied
- [x] Independent falsable truth exists now
- [x] Invariants preserved
- [x] Verification passed
- [x] Rollback / compensation is honest
- [x] Composition checks passed when applicable
- [x] No unrelated changes
- [x] Structural constraints respected
- [x] Traceability established
