# A.SPEC FT-0030 — Titularidad real y alcance de la licencia

## WHY

Tres huecos concretos en la licencia de FT-0029:

1. **El titular era un alias.** Decía `GustavoH20`, que es el usuario de
   GitHub, no la persona. Una licencia propietaria nombra al titular por su
   nombre; un alias debilita la reclamación y no identifica a quién hay que
   pedirle permiso.

2. **El aviso de terceros estaba incompleto.** El repositorio redistribuye,
   además de `public/vendor/` (que sí estaba declarado), la skill
   `scandinavian-design` de `ericzakariasson/scandinavian-design` —44 archivos,
   376 KB, la misma copia en `.agents/skills/`, `.claude/skills/` y
   `.commandcode/skills/`— referenciada por `skills-lock.json`. Un «todos los
   derechos reservados» que no exceptúa obra ajena que el repo redistribuye es
   falso.

3. **El alcance no estaba dicho.** El repositorio es público desde antes de que
   existiera el archivo: cinco commits (2026-09-11 a 2026-09-16) sin `LICENSE`.
   Ninguno se borró —`git log --diff-filter=AD -- LICENSE` no devuelve nada más
   que el commit que lo creó—, pero el silencio deja abierta la lectura de que
   esas revisiones eran libres.

Además `package.json` declaraba `UNLICENSED` sin reflejarlo en
`package-lock.json`, y sin campo `author`.

## WHAT

La licencia nombra al titular real, declara que rige también las revisiones
anteriores a su existencia, y exceptúa explícitamente todo lo que el
repositorio redistribuye y no es obra del titular. Los metadatos del paquete
(`package.json` y la entrada raíz de `package-lock.json`) dicen lo mismo.

## SCOPE

- `LICENSE`: titular, apartado «ÁMBITO» y sección 5 reorganizada en 5.1
  (librerías MIT), 5.2 (skill de terceros) y 5.3 (dependencias).
- `package.json`: campos `license` (ya estaba) y `author`.
- `package-lock.json`: entrada raíz sincronizada (`npm install
  --package-lock-only`).
- `README.md`: el resumen de licencia nombra al titular.

## OUT OF SCOPE

- No se retiran del repositorio la skill ni las carpetas de herramientas de IA:
  eso es otro cambio, con su propia A.SPEC.
- No se toca `.gitignore` (patrón corrupto en la línea 35): hallazgo aparte.
- No se reescribe el historial ni se cambia la visibilidad del repo.
- No se tocan los archivos de `public/vendor/` ni sus cabeceras MIT.

## CONTRACT

Post: `LICENSE` nombra a «Gustavo Jesús Heredia Romero» como titular; declara
su alcance sobre todas las revisiones; y la sección 5 nombra los tres bloques
de obra ajena. `package.json` y la entrada raíz de `package-lock.json` declaran
la misma licencia y el mismo autor.

## INVARIANTS

```yaml
invariants:
  - "el lock sigue instalable y sin deriva de dependencias: `npm ci` no cambia versiones"
  - "las cabeceras MIT de public/vendor/ quedan intactas"
  - guard:tamano-de-archivos
  - "ningún archivo de public/ cambia: el sitio servido es idéntico (misma versión de CACHE)"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
```

## ROLLBACK

`git revert`.

## Change Surface

```yaml
change_surface:
  allowed: [LICENSE, package.json, package-lock.json, README.md, ADD/aspecs/FT-0030-titularidad-y-alcance-de-la-licencia.md, quality/REPORT.md, quality/history.ndjson]
  prohibited: [public/, src/, lib/, server-pg.js, db.js]
```

## Blast Radius

```yaml
blast_radius:
  direct: [LICENSE, metadatos del paquete, README]
  indirect: []
  must_not_affect: [sitio servido, API, sesiones, catálogo de datos, caché del service worker]
```

## Traceability

- Requirement: "tiene la licencia metadatos o algo escondido en el repo … mi
  nombre es Gustavo Jesús Heredia Romero"
- Commit: add/FT-0030-titularidad-y-alcance-de-la-licencia
- Deployment: metadatos del repositorio; no afecta al despliegue de la app

## Definition of Done

- [x] Objective satisfied · [x] Invariants preserved · [x] Verification passed
