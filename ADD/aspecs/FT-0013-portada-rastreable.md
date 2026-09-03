# A.SPEC FT-0013 — Servir la portada «/» rastreable sin JavaScript

## WHY

Auditoría Seobility de `https://fueltech-master.onrender.com/` (26-08-2026,
`fueltech_master_onrender_com_seocheck_2026_08_26.pdf`): puntuación **36 %**.

El panel de inicio lo pinta React, así que el rastreador que **no** ejecuta
JavaScript veía en «/» **4 palabras**, **cero encabezados** (ni `<h1>`) y **un
solo enlace interno** — el «Saltar al contenido principal». Estructura de
enlaces 0 %, contenido 45 %, meta 49 %.

Además el `<title>` medía 656 px (se corta a los 580) y la meta description
1353 px (se corta a los 1000), y con y sin `www` se servía lo mismo sin 301,
que para el buscador son dos sitios repartiéndose la autoridad.

## WHAT

`GET /` sirve, **debajo** del esqueleto de carga y dentro de `#root`, la misma
portada en HTML plano: un `<h1>`, encabezados de sección y de paso, prosa real
y los enlaces internos del sitio. React la borra al montar —igual que borra el
esqueleto—, así que la persona no la ve: queda fuera del pliegue y dura lo que
tarda el arranque. No es contenido distinto del que ve el usuario: es el mismo
panel de inicio escrito sin JavaScript.

Título y descripción de la portada pasan a caber en el resultado de búsqueda, y
un `www.` entrante se redirige con 301 al host de `BASE_URL`.

## SCOPE

- `lib/portada.js` nuevo: función pura `(datos) → HTML` de la portada.
- `test/unit/portada.test.js`: `<h1>` único, jerarquía sin saltos, >250
  palabras, párrafos, enlaces internos, escapado y ausencia de cifras de PSI.
- `server-pg.js`: la ruta `/` reúne los datos y delega el HTML; `renderShell`
  acepta `keepPlaceholder`; `HOME_TITLE`/`HOME_DESC` acortados; `alt` real en la
  variante clara del logotipo; middleware 301 de `www` → host de `BASE_URL`.
- `public/index.html`: `<title>`, `description`, `og:title`, `og:description` y
  el `alt` de `logo-light.png`.

## OUT OF SCOPE

- El panel React: su `<h1>`, sus textos y su maquetación no se tocan.
- Reglas del taller: la prosa nombra los sistemas de inyección, **nunca** sus
  presiones (AGENTS.md §2 — la fuente única sigue siendo `lib/domain.js`).
- Backlinks, widgets de compartir en redes y enlaces externos (la auditoría los
  marca «nice to have»).
- El aviso de «parámetros dinámicos» y de «canónica a otra página»: salen de que
  la URL auditada fue `/?v=26`. La canónica y el `hreflang` autorreferente ya
  estaban bien.
- El tope de los listados de taller (`clientes`, `inventario`, `órdenes`,
  `caja`), que el robot `carga` destapa con `--filas=260`. Es otra A.SPEC.

## CONTRACT

Pre: `GET /` devuelve 200 con el hueco `ROOT-CONTENT` ocupado solo por el
esqueleto gris.

Post: el HTML de `GET /` contiene exactamente un `<h1>`, ≥5 `<h2>`, ≥3 `<h3>`,
≥250 palabras de texto visible, ≥10 `<p>` y ≥30 enlaces internos distintos.
El `<title>` mide ≤580 px y la meta description ≤1000 px. Una petición con
`Host: www.*` responde 301 al mismo camino sobre el host de `BASE_URL`.

## INVARIANTS

```yaml
invariants:
  - "React sigue montando en / y borrando el hueco: la app no cambia de aspecto"
  - "el esqueleto de carga sigue siendo lo primero del hueco (sin destello de texto)"
  - "canónica, hreflang autorreferente y JSON-LD de / intactos"
  - "ninguna presión del taller se escribe fuera de lib/domain.js"
  - "lib/ sigue puro: portada.js no toca base, entorno ni express"
  - "los hashes CSP de index.html se siguen calculando del archivo servido"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
  - npm run robots:rapido
```

Medido además contra el servidor local (`TURSO_URL= … node server-pg.js`):
632 palabras visibles, 1 `<h1>`, 6 `<h2>`, 3 `<h3>`, 15 `<p>`, 34 enlaces
internos distintos, 4 imágenes con `alt`, y `Host: www.*` → 301.

## ROLLBACK

`git revert`. Sin migración, sin estado: la ruta vuelve a servir el hueco con
solo el esqueleto y `lib/portada.js` queda huérfano.

## Change Surface

```yaml
change_surface:
  allowed: [lib/portada.js, test/unit/portada.test.js, server-pg.js, public/index.html]
  prohibited: [lib/domain.js, quality/budgets.json, public/app.js, public/microapps.js]
```

## Blast Radius

```yaml
blast_radius:
  direct: [GET /, renderShell, HOME_TITLE, HOME_DESC]
  indirect: [robot recorrido, métricas de tamaño de server-pg.js]
  must_not_affect: [API, sesiones, aislamiento por taller, CSP, chat de IA]
```

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: el HTML de la portada es contenido, no fontanería de servidor
  entrypoints_must_stay_thin: true
  preferred_new_logic_locations: [lib/portada.js]
```

El renderizador vive en `lib/` por el mismo motivo que `lib/ruta.js`: se prueba
sin levantar servidor y `server-pg.js` no gasta en él el margen que le queda
hasta las 3000 líneas (2814 → 2858, dentro del trinquete).

## Traceability

- Requirement: auditoría Seobility 26-08-2026 — tareas «Add a H1 heading»,
  «Use good headings», «only very few internal links», «301 www/non-www»,
  «Review and improve the page title», «Improve the meta description»,
  «alt attributes».
- Commit: add/FT-0013-portada-rastreable
- Deployment: requiere despliegue; la producción actual va por detrás de master
  (sirve todavía el título largo de antes de FT-0007).

## Definition of Done

- [x] Objective satisfied · [x] Scope respected · [x] Contract satisfied
- [x] Invariants preserved · [x] Verification passed (`verify` 459/459 en verde)
- [x] Rollback honesto · [x] No unrelated changes
