# A.SPEC FT-0017 — Extraer el SSR/HTML de `server-pg.js`

## WHY

`server-pg.js` sigue siendo el monolito de la API. La matriz 4.8 / AR-F4 ya sacó
los quince dominios de API a `src/routes/` y el patrón está probado:
`scripts/rutas.js`, `test/helpers.js`, `scripts/metrics.js` y `scripts/guard.js`
leen `server-pg.js` **y** todo `src/`, así que una ruta movida sigue entrando en
el contrato, en la prueba de seguridad y en el informe.

Lo que queda dentro son ~420 líneas de **SSR/HTML**: la portada, la ficha de
vehículo, el perfil público del taller, el catálogo, las páginas legales, las
guías, el sitemap y su `robots.txt`, el contenedor de anuncios y el panel de
administración, más la maqueta que los une (`renderShell`, ~58 líneas) y el pie
legal. Mientras vivan ahí, cualquier retoque de una plantilla —un título, un dato
de la ficha, una regla de SEO— vuelve a tocar el archivo más largo del servidor.

## WHAT

Dos módulos nuevos y una sustitución en `server-pg.js`:

| Módulo | Qué expone | Qué registra / qué hace |
| --- | --- | --- |
| `src/routes/paginas.js` | `{ montarPaginas }` | `GET /`, `/vehiculo/:slug`, `/taller/:slug`, `/vehiculos`, `/:slug(acerca-de\|contacto\|privacidad\|terminos)`, `/guias`, `/guia/:slug`, `/sitemap.xml`, `/robots.txt`, `/ads`, `/ads.txt`, `/admin`, `/admin.js` |
| `src/views/shell.js` | `{ crearRenderShell }` | la maqueta: `renderShell` + el pie legal (`legalFooter`), compartidos por el SSR y por las pantallas de error |

- **La maqueta no puede ir a `lib/`**: lee `public/index.html` del disco y usa el
  nonce de la respuesta (`lib/` tiene que seguir puro, AGENTS.md §3). Y **no** va
  dentro de `paginas.js` porque `server-pg.js` también la usa para
  `enviarPaginaError` (404/500/401/403/503): `server-pg.js` la construye una vez
  con `crearRenderShell({ INDEX_HTML, BASE_URL, ADSENSE_CLIENT, GA_ID,
  SITE_OWNER, DEFAULT_OG, esc, iframeAnuncios })` y se la pasa por `deps`.
- **El orden de registro es precedencia** y la llamada sustituye al bloque **en su
  misma posición**: después de los middlewares globales, `/healthz` y
  `/api/visit`, y antes de `express.static` y de toda la API. Media docena de
  rutas caen a `next()` cuando no les toca responder (`/vehiculo/:slug`,
  `/guia/:slug`, `/:slug(…)`, `/ads`, `/ads.txt`), y `/admin` + `/admin.js`
  tienen que seguir respondiendo **antes** de `express.static`.
- **`PAGES` se queda en `server-pg.js`** (es `paginasDe({ esc, siteOwner,
  contactEmail, legalUpdated, baseUrl })`, que depende de `src/config`) y se
  adelanta su definición al punto de montaje, porque el literal `deps` se evalúa
  al montar y nadie más la usaba. Igual que `INDEX_HTML`, `BRAND_LOCKUP` (que
  además usa el 404 de `server-pg.js`), `OG_FILES`/`DEFAULT_OG`/`ogForVehicle` y
  `vehicleForPage`.
- **`/admin` y `/admin.js`** reciben la carpeta pública por `deps` (`dirPublico`):
  el `path.join(__dirname, 'public', …)` del monolito apuntaría a `src/routes/`
  desde el módulo. El `sendFile` y su `no-cache` son los mismos.
