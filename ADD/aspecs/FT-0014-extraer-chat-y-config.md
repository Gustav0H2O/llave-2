# A.SPEC FT-0014 — Extraer el chat de IA y la configuración del entorno a módulos propios

## WHY

`server-pg.js` está en 3 849 líneas contra un tope de 3 850: cualquier línea
nueva rompe `quality/budgets.json`. Además, el asistente (unos 250 líneas)
viaja dentro del archivo de la API, y la configuración del entorno se lee suelta
en cuatro sitios distintos (`BASE_URL` con un default que ya no es el dominio
del sitio, `VISIT_SALT` sin exigir en producción, `GEMINI_MODEL`, …).

## WHAT

1. `src/config/index.js` lee, normaliza y valida el entorno **una sola vez** y
   exporta `config` (`PROD`, `BASE_URL`, `VISIT_SALT`, `SITE_OWNER`,
   `CONTACT_EMAIL`, `LEGAL_UPDATED`, `SESSION_TTL_MS` y las claves del chat).
   `BASE_URL` por defecto pasa a `https://fueltech-master.onrender.com`.
2. `src/services/chat.js` contiene el proveedor (`proveedorChat`), el contexto,
   los límites sobre `chat_limits` y la ruta `POST /api/chat`, y expone
   `montarChat(app, { db, statsDb, config, hashToken })`.
3. En producción sin `VISIT_SALT` el arranque falla con un mensaje que explica
   qué variable falta y cómo generarla.
4. El prompt del chat lleva un **resumen compacto** del catálogo más las
   coincidencias puntuales, en vez del volcado de todos los vehículos.
5. Toda llamada a un proveedor de IA lleva `AbortController` con tope de 30 s
   (`CHAT_TIMEOUT_MS`) y el corte responde 504 con mensaje accionable.

## SCOPE

- `src/config/index.js`, `src/services/chat.js`, `test/unit/config.test.js`,
  `test/unit/chat.test.js`.
- `server-pg.js`: consume `config`, delega el chat, deja de leer `process.env`
  para esas claves.
- `.env.example` (documenta `CHAT_TIMEOUT_MS` y la obligatoriedad de
  `VISIT_SALT`), `render.yaml` (`VISIT_SALT` con `generateValue`).

## OUT OF SCOPE

- El resto de `process.env` de `server-pg.js` (admin, GA, AdSense, correo,
  OAuth) sigue como estaba: es otra A.SPEC.
- El frontend (`public/app.js`) no cambia: el contrato de `/api/chat` es el
  mismo.

## CONTRACT

- Pre: `require('./src/config').config` existe y está congelado; en producción
  exige `VISIT_SALT`.
- Post: `POST /api/chat` responde exactamente igual que antes, salvo el corte
  por tiempo (504 en vez de espera indefinida) y el contexto del prompt
  (resumen + coincidencias en vez de volcado).
- Post: `npm run metrics` mide `max_lineas_archivo` por debajo del valor
  anterior.

## INVARIANTS

```yaml
invariants:
  - "mismo mensaje y mismo estado HTTP que antes para cada caso (503 sin clave, 400 de validación, limitReached, 502 del proveedor, 429 al siguiente modelo)"
  - "el techo por dispositivo, por red y el global siguen contando en chat_limits con las mismas claves"
  - "lib/ sigue puro (npm run guard)"
  - "la cobertura de lib/ no baja de 100 %"
  - "las 102 rutas de API siguen contando y al 100 % de prueba"
```

## VERIFICATION

- `npm run guard:rapido`
- `npm run verify`
- `npm run test:unit`
- `npm run test:qa`
- `npm run metrics`
- `npm run robots:rapido` (blast radius alto: chat de IA)

## ROLLBACK

`git revert` del commit. No hay migración ni dato tocado: `chat_limits` se crea
igual que antes (`CREATE TABLE IF NOT EXISTS`) y ninguna fila cambia de forma.

## Change Surface

```yaml
change_surface:
  allowed: [server-pg.js, src/config/index.js, src/services/chat.js, test/unit/config.test.js, test/unit/chat.test.js, test/helpers.js, test/qa/invariants.test.js, scripts/metrics.js, scripts/qa.js, .env.example, render.yaml, AGENTS.md]
  prohibited: [lib/, lib/domain.js, lib/pure.js, schema.sql, schema-pg.sql]
```

## Blast Radius

```yaml
blast_radius:
  direct: [/api/chat, contador de visitas (VISIT_SALT), páginas legales (BASE_URL/SITE_OWNER/CONTACT_EMAIL), sesiones (SESSION_TTL_MS)]
  indirect: [enlaces de verificación de correo, sitemap y canónicas, robots de aislamiento (leen las rutas del servidor)]
  must_not_affect: [aislamiento entre talleres, reglas del taller, catálogo]
```

## Composition

```yaml
composition:
  requires_aspecs: [FT-0009, FT-0011]
  must_compose_with: ["puerta npm run verify"]
  systemic_invariants: ["una sola definición de cada helper del servidor (esc, hashToken)"]
  composition_checks: ["test/qa/contract.test.js sigue viendo todas las rutas /api, incluidas las declaradas en src/"]
```

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: one coherent responsibility and one main reason to change
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  preferred_new_logic_locations: [src/config, src/services]
```

## Traceability

- Requirement: 4.2 (config), 4.4 (chat), 2.35 (BASE_URL), 2.39 (contexto), 2.41 (timeout)
- Commit: (pendiente)
- Deployment: Render (`VISIT_SALT` generado por el blueprint)

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
