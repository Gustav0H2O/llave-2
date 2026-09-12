# A.SPEC FT-0020 — Unificar el enrutado y retirar las vistas legacy

## WHY

`openMicro` tenía un objeto `map` que se evaluaba **antes** que el registro de
componentes `apps`. Como el `map` definía `diag`, `calc`, `glossary` y `aid`,
esos cuatro ids nunca llegaban a `apps` y las micro apps `SymptomDiagApp`,
`CalcApp`, `AidApp` y `GlossaryApp` eran **inalcanzables**: las tarjetas del
inicio abrían las vistas antiguas `Tools()` y `Calculators()`. Había dos
implementaciones de lo mismo y una de ellas muerta por el enrutado.

Además, `SymptomDiagApp` usaba `onBack()` para «abrir» batería y fusibles, y
`onBack` es `closeMicro`: la etiqueta prometía abrir y el botón solo cerraba.

## WHAT

El enrutado manda `diag`, `calc`, `aid` y `glossary` a sus micro apps (solo
`search` sigue siendo un caso especial, porque es la vista del catálogo). Las
vistas legacy `Tools()` y `Calculators()`, sus constantes y su CSS se retiran, y
el contenido que solo vivía ahí se porta antes a las micro apps para no
perderlo: glosario de combustible, consumo por HP, ley de Ohm, cuatro síntomas
de combustible, checklist de instalación, comparador de dos pilas y registro de
trabajos. Los enlaces internos de `SymptomDiagApp` pasan a `onOpen`.

## SCOPE

- `public/app.js`: `map` de `openMicro`, borrado de `Tools()`/
  `Calculators()`, sus constantes y ramas de render.
- `public/microapps.js`: puertos de contenido y `onOpen` en `SymptomDiagApp`;
  comparador y estados en `CrossApp`; checklist en `InspectionApp`.
- `public/microapps-taller.js`: registro de trabajos en `NotesApp`.
- `public/index.html`: CSS de las vistas retiradas.
- `test/robots/jornada.js`: selectores del glosario y de las calculadoras.
- `public/sw.js`: versión de caché.

## OUT OF SCOPE

- Las diez de Consulta Rápida, ya tratadas en FT-0019.
- API, base de datos, `lib/` y `src/`.

## CONTRACT

Post: los cuatro ids abren su micro app (`SymptomDiagApp`, `CalcApp`, `AidApp`,
`GlossaryApp`); `search` conserva su vista; no queda ninguna referencia a
`Tools`, `Calculators`, `DIAG_TREE`, `INSTALL_CHECKLIST`, `GLOSSARY`,
`loadChecklist` ni `getJobs`; y cada pieza de contenido legacy tiene su lugar
nuevo.

## INVARIANTS

```yaml
invariants:
  - guard:aislamiento-por-taller
  - guard:rutas-de-negocio-protegidas
  - guard:tamano-de-archivos
  - "movil-pwa: rutaEscribir({ app: id }) y popstate se conservan"
  - "movil-pwa: el reparto de micro apps entre los dos archivos no se solapa"
  - "robot jornada: las 38 herramientas siguen pintando contenido"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
  - npm run robots:rapido
  - npm run robots
```

## ROLLBACK

`git revert` del commit (el squash incluye borrado y puertos juntos).

## Change Surface

```yaml
change_surface:
  allowed: [public/app.js, public/microapps.js, public/microapps-taller.js, public/index.html, public/sw.js, test/robots/jornada.js, quality/budgets.json]
  prohibited: [server-pg.js, src/, lib/, db.js, lib/domain.js]
```

## Blast Radius

```yaml
blast_radius:
  direct: [enrutado de micro apps, catálogo, vistas de diagnóstico y calculadoras]
  indirect: [robot jornada, robot recorrrido (URLs ?app=), service worker]
  must_not_affect: [API, sesiones, aislamiento por taller, CSP]
```

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: una sola responsabilidad — el enrutado y su contenido
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  preferred_new_logic_locations: [public/microapps.js]
```

## Traceability

- Requirement: "arreglar y unificar: enrutar a las micro apps nuevas y eliminar las vistas legacy"
- Commit: add/FT-0020-unificar-enrutado
- Deployment: assets de public/ → subir CACHE del service worker

## Definition of Done

- [x] Objective satisfied
- [x] Scope respected
- [x] Contenido legacy portado antes de borrar
- [x] Invariants preserved
- [ ] Verification passed
