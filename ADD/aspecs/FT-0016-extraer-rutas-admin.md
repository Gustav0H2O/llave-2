# A.SPEC FT-0016 — Extraer el panel de administración de `server-pg.js`

## WHY

`server-pg.js` sigue siendo el monolito de la API. La matriz 4.8 / AR-F4 ya sacó
trece dominios a `src/routes/` y el patrón está probado: `scripts/rutas.js`,
`test/helpers.js`, `scripts/metrics.js` y `scripts/guard.js` leen `server-pg.js`
**y** todo `src/`, así que una ruta movida sigue entrando en el contrato, en la
prueba de seguridad y en el informe.

Queda dentro el dominio de **admin**: ~620 líneas, TODAS las rutas `/api/admin/*`
—el panel entero— más su autenticación (token HMAC con `jti`, CSRF, auditoría y
limitadores), el alta/edición/import de vehículos, marcas, pilas, donaciones y la
gestión de cuentas de taller. Mientras viva ahí, cualquier cambio del panel vuelve
a tocar el archivo más grande del servidor.

## WHAT

Un módulo nuevo, `src/routes/admin.js`, con `module.exports = { montarAdmin }`, y
en `server-pg.js` el bloque se sustituye por la llamada
`montarAdmin(app, { ... })` **en la misma posición** (después del identificador
de IA, antes de las cuentas de taller), porque Express resuelve por orden de
registro.

| Módulo | Rutas | Exporta además |
| --- | --- | --- |
| `admin.js` | `/api/admin/login`, `/api/admin/logout`, `/api/admin/bootstrap`, `/api/admin/vehicles`, `/api/admin/vehicles/:id`, `/api/admin/vehicles/:id/verify`, `/api/admin/vehicles/import`, `/api/admin/brands`, `/api/admin/pumps`, `/api/admin/missing`, `/api/admin/donations`, `/api/admin/donations/:id/approve`, `/api/admin/donations/:id/reject`, `/api/admin/donations/manual`, `/api/admin/donations/test-notice`, `/api/admin/workshops`, `/api/admin/workshops/:id`, `/api/admin/workshops/:id/password`, `/api/admin/workshops/:id/wipe`, `/api/admin/workshops/:id/donor-level`, `/api/admin/workshops/:id/backup` | `montarAdmin` devuelve `{ notificarTaller }` |

- **Autenticación, CSRF y auditoría** viajan con el dominio: `ADMIN_PASSWORD`/
  `ADMIN_SECRET` (se leen del entorno en el módulo, en la misma posición temporal
  que antes), `signAdminToken`/`verifyAdminToken`/`revocarAdminToken`,
  `adminTokensRevocados` y su `setInterval`, `igualDeFormaSegura`,
  `METODOS_MUTANTES`, `ADMIN_COOKIE`, `ADMIN_TOKEN_TTL_MS`, `requireAdmin`,
  `adminLimiter` (40/min) y `adminLoginLimiter` (5/15 min, 1000 en test). Se
  comprobó por grep que **nadie más** los usa. `CSRF_COOKIE` **no** se mueve: el
  nonce lo emite un middleware global de `server-pg.js`, así que entra por `deps`
  y la cookie sigue teniendo una sola fuente.
- **Las invalidaciones de caché** entran desde `src/services/caches.js`
  (`invalidarCatalogos`/`invalidarMetaCache`/`invalidarPumpsCache`), el singleton
  que el catálogo LEE. No son variables locales: una copia por módulo se
  desincronizaría.
- **`notificarTaller`** es lo único del bloque que otro dominio usa
  (`montarDonations` lo recibe por `deps`): `montarAdmin` lo **devuelve** para que
  exista una sola definición.
- **`enTransaccion`** se queda en `server-pg.js`: es el envoltorio de transacción
  de TODO el servidor. Se adelanta su definición al punto de montaje (antes vivía
  dentro del bloque) porque el literal `deps` la evalúa al montar; ningún uso
  anterior existe.
- `ASSEMBLY` viaja con el dominio. Los helpers puros (`str`, `num`, `toInt`,
  `esc`, `leerCookie`, `extraerToken`), los de instancia (`db`, `statsDb`, `idDe`,
  `errorAccionable`, `enTransaccion`, `hashPassword`) y las reglas/fuentes
  únicas (`ZONES`, `BODY_TYPES`, `moduleRegulatedPsi`, `pumpClass`, `baseFlow`,
  `calcularNivelDonador`, `vEmail`, `enviarAvisoDonacion`, `PROD`, `BASE_URL`,
  `CSRF_COOKIE`) entran por `deps`.
