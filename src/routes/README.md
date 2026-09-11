# `src/routes/` — ensamblador de la API (matriz 4.8 / AR-F4)

`server-pg.js` es un monolito en proceso de desmontaje. En vez de reescribirlo de
golpe, cada oleada **extrae un dominio entero de rutas** a un módulo de aquí, sin
cambiar ninguna respuesta ni el contrato de la API (`test/contract/rutas.json`).

## El patrón: `montar<Dominio>(app, deps)`

Cada archivo expone **una** función que registra sus rutas sobre el `app` que
recibe:

```js
function montarCash(app, deps) {
  const { db, requireWorkshop, idDe, str, num, enRango, TOPE_QTY } = deps;
  app.get('/api/cash', requireWorkshop, async (req, res) => { /* … */ });
  // …
}
module.exports = { montarCash };
```

Y en `server-pg.js` se monta **en la misma posición** en la que estaba el bloque,
pasándole por `deps` **exactamente** lo que el bloque usaba:

```js
/* Caja — movido a src/routes/cash.js (4.8) */
montarCash(app, { db, requireWorkshop, idDe, str, num, enRango, TOPE_QTY });
```

### Reglas del patrón

1. **Mismo orden de registro.** La llamada `montar<Dominio>(…)` sustituye al
   bloque *en su sitio*. Express resuelve por orden: mover una ruta cambia cuál
   gana ante un solapamiento, así que el ensamblador no reordena nada.
2. **`deps` explícitas.** El módulo no conoce el entorno de `createApp`: recibe
   por parámetro lo que necesita. Los helpers puros (`str`, `num`, `toInt`,
   `csvEscape`) y los de instancia (`db`, `requireWorkshop`, `idDe`,
   `enTransaccion`, `errorAccionable`, `TOPE_*`, `FUERA_*`) entran todos por aquí.
3. **Handlers verbatim.** El cuerpo de cada handler se copia tal cual: mismos
   `return`, mismos `status`, mismos campos. El contrato (`metodo + ruta + auth`)
   no puede moverse.
4. **`src/`, no `lib/`.** Estas rutas hablan con la base y con express: son
   servidor (AGENTS.md §3). `lib/` sigue siendo puro.
5. **Rutas nuevas van aquí, no al monolito.** La regla
   `monolito-de-rutas-congelado` de `scripts/guard.js` falla si aparece una ruta
   `/api/*` nueva en `server-pg.js`. Quitar rutas del monolito sí está permitido:
   es justo lo que hace este patrón.

### Por qué sigue cubierto por las pruebas

El escáner de rutas (`scripts/rutas.js`) y `test/helpers.js` leen `server-pg.js`
**y** todo `src/`, así que una ruta movida sigue entrando en la prueba de
contrato (`test/contract/contrato.test.js`), en la de seguridad y en
`scripts/metrics.js` sin tocar nada.

## Dominios ya extraídos

