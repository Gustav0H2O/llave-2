# ADD — Atomic Development Discipline en FuelTech Master

Este repo opera bajo **ADD**: cada cambio se diseña, implementa y valida como
una unidad mínima, independiente, trazable y reversible. La ambición del
sistema no se limita; el tamaño de cada cambio sí.

Doctrina fuente: [luc444s/atomic-driven-development](https://github.com/luc444s/atomic-driven-development)
(MIT). Los tres documentos canónicos (`MANIFESTO.md`, `SPECIFICATION.md`,
`ASPEC-TEMPLATE.md`) y las skills de `skills/` están copiados **sin modificar**
del upstream. Lo propio de este repo vive aquí: este índice, `VERIFY.yaml` y
`aspecs/`.

## Mapa

| Ruta | Qué es |
| --- | --- |
| `MANIFESTO.md` | Principios (AAA: la atomicidad aplica al cambio, no a la ambición) |
| `SPECIFICATION.md` | Definición normativa de cumplir ADD (la ley) |
| `ASPEC-TEMPLATE.md` | Plantilla canónica de una A.SPEC |
| `VERIFY.yaml` | **Binding de este repo**: qué comando prueba qué invariante |
| `aspecs/` | Registro de A.SPECs (FT-0001, FT-0002, …) |
| `skills/` | Instrucciones operativas: speccer (DEFINE), verifier (VERIFY), binding, CI, gitflow |

## Cómo entra un cambio a este repo

1. **DEFINE** — crea `ADD/aspecs/FT-XXXX-<verbo>-<objeto>.md` con la
   plantilla. La A.SPEC se escribe **antes** del código. Si el pedido mezcla
   varias verdades: SPLIT (ver `skills/Speccer-ADD.md`).
2. **BOUND** — declara Change Surface y Blast Radius. En este repo hay blast
   radius alto (y por tanto `robots-rapido` obligatorio) cuando se toca:
   auth, sesiones, aislamiento por taller, catálogo, CSP o el chat de IA.
3. **CONTRACT** — contrato e invariantes. Las invariantes de este proyecto ya
   tienen nombre: son las reglas del guard (`aislamiento-por-taller`,
   `pureza-de-lib`, `reglas-del-taller-en-un-solo-sitio`, …) y las reglas del
   taller de `lib/domain.js`. Cítalas por id; no las reescribas.
4. **IMPLEMENT** — solo lo necesario. Sin *opportunistic refactoring*: la
   mejora que apareció por el camino es otra A.SPEC (`SPECIFICATION.md` §4).
5. **VERIFY** — `npm run verify` en verde. Los comandos citables en
   `VERIFICATION` están en `VERIFY.yaml` y nowhere else: el verifier no
   adivina, lee el binding.
6. **INTEGRATE** — rama `add/FT-XXXX-<verbo>` y squash-merge a `master`:
   **1 A.SPEC = 1 commit** (GitFlow Lite, `skills/GitFlow-Lite-ADD.md`).
   `git revert` de ese commit = ROLLBACK atómico de la A.SPEC.

## Convenciones de este repo

- Prefijo: **FT-** con numeración secuencial sin huecos (FT-0001, FT-0002…).
- Las A.SPEC no se borran al integrar: son el registro de por qué existe cada
  cambio. La sección `Traceability` se completa con el hash del commit.
- ADD **no reemplaza** a AGENTS.md: AGENTS.md sigue siendo el contrato del
  QUÉ (reglas del taller, dónde va cada cosa, trampas del proyecto); ADD es el
  contrato del CÓMO ENTRA cada cambio al historial.
- `npm run verify` sigue siendo el único comando que importa (AGENTS.md §1).
  ADD no agrega verificación nueva: exige declarar cuál corrió y qué cubría.
- Deuda estructural visible: `server-pg.js` (2439 líneas),
  `public/microapps.js` (2577), `public/index.html` (2202) y `public/app.js`
  (1566) superan el umbral de extracción de `SPECIFICATION.md` §12.2 (600).
  Quedan registrados en FT-0001; cada extracción futura será su propia
  A.SPEC estructural, no un refactor de acompañamiento.
