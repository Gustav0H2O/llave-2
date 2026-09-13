# A.SPEC FT-0025 — La portada es la página de inicio, no el catálogo

## WHY

React ya arrancaba en la vista `home` («Todo lo que necesitas, en una sola
llave.»). Lo que seguía siendo el catálogo de combustible era **el HTML que
sirve el servidor para `/`**:

- El esqueleto de `#root` en `public/index.html` era el panel de filtros del
  catálogo (aside `.search-pane` + panel de resultados), así que lo primero que
  se veía al abrir la web —y lo único que se ve si React tarda o falla— era la
  pantalla de búsqueda de vehículos.
- La portada sin JavaScript (`lib/portada.js`) abría con
  `<h1>Presión de riel, módulos y pilas de gasolina al instante</h1>` y hablaba
  solo del producto de presión de combustible.

La página de entrada parecía la ficha de un producto en vez del menú de todo el
taller.

## WHAT

La entrada —lo que sirve el servidor y el primer pintado— es la página de
inicio: el mismo `<h1>` que enseña el panel («Todo lo que necesitas, en una sola
llave.»), un esqueleto de inicio y una portada rastreable que presenta la
plataforma completa (consulta, diagnóstico, gestión, comunidad y aprendizaje),
no solo el catálogo.

## SCOPE

- `public/index.html`: esqueleto de `#root` (nav + hero + seis tarjetas) y el
  texto del `<noscript>`.
- `lib/portada.js`: reescritura de la prosa y el `<h1>`.
- `quality/budgets.json`: tope de `index.html` de 196 a 198.

## OUT OF SCOPE

- El logo del encabezado y el menú al pulsarlo (siguen yendo al inicio).
- Las fichas de vehículo, el catálogo `/vehiculos` y las guías: son páginas
  propias y no cambian.
- El `<title>` y la meta descripción de `/`, que ya describen la plataforma.

## CONTRACT

Post: `/` sirve un `<h1>` «Todo lo que necesitas, en una sola llave.» y el
esqueleto de arranque corresponde a la página de inicio; la portada sigue siendo
rastreable (un `<h1>`, al menos cinco `<h2>`, tres `<h3>`, más de 250 palabras,
más de diez párrafos, enlaces a `/vehiculos` y `/guias`, cada guía y cada
vehículo de la muestra) y sigue sin cifras de presión ni conteos del catálogo.

## INVARIANTS

```yaml
invariants:
  - "test/unit/portada.test.js (estructura, enlaces, escape y sin presiones)"
  - "guard:reglas-del-taller-en-un-solo-sitio (nada de PSI numérico en lib/)"
  - "robot recorrido: 23 páginas, meta descripción y canónica intactas"
  - "robot interfaz: el home sigue montando sobre el esqueleto"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
  - npm run robots:rapido
```

## ROLLBACK

`git revert`.

## Change Surface

```yaml
change_surface:
  allowed: [public/index.html, lib/portada.js, quality/budgets.json]
  prohibited: [server-pg.js, src/, db.js, lib/domain.js, public/microapps.js]
```

## Blast Radius

```yaml
blast_radius:
  direct: [/ (portada), primer pintado de la SPA]
  indirect: [SEO de la portada, robots recorrido e interfaz]
  must_not_affect: [API, sesiones, catálogo, resto de páginas SSR]
```

## Traceability

- Requirement: "la pagina principal no quiero que sea el catalogo de combustible si no la de Todo lo que necesitas, en una sola llave"
- Commit: add/FT-0025-portada-inicio
- Deployment: assets de public/ → CACHE del service worker

## Definition of Done

- [x] Objective satisfied · [x] Invariants preserved · [ ] Verification passed