- Todo lo demás entra por `deps`: `db`, `BASE_URL`, `renderShell`, `esc`,
  `psiToBar`, `recortarMeta`, `vehicleSlug`, `vehicleIdFromSlug`, `GUIDES`,
  `paginaPortada`, `paginaRuta`, `paginaGuia`, `jsonLdRuta`, `urlsDelSitemap`,
  `xmlDelSitemap`, `ogForVehicle`, `ADSENSE_CLIENT`, `politicaAnuncios`,
  `documentoAnuncios` e `iframeAnuncios`.
- `HOME_TITLE`/`HOME_DESC` viajan con la portada (es su única consumidora); el
  `SITEMAP_LASTMOD` se sigue calculando una sola vez, al montar la app.

## SCOPE

- `src/routes/paginas.js` (nuevo), `src/views/shell.js` (nuevo),
  `src/routes/README.md`.
- `server-pg.js`: dos `require` nuevos; `renderShell` sustituido por
  `crearRenderShell(...)`; `PAGES` adelantado; el bloque SSR (rutas, `LEGAL_LINKS`
  y `legalFooter`) sustituido por `montarPaginas(app, { … })` en su sitio; se
  quitan `HOME_TITLE`/`HOME_DESC` (se van con la portada).
- `test/qa/invariants.test.js`: la invariante «los metadatos de la SERP se
  recortan con `recortarMeta`» mira también `src/routes/paginas.js`, que es donde
  ahora se escriben esos metadatos. La invariante no se debilita: sigue fallando
  si nadie recorta el título y la descripción.
- `ADD/aspecs/FT-0017-extraer-ssr-paginas.md`.

## OUT OF SCOPE

- `lib/` entero (sigue puro) y las reglas del taller.
- Los archivos estáticos: `express.static` no se mueve.
- Los middlewares globales y las redirecciones 301 (host, `/index.html`,
  `/_*.html`, barra final), `/healthz`, `/api/visit`, el 404 de `/api`,
  `/_errores/:codigo`, el catch-all general y el manejador de errores final.
- Ninguna ruta `/api`: `test/contract/rutas.json` **no** se regenera.
- Nada del frontend ni de `public/`.

## CONTRACT

- Pre: las 103 rutas `/api` y su exigencia de auth son las mismas que declara
  `test/contract/rutas.json`.
- Post: el HTML servido es el mismo, byte a byte: mismos `<title>`, descripción,
  canónica, `hreflang`, Open Graph, JSON-LD (con su nonce), `data-vehicle` /
  `data-app`, pie legal, `iframeAnuncios` y `gtag`.
- Post: mismos `status` y mismas cabeceras (`Cache-Control: public, max-age=300`
  en `/`, `600` en `/vehiculo/:slug` y `/vehiculos`, `3600` en legales, guías,
  sitemap, robots y anuncios; `no-store` en el 404 del taller; `no-cache` en
  `/admin` y `/admin.js`), mismo `301` del slug de vehículo no canónico y mismas
  cabeceras del contenedor de anuncios (CSP propia).
- Post: el orden de registro no cambia: lo que antes era el bloque SSR ahora es
  `montarPaginas(...)` en la misma línea del ensamblador, antes de
  `express.static` y de `montarCatalog`.
- Post: `server-pg.js` baja de 1021 a 671 líneas y el SSR vive en dos módulos con
  una sola responsabilidad.

## INVARIANTS

```yaml
invariants:
  - "el HTML renderizado no cambia (mismo título, descripción, canónica, OG, JSON-LD con nonce y pie legal)"
  - "los status y las cabeceras Cache-Control de cada página son los mismos"
  - "el 301 del slug no canónico de /vehiculo/:slug sigue siendo 301 con el slug bueno"
  - "las rutas con next() siguen cayendo al siguiente handler (y /admin sigue antes de express.static)"
  - "las 103 rutas /api siguen iguales y 100 % probadas"
  - "lib/ sigue puro y con 100 % de cobertura"
  - "server-pg.js no gana ninguna ruta /api nueva (el monolito sigue congelado)"
  - "las pantallas de error siguen usando la MISMA maqueta que el SSR (una sola definición)"
```

## VERIFICATION

