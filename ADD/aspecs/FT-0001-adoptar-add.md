# A.SPEC FT-0001 — Adoptar ADD como disciplina de cambio del repositorio

## WHY

El historial del repo muestra commits multi-propósito ("feat: implement
comprehensive QA test suite, automated guards, and infrastructure
documentation" mezcla tres cosas), commits sin mensaje real ("acomodo",
"Please provide the list of changes…") y merges de sincronización. AGENTS.md
regula el QUÉ (reglas del taller, dónde va cada cosa, trampas) pero no el
CÓMO ENTRA un cambio al historial: no hay contrato de alcance por cambio ni
rollback de un solo paso. Con agentes de IA editando el repo, cada
intervención necesita una unidad de cambio mínima, trazable y reversible.

## WHAT

El repositorio pasa a operar bajo ADD (Atomic Development Discipline):
doctrina canónica en `ADD/`, plantilla de A.SPEC, binding explícito de
verificación (`ADD/VERIFY.yaml`), registro de especificaciones
(`ADD/aspecs/`) y flujo GitFlow Lite (1 A.SPEC = 1 rama `add/*` = 1
squash-commit en `master`). Es una **propiedad estructural nueva del proceso
de desarrollo**; ningún comportamiento en runtime cambia.

## SCOPE

- Nuevo directorio `ADD/`: `MANIFESTO.md`, `SPECIFICATION.md`,
  `ASPEC-TEMPLATE.md`, `README.md` (índice propio), `VERIFY.yaml`,
  `skills/` (5 skills operativas copiadas del upstream) y `aspecs/` (esta
  A.SPEC como primera entrada).
- `AGENTS.md`: una sección nueva (§1b) que hace obligatoria la A.SPEC como
  puerta de entrada de todo cambio.

## OUT OF SCOPE

- Cualquier cambio de código, datos o comportamiento: `server-pg.js`,
  `db.js`, `seed.js`, `migrate.js`, `lib/**`, `public/**`, `scripts/**`,
  `test/**`, `schema*.sql`, `package.json`, `quality/**` quedan intactos.
- Dividir los archivos que exceden el umbral estructural de ADD
  (`server-pg.js` 2439 líneas, `public/microapps.js` 2577,
  `public/index.html` 2202, `public/app.js` 1566): cada extracción futura es
  su propia A.SPEC estructural. Aquí solo se registra la deuda.
- Cambiar CI: `.github/workflows/qa.yml` ya ejecuta exactamente lo que
  `npm run verify` (guard + pruebas + métricas), que es el "thin CI" que
  prescribe la skill CI-Wrapper-ADD. Nada que hacer.
- Las 5 decisiones de catálogo pendientes del dueño (`quality/known-issues.json`).
- Los archivos sueltos de depuración de la raíz (`_dbg.js`, `_opt.js`,
  `_shot*.js`): retirarlos es otra A.SPEC si el dueño lo pide.

## CONTRACT

Precondiciones:

- Árbol limpio en `master` y `npm run verify` en verde antes del cambio.

Postcondiciones — verdades nuevas, ahora mismo:

1. `ADD/SPECIFICATION.md`, `ADD/MANIFESTO.md` y `ADD/ASPEC-TEMPLATE.md`
   existen y son la doctrina canónica, copiada sin modificar de
   luc444s/atomic-driven-development (MIT).
2. `ADD/VERIFY.yaml` existe y cada check cita un comando que existe en
   `package.json` o en el repo (sin drift).
3. `AGENTS.md` referencia `ADD/` como obligatorio para todo cambio.
4. `ADD/aspecs/` existe con esta A.SPEC como primera entrada del registro.
5. `npm run verify` sigue en verde con los archivos nuevos presentes.

## INVARIANTS

```yaml
invariants:
  - npm run verify DEBE seguir en verde (guard sin violaciones, 407 pruebas, métricas sin retroceso).
  - Ningún comportamiento en runtime cambia: server-pg.js, db.js, lib/**, public/** intactos.
  - quality/budgets.json y quality/known-issues.json quedan byte a byte iguales.
  - Las reglas del taller (AGENTS.md §2) no se reescriben aquí, solo se referencian.
  - El pre-commit (.githooks) y el CI (qa.yml) siguen siendo exactamente la puerta que ya eran.
```

## VERIFICATION

- `npm run verify` → exit 0. Cubre la invariante 1 y es el check `verify`
  de `ADD/VERIFY.yaml`.
- `git diff --stat HEAD~1` tras integrar → solo `ADD/**` y `AGENTS.md`
  (verifica SCOPE e invariante 2).
- `git diff --quiet HEAD~1 -- quality/ server-pg.js db.js lib/ public/ scripts/ test/` → sin diferencias
  (invariantes 2 y 3).
- La existencia de los archivos de las postcondiciones 1–4 es inspeccionable
  directamente en el commit.

## ROLLBACK

Reversible al 100 %: `git revert <commit-de-esta-A.SPEC>` elimina `ADD/` y la
sección §1b de AGENTS.md en un solo paso. No hay migraciones, datos ni estado
en runtime. El historial previo queda intacto y ningún deploy se ve afectado.

## Change Surface

```yaml
change_surface:
  allowed:
    - ADD/**
    - AGENTS.md
  prohibited:
    - server-pg.js
    - db.js
    - seed.js
    - migrate.js
    - lib/**
    - public/**
    - scripts/**
    - test/**
    - quality/**
    - package.json
    - package-lock.json
    - schema.sql
    - schema-pg.sql
    - .github/**
    - .githooks/**
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - "proceso de desarrollo: cómo entran los cambios al historial"
  indirect:
    - "commits futuros: desde FT-0002 todo cambio lleva su A.SPEC en add/*"
  must_not_affect:
    - "runtime de la aplicación"
    - "las 407 pruebas"
    - "las 18 reglas del guard"
    - "las métricas del trinquete (quality/baseline.json)"
    - "las reglas del taller"
```

## Composition

```yaml
composition:
  requires_aspecs: []
  must_compose_with: []
  systemic_invariants: []
  composition_checks: []
```

A.SPEC de adopción: no participa en ninguna capability mayor. Las futuras
extracciones estructurales de los god-files declararán su propia composition.

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: one coherent responsibility and one main reason to change
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  preferred_new_logic_locations:
    - "ADD/aspecs/ (nuevas A.SPEC)"
    - "ADD/VERIFY.yaml (nuevos bindings de verificación)"
```

Nota honesta: los god-files (`server-pg.js` 2439, `public/microapps.js` 2577,
`public/index.html` 2202, `public/app.js` 1566) exceden con creces el umbral
de extracción (600). Esta A.SPEC no los toca (OUT OF SCOPE) y la deuda queda
registrada en `ADD/README.md`. El proyecto ya controla tamaños por
`quality/budgets.json` (`max_lineas_archivo: 3000`), que ADD respeta: la ley
estructural es señal heurística, no regla primaria (`SPECIFICATION.md` §12.2).

## Traceability

- Requirement: adopción de la metodología ADD solicitada por el dueño del
  repo (2026-08-20); fuente:
  github.com/luc444s/atomic-driven-development.
- Commit: esta A.SPEC se integra en su propio commit (`add: FT-0001 …`),
  hash verificable con `git log --oneline` tras el squash-merge.
- Deployment: no aplica (sin cambios de runtime).

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