- El **import de vehículos** se copia verbatim: sigue SIN N+1 (precarga en lote de
  marcas e injection_types, 2 `SELECT`, y tres inserciones por fila). No usa
  `ORDER_TYPES`/`DOC_KINDS`, así que no se importa ningún enum.

## SCOPE

- `src/routes/admin.js` (nuevo), `src/routes/README.md`.
- `server-pg.js`: `require` del módulo; las constantes de auth de admin
  sustituidas por `CSRF_COOKIE`; el import de `src/services/caches.js` movido al
  módulo; el bloque admin sustituido por `const { notificarTaller } =
  montarAdmin(app, { ... })` en su sitio.
- `ADD/aspecs/FT-0016-extraer-rutas-admin.md`.

## OUT OF SCOPE

- `auth`, `oauth`, catálogo, SSR y los *catch-alls*: siguen en `server-pg.js`.
- `test/contract/rutas.json` **no** se regenera: el contrato (método + ruta +
  auth) no cambia y el snapshot solo guarda esos campos.
- Nada del frontend, ni `public/admin.js`.

## CONTRACT

- Pre: los 103 pares `método + ruta` de la API y su exigencia de auth son los
  mismos que declara `test/contract/rutas.json`.
- Post: cada handler se comporta igual (mismo `return`, mismos `status`, mismos
  campos, mismas cabeceras `Cache-Control`, misma cookie `ft_admin`, mismo TTL de
  1 h, mismo CSRF `X-CSRF-Token`/`ft_csrf`, mismo 5/15 min en el login, misma
  auditoría `[admin-audit]`).
- Post: el orden de registro no cambia (`…chat → identificador → admin → cuentas
  de taller…`).
- Post: el total de rutas `/api` sigue siendo 103 y las 25 de `/api/admin/*` se
  declaran ahora en `src/routes/admin.js` con `requireAdmin` (excepto el login).

## INVARIANTS

```yaml
invariants:
  - "las 103 rutas /api siguen existiendo con el mismo método, la misma ruta y la misma exigencia de requireWorkshop/requireAdmin"
  - "el panel sigue desactivado (503) sin ADMIN_PASSWORD y sigue exigiendo token para todo menos el login"
  - "el token de admin conserva el formato exp.jti.firma, el TTL de 1 h y la revocación por jti"
  - "las mutaciones por cookie siguen exigiendo CSRF (403 csrf_invalid); Bearer va exento"
  - "el import de vehículos sigue sin N+1 (test/qa/import-queries.test.js: 2 SELECT de precarga, 0 SELECT por fila)"
  - "las invalidaciones de caché siguen siendo las de src/services/caches.js (una sola copia)"
  - "lib/ sigue puro (npm run guard) y la cobertura de lib/ no baja de 100 %"
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

`git revert` del commit: el módulo desaparece y el bloque vuelve a su sitio en
`server-pg.js` (los cuerpos son idénticos, byte a byte). No hay migración, ni
cambio de esquema, ni dato tocado.

## Change Surface

```yaml
change_surface:
  allowed: [server-pg.js, src/routes/admin.js, src/routes/README.md, ADD/aspecs/FT-0016-extraer-rutas-admin.md]
  prohibited: [lib/, lib/domain.js, lib/pure.js, test/contract/rutas.json, public/, schema.sql, schema-pg.sql]
```

## Blast Radius

```yaml
blast_radius:
  direct: [/api/admin/* (login, token, CSRF, panel), import de vehículos, donaciones admin, gestión de cuentas de taller]
  indirect: [prueba de contrato (test/contract/contrato.test.js), prueba de seguridad (test/qa/security.test.js), prueba de import (test/qa/import-queries.test.js), informe de métricas, guard del monolito]
  must_not_affect: [auth/oauth de talleres, aislamiento entre talleres, catálogo público y sus cachés, SSR, reglas del taller]
```

## Composition

```yaml
composition:
  requires_aspecs: [FT-0015]
  must_compose_with: ["puerta npm run verify"]
  systemic_invariants: ["el escáner scripts/rutas.js es la única definición de qué rutas existen (server-pg.js + src/)", "src/services/caches.js es el único dueño del estado metaCache/pumpsCache"]
  composition_checks: ["test/qa/contract.test.js sigue viendo las 103 rutas /api, incluidas las declaradas en src/routes/", "montarDonations sigue recibiendo notificarTaller (una sola definición)"]
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

- Requirement: 4.8 (AR-F4, ensamblador de rutas) — oleada 3b
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