| Módulo | Rutas |
| --- | --- |
| `inventory.js` | `/api/inventory`, `/api/inventory/:id`, `/api/inventory/:id/moves`, `/api/inventory/moves`, `/api/inventory/export` |
| `clients.js` | `/api/clients`, `/api/clients/:id`, `/api/clients/:id/vehicles`, `/api/clients/vehicles/:vid` |
| `diagnostics.js` | `/api/diagnostics`, `/api/catalog/export` |
| `notes.js` | `/api/notes`, `/api/notes/:id` |
| `cash.js` | `/api/cash`, `/api/cash/:id` |
| `orders.js` | `/api/orders`, `/api/orders/:id`, `/api/orders/:id/items`, `/api/orders/:id/items/:iid`, `/api/orders/:id/photos`, `/api/orders/:id/photos/:pid`, `/api/orders/:id/status` |
| `documents.js` | `/api/documents`, `/api/documents/export`, `/api/documents/:id`, `/api/documents/:id/status`, `/api/documents/:id/print` |
| `connect.js` | `/api/connect/profiles`, `/api/connect/match`, `/api/connect/locate` |
| `notifications.js` | `/api/workshop/notifications`, `/api/workshop/notifications/:id/read`, `/api/workshop/notifications/read-all`, `/api/workshop/donations` |
| `workshops.js` | `/api/workshops/:slug`, `/api/workshops/:slug/reviews`, `/api/workshops` |
| `donations.js` | `/api/donations`, `/api/donations/public` |
| `catalog.js` | `/api/meta`, `/api/vehicles`, `/api/vehicles/:id`, `/api/vehicles/:id/comments`, `/api/modules`, `/api/modules/:id`, `/api/pumps`, `/api/pumps/:id` |
| `backup.js` | `/api/backup`, `/api/backup/import` |
| `admin.js` | `/api/admin/*` (25 rutas: login, logout, bootstrap, vehículos, marcas, pilas, búsquedas sin resultado, donaciones y talleres) |
| `auth.js` | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/password`, `/api/auth/profile`, `/api/auth/onboarding`, `/api/auth/verify/send`, `/api/auth/verify`, `/api/auth/google`, `/api/auth/google/callback` |
| `paginas.js` | SSR/HTML: `/`, `/vehiculo/:slug`, `/taller/:slug`, `/vehiculos`, `/:slug(acerca-de\|contacto\|privacidad\|terminos)`, `/guias`, `/guia/:slug`, `/sitemap.xml`, `/robots.txt`, `/ads`, `/ads.txt`, `/admin`, `/admin.js` |
| `misc.js` | **Oleada final (W6).** Los extremos del servidor, que no son un dominio de negocio ni el SSR: `GET /healthz`, `POST /api/visit`, `GET /_errores/:codigo`, el 404 JSON de `/api`, el catch-all general y el manejador de errores final. Expone además `crearPantallasError(deps)`, que devuelve `quiereHtml`/`enviarPaginaError` |

### SSR: `paginas.js` y la maqueta

`paginas.js` es el único dominio que **no** registra rutas `/api`: es todo el HTML
que sirve el servidor. La maqueta (`renderShell`) vive en
`src/views/shell.js` —no en `lib/`, porque lee `public/index.html` del disco y usa
el nonce de la respuesta— y **no** en `paginas.js`, porque la comparten el SSR y
las pantallas de error de `server-pg.js`. `server-pg.js` la construye una vez con
`crearRenderShell({ INDEX_HTML, BASE_URL, ADSENSE_CLIENT, GA_ID, SITE_OWNER,
DEFAULT_OG, esc, iframeAnuncios })` y se la pasa por `deps` a `montarPaginas`.

Aquí el **orden de registro es precedencia**, así que la llamada sustituye al
bloque en su misma posición: después de los middlewares globales, `/healthz` y
`/api/visit`, y **antes** de `express.static` y de toda la API. Tres motivos:

- `/vehiculo/:slug`, `/guia/:slug`, `/:slug(…)`, `/ads` y `/ads.txt` caen a
  `next()` cuando no les corresponde responder; si se registraran después del
  catch-all no llegarían a responder nunca.
- `/admin` y `/admin.js` sirven archivos con `Cache-Control: no-cache` propio
  (`sendFile`, con la carpeta pública por `deps`) y tienen que ir **antes** de
  `express.static`, que sí cachea.
- El resto de las páginas son 200 con su `Cache-Control` público: adelantarlas o
  retrasarlas cambia qué handler gana ante un solapamiento.


### Extremos del servidor: `misc.js`

`montarMisc(app, deps)` reúne lo que NO es un dominio ni el SSR: el sondeo de
salud, el contador de visitas, las pantallas de error y los cierres. Se llama
**al final**, después de todos los routers de la API, y dentro registra en este
orden exacto (el que tenía el monolito):

1. `GET /healthz` y `POST /api/visit` — van **antes** del 404 de `/api`, o lo
   alcanzarían.
2. `GET /_errores/:codigo` — vista previa de las cinco pantallas de error.
3. `app.use('/api', …404 JSON…)` — **después de todos los routers de la API**.
4. catch-all general — reparte HTML o JSON según lo que pida el cliente.
5. manejador de errores final — **lo último**, con aridad 4.

`/healthz` y `/api/visit` viajan con este módulo desde su posición original
(arriba, antes del SSR). Es seguro: ninguna ruta ni estático comparte su path, así
que la precedencia no cambia, y `/api/visit` sigue declarándose antes del 404 de
`/api`.

`quiereHtml`/`enviarPaginaError` las construye `crearPantallasError({ renderShell,
BRAND_LOCKUP, CONTACT_EMAIL })` —una sola vez en `server-pg.js`, después de crear
`renderShell`— y las comparten **dos** sitios: el modo mantenimiento (que se
registra al principio) y el reparto por defecto de `montarMisc` (al final).

### Middlewares globales: `src/middleware/`

La oleada final (W6) sacó de `createApp` los middlewares globales. Cada archivo
expone una función `aplicarX(app, deps)` que se llama **en el MISMO orden** en el
que estaban registrados (el orden es contrato):

| Módulo | Qué aplica |
| --- | --- |
| `seguridad.js` | `aplicarNonce(app)` (nonce por respuesta) y `aplicarSeguridad(app, …)` (helmet + CSP con hashes de los `<script>` inline de `index.html`, sin `unsafe-inline`, + Permissions-Policy) |
| `mantenimiento.js` | modo `MAINTENANCE` (503 con pantalla propia; deja pasar `/healthz` y estáticos) |
| `canonico.js` | `trust proxy` (TRUST_PROXY / TRUST_PROXY_CIDR) + redirección de host a `BASE_URL` |
| `registro.js` | `compression()` + `morgan` (`morgan.token('path', …)`) |
| `redirecciones.js` | 301 de `/index.html` y `/_*.html` → `/`, y normalización de barra final |
| `peticiones.js` | body-parser por path (20kb global; 400kb `/photos` y `/api/auth/profile`; 10mb `/api/backup`; 2mb `/api/admin/vehicles/import`) + rate-limit de `/api` + CSRF (`ft_csrf` + `X-CSRF-Token`) |
| `estaticos.js` | `express.static` de `public/` (con `/admin` y `/admin.js` **antes**, que los sirve `paginas.js`) |

Dos detalles que importan:

- **`aplicarNonce` va PRIMERO** y `aplicarSeguridad` DESPUÉS de `aplicarCanonico`
  y de `aplicarMantenimiento`: no se pueden juntar en una sola llamada, porque
  entre ellas se registran el mantenimiento y la canonicalización de host.
- El cálculo de los hashes CSP vive en `seguridad.js`. La regla
  `hashes-csp-calculados` del guard y la prueba de invariantes CSP miran ese
  módulo (y `server-pg.js`) juntos, para que el hash siga sin poder escribirse a
  mano.


### Cachés compartidas (estado de instancia única)

`metaCache` y `pumpsCache` son estado MUTABLE por proceso: el catálogo
(`catalog.js`) los LEE y el panel de admin (`admin.js`) los INVALIDA. No pueden
ser dos variables de cada módulo —una copia por módulo se desincroniza—, así que
viven en `src/services/caches.js`, un singleton con getters e invalidadores
(`leerMetaCache`/`setMetaCache`, `leerPumpsCache`/`setPumpsCache`,
`invalidarMetaCache`/`invalidarPumpsCache`/`invalidarCatalogos`). `admin.js` lo
importa para las invalidaciones; `catalog.js`, para leer y llenar.

### Constantes compartidas entre dominios

Un dominio puede tener que **exportar** algo además de `montar<Dominio>` cuando
otro módulo lo usa. El caso vivo es el respaldo (`backup.js`), que sanciona las
columnas `type`/`status` de `work_orders` y `kind`/`status` de `documents`
contra los enums:

```js
const { ORDER_TYPES, ORDER_STATUS } = require('./orders');
const { DOC_KINDS, DOC_STATUS } = require('./documents');
```

El módulo del dominio es la única copia del enum; el que lo necesite lo importa.
Duplicarlo acaba en un import que acepta un estado que la API ya no conoce.

`admin.js` es el caso de un **helper** compartido: `montarAdmin` devuelve
`{ notificarTaller }` y `server-pg.js` se lo pasa por `deps` a `montarDonations`,
para que los avisos al taller tengan una sola definición.

```js
const { notificarTaller } = montarAdmin(app, { ... });
// más abajo…
montarDonations(app, { ..., notificarTaller, ... });
```

### Limitadores

Un limitador es estado propio del dominio, así que se crea **dentro** del
módulo con las mismas opciones y los mismos topes que tenía en el monolito
(`connect.js`, `workshops.js`, `donations.js`, `catalog.js` —catalogLimiter para
el catálogo y commentLimiter para los comentarios—, `admin.js` —adminLimiter y
adminLoginLimiter, el de 5/15 min del login de admin—, el global de `/api` en
`src/middleware/peticiones.js` y los de `chat.js`, `identificador.js` y
`misc.js`). Los helpers que sí dependen de `createApp` —`db`, `requireWorkshop`,
`idDe`, `str`, `num`, `toInt`, `hashPassword`, `requireAdmin`, `errorAccionable`,
`enTransaccion`, `TOPE_*`, `esc`, `csvEscape`, `fechaISO`, `visitSalt`…— entran
por `deps`.

**El conteo ya NO vive en memoria.** Cada limitador recibe un `StoreBD`
(`src/services/rate-limit-store.js`), un Store de express-rate-limit v8 que
cuenta en la tabla `rate_limits` con la `db` que el módulo ya tiene por `deps`.
Como cada Store lleva su propio espacio de nombres (`nombre|clave`), dos
limitadores con la misma IP no comparten cupo —el aislamiento que daba el
MemoryStore— y el conteo lo ven todas las instancias y sobrevive a un reinicio.
La tabla la crea la migración versionada `003-estado-escalado`.

### Primitivas de autenticación compartidas

Las piezas que usaban varios dominios antes de existir `auth.js` viven ahora en
`src/services/auth.js` (matriz 4.8): `hashToken`, `hashPassword`/`verifyPassword`,
`normEmail`, `WEAK_PASSWORDS`, `SESSION_COOKIE`, `escMail`, `enviarCorreo`,
`CAMPOS_PERFIL`, `normalizaPerfil` y los topes del lockout. `server-pg.js` las
importa y las reparte por `deps` a los módulos que ya las recibían (chat, admin,
donations…), sin cambiar su comportamiento.

Lo que depende de la instancia de la app (la base inyectada en `createApp`) se
construye con la factoría `crearAuth({ db, PROD, SESSION_TTL_MS })`, que devuelve
`requireWorkshop`, `tokenCookieOpts`, `getDummyHash`, `lockoutLogin` y
`slugLibre`. `lockoutLogin` (estado/registrarFallo/limpiar) lee y escribe la tabla
`login_attempts` con esa misma `db`: el lockout `email|IP` ya no es un `Map` por
proceso, así que se comparte entre instancias y sobrevive a un reinicio. `admin.js`
sigue siendo el caso del *helper* compartido que viaja por `deps`
(`notificarTaller`); este es el mismo patrón, con una factoría en vez de una sola
función.

Los helpers de Google OAuth (`googleRedirectUri` y el intercambio de código)
viven en `src/routes/auth.js`: la matriz 4.4 pedía `lib/oauth-google.js`, pero
`lib/` debe seguir puro (§3) y esto lee `process.env` y habla por `fetch`.

### `server-pg.js` es un ensamblador

Con la oleada final (W6) todos los dominios de la API, el SSR, los middlewares
globales y los extremos del servidor salieron del monolito. `server-pg.js` queda
como **ensamblador**: `createApp` (la construcción de `deps`, el envoltorio de
handlers async, la lectura de `index.html` y las constantes del SSR) y las
llamadas `montarX(app, {…})` / `aplicarX(app, {…})` en su posición original. Hoy
son ~440 líneas, de las que ~200 son código (el resto es la documentación que
exige el proyecto). Nada de lógica de taller (`lib/`) ni de dominio (`src/`).

Los *catch-alls* (el 404 de `/api`, `/_errores/:codigo`, el catch-all y el
manejador de errores final) ya NO se quedan en el monolito: viven en
`src/routes/misc.js`, que se monta al final porque es el reparto por defecto de
TODO el servidor.