- `npm run guard:rapido` (guard-rapido)
- `npm run guard`
- `node --test test/contract/contrato.test.js`
- `npm test`
- `npm run metrics` (metrics)
- `npm run verify` (verify)
- `npm run robots -- --solo=recorrido`

Nota de honestidad sobre el robot `recorrido` (2026-09-11): 246 de 247
comprobaciones en verde, incluida la visita de las 23 páginas del sitemap con su
título, canónica, JSON-LD, cabeceras y supervivencia al arranque de React. La
única en rojo es **preexistente y ajena a esta extracción**:

```
▶ 4. Páginas inexistentes
  ✗ /vehiculo/ responde 404 — estado 301
```

`/vehiculo/` (con barra final) lo responde el middleware global de normalización
de barra final —el de 2.37, que esta A.SPEC deja explícitamente fuera— con un
`301` a `/vehiculo`, que sí da `404`. Ese middleware se registra mucho antes
(`server-pg.js` l. 299) que `montarPaginas` (l. 426), así que el handler del SSR
ni se ejecuta: el resultado era idéntico antes de mover nada. El robot usa
`redirect: 'manual'` y espera `404`; la decisión (que el robot siga el 301, o que
`/vehiculo/` responde 404) no está tomada y no se toca aquí.

## ROLLBACK

`git revert` del commit: los dos módulos desaparecen y el bloque vuelve a su sitio
en `server-pg.js` (los cuerpos son idénticos). No hay migración, ni cambio de
esquema, ni dato tocado.

## Change Surface

```yaml
change_surface:
  allowed: [server-pg.js, src/routes/paginas.js, src/views/shell.js, src/routes/README.md, test/qa/invariants.test.js, ADD/aspecs/FT-0017-extraer-ssr-paginas.md]
  prohibited: [lib/, lib/domain.js, lib/pure.js, lib/paginas.js, test/contract/rutas.json, public/, schema.sql, schema-pg.sql, quality/budgets.json]
```

## Blast Radius

```yaml
blast_radius:
  direct: [SSR de /, /vehiculo/:slug, /taller/:slug, /vehiculos, legales, /guias, /guia/:slug, /sitemap.xml, /robots.txt, /ads, /ads.txt, /admin, /admin.js, maqueta renderShell]
  indirect: [pantallas de error (enviarPaginaError), SEO y CSP nonce de cada página, robot recorrido, informe de métricas, invariante de recortarMeta]
  must_not_affect: [rutas /api, auth y sesiones de taller, aislamiento entre talleres, middlewares globales, redirecciones 301, archivos estáticos, reglas del taller]
```

## Composition

```yaml
composition:
  requires_aspecs: [FT-0016]
  must_compose_with: ["puerta npm run verify"]
  systemic_invariants: ["scripts/rutas.js es la única definición de qué rutas existen (server-pg.js + src/)", "src/views/shell.js es la única definición de la maqueta HTML (SSR y errores)", "la precedencia de Express es contrato: el ensamblador no reordena"]
  composition_checks: ["test/helpers.js y scripts/rutas.js siguen leyendo src/, así que las páginas movidas siguen cubiertas", "el robot recorrido sigue viendo las mismas páginas del sitemap con el mismo HTML"]
```

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: one coherent responsibility and one main reason to change
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  preferred_new_logic_locations: [src/routes, src/views]
```

## Traceability

- Requirement: 4.8 (AR-F4, ensamblador de rutas) — oleada 5 (SSR)
- Commit: (pendiente)
- Deployment: Render

## Definition of Done

- [x] Objective satisfied
- [x] Scope respected
- [x] Contract satisfied
- [x] Independent falsable truth exists now
- [x] Invariants preserved
- [x] Verification passed (salvo el check `/vehiculo/` del robot, preexistente y documentado arriba)
- [x] Rollback / compensation is honest
- [x] Composition checks passed when applicable
- [x] No unrelated changes
- [x] Structural constraints respected
- [x] Traceability established
