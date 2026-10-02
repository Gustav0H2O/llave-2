# DECISIONES.md — el porque de FuelTech Master

Este archivo reemplaza a la documentacion de proceso (`AGENTS.md`, `ADD/`, los 33 A.SPEC,
`EMERGENCIAS-EXTERNAS.md`, los README de rutas y los informes generados).

**Se conserva lo que no se puede volver a deducir**: errores que ya ocurrieron de verdad y
que costarian horas de depuracion otra vez, y el por que de las decisiones que hoy parecen
raras. Se elimino la ceremonia: plantillas, disciplina de ramas, y los avisos que solo
repetian lo que ya dice el codigo.

---

## 1. Lo unico que hay que saber

Es la herramienta de consulta de un taller real de reparacion de **modulos y pilas (bombas)**
de gasolina. Un mecanico la abre en el celular, con las manos sucias, para decidir **si una
bomba sirve o se devuelve**. Si publicas una presion equivocada, alguien cambia una pieza
buena o deja una mala puesta. Por eso el proyecto es estricto: no es gusto por el proceso.

**Vocabulario del dueno (usalo tal cual):**

| Termino | Significa |
| --- | --- |
| **pila** | la bomba sola, en bruto, sin ensamblar |
| **modulo** | el ensamble completo que va en el tanque |
| **riel / flauta** | el conducto que alimenta los inyectores |
| **banco** | la prueba de la pila sola, sin regulador (*deadhead*) |

## 2. Como se comprueba que algo esta bien

```bash
npm run verify     # restricciones + pruebas + metricas. ~2,5 min. LA puerta.
npm run guard      # solo analisis estatico, < 1 s mientras trabajas
npm run test:unit  # reglas del taller y helpers puros
npm run metrics    # informe de calidad, escribe quality/REPORT.md
```

**No des ningun cambio por terminado con `npm run verify` en rojo.** Decir "listo" con eso roto
es el peor error que se puede cometer aqui.

Hay ademas robots de prueba masiva (`npm run robots`, ~5 min) para volumen y combinaciones
que nadie escribiria a mano. **No entran en `verify`**: hacen miles de altas y tardan minutos.

## 3. Las reglas del taller

Las dicto el dueno desde su banco de pruebas. Viven **solo** en `lib/domain.js` y estan
cubiertas por `test/unit/domain.test.js`.

### Presion en banco (pila sola, sin regulador — *deadhead*)

| Sistema | PSI |
| --- | --- |
| TBI puro | **60-70** |
| Full inyeccion (MFI) | **> 90** |
| Vortec / CSFI | **90 exactos** |

### Presion en el riel (vehiculo armado, llave ON / acelerado)

| Sistema | PSI |
| --- | --- |
| MFI generico | **50 / 60** |
| MFI familia Yaris | **38 / 44** |
| TBI (regulado en el cuerpo) | **9-13** |
| Vortec, GDI | el valor propio de cada uno; no se toca |

**Familia Yaris** = Toyota Yaris, Corolla, Corolla GR-S, Avanza (plataformas 1NZ / 2NZ / 1ZZ /
2ZR-FE). Es la **unica** excepcion a la regla de MFI, y es spec de manual, no estimacion.

### Modulo con regulador integrado

**60 PSI**, o **75 PSI** si el motor es V8 (rango de taller 60-80). Un V6 **no** sube: la regla
dice "mas de 6 cilindros".

### Consecuencias que hay que respetar

- A un **TBI nunca** se le ofrece una pila de alta: satura el regulador y **ahoga el motor**.
- El **Vortec/CSFI** exige sus 90 PSI: por debajo de 60 PSI en el riel **los poppets no abren y
  el motor no enciende**. Tiene catalogo de pilas propio (`CLASS_PUMPS.VORTEC`) que **no
  comparte** con MFI.
- En **GDI**, la pila del tanque es la de **baja**; la de alta es mecanica y va en el motor.

**Para cambiar una regla hacen falta, en el mismo commit:** el cambio en `lib/domain.js`,
el cambio en la prueba correspondiente, y **de donde salio el dato nuevo** (manual, banco,
medicion). Cambiar la prueba para que pase es la forma mas rapida de publicar un dato falso.

## 4. Trampas del proyecto (todas ocurrieron de verdad)

Esta seccion es la mas valiosa del archivo. Cada punto costo horas de depuracion.

### 4.1 `await` en todo lo que toque la base

`db.get/all/run/exec/insertReturningId` devuelven **promesas**. Sin `await`:

```js
const total = await statsDb.get('...')?.value;   // MAL: lee .value de la PROMESA
const total = (await statsDb.get('...'))?.value; // BIEN
```

El contador de visitas estuvo clavado en 0 por exactamente esto. `createVehicle()` sin
`await` devolvia `{"id":{}}` al panel, y `updateVehicle()` sin `await` podia **tumbar el
proceso** (Node aborta ante un rechazo sin capturar).

### 4.2 Los parametros van en un **array**

`db.run(sql, params)` recibe **dos** argumentos:

```js
db.run('UPDATE v SET a=? WHERE id=?', valor, id);    // MAL: el id se descarta en silencio
db.run('UPDATE v SET a=? WHERE id=?', [valor, id]);  // BIEN
```

Marcar un vehiculo como verificado no funciono nunca por este error.

### 4.3 Valida el id **antes** de consultar

`toInt()` devuelve `null` para basura, y pasar `null` a un `?` hace que better-sqlite3 lance.

### 4.4 Express 4 no captura promesas rechazadas

Hay un envoltorio en `server-pg.js` (busca `const envolver =`) que manda los rechazos a
`next(err)`. **No lo quites.** Sin el, un error en una ruta `async` deja la peticion **colgada
para siempre**: sin respuesta, sin log, sin 500.

### 4.5 Todo dato del taller se filtra por `workshop_id`

Los talleres comparten tablas. Una consulta sin ese filtro es una fuga de datos entre
negocios. Va en **todas**: `SELECT`, `UPDATE` y `DELETE`, aunque ya hayas comprobado la
propiedad antes.

### 4.6 Escapa el HTML del servidor con `esc()` de `lib/pure.js`

No escribas otra funcion de escape. Dos escapes que se separan son un XSS esperando.

### 4.7 La CSP calcula sus hashes sola

Los hashes de los `<script>` inline de `index.html` se calculan leyendo el archivo, y se
normaliza CRLF -> LF porque el proyecto se edita en Windows. **Nunca escribas un hash a mano:**
caduca en silencio y el navegador bloquea el script sin que el servidor se entere.

### 4.8 Convenciones de htm + React

El frontend no tiene build step. Usa `htmlFor` y `maxLength` (no `for` ni `maxlength`).
`class=` si es la convencion establecida aqui.

**Y el mas caro de todos, descubierto el 2026-10-01:** dentro de una plantilla htm, un
comentario `/* */` **NO es un comentario**. htm lo mete como hijo de texto y React revienta con
el error #31 ("objects are not valid as a React child"). Los comentarios van **fuera** del
marcado, o dentro de una interpolacion `${...}` sin anidar otras llaves.

### 4.9 Las estadisticas viven en otra base

`stats.db` esta separada de `fueltech.db` porque el seed borra el catalogo entero. No muevas
el contador de visitas ahi.

### 4.10 El modelo de Gemini tiene que existir

`gemini-3.5-flash` **no es un id real** y hacia que el chat respondiera 502.

### 4.11 El taller entra y se da de alta SOLO con Google

`POST /api/auth/register` y `POST /api/auth/login` responden **403** cuando
`NODE_ENV=production`. El correo del taller es el que Google ya verifico, asi que no hace
falta Resend ni una contrasena. Si faltan `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` en
produccion, **nadie puede entrar ni registrarse**.

### 4.12 Comentar exige cuenta, y el nombre lo pone el servidor

`POST /api/vehicles/:id/comments` lleva `requireWorkshop` e **ignora** cualquier
`author_name` del cuerpo. Antes era publico y aceptaba un nombre libre, asi que cualquiera
podia firmar como otro taller. Ese 401 en la escritura es la puerta, no un estorbo.

### 4.13 Una URL con vehiculo arranca en la ficha, no en la portada

`readURLState()` lee el vehiculo de `?v=` o del `data-vehicle` que el servidor inyecta en
`/vehiculo/:slug`. El estado inicial es `'search'` cuando la URL trae vehiculo. Si tocas el
arranque de `App`, no vuelvas a fijar `viewState` a `'home'` sin mirar esto.

### 4.14 El boton flotante tiene que ser `fixed`, no `absolute`

Con `position: absolute` contra un contenedor cuya altura la manda el contenido, con la
lista vacia el ancla cae a media pantalla y el buscador pegajoso de la cabecera (`z-index 30`)
queda **justo encima**. El toque abre el desplegable de al lado en vez del formulario.
Descubierto el 2026-10-01: el "+" de Documentos no abria nada con la lista vacia.

### 4.15 Las clases del JSX tienen que existir en alguna hoja

El campo de precio de una partida llevaba `class="styled-input w-24"` y **`w-24` no estaba
definida en ninguna parte del proyecto**. Heredaba `width:100%` de `.styled-input` y, por como
flexbox reparte el encogimiento segun el `flex-basis`, absorbiendo el 89% dejaba la
descripcion de la partida en **~10 px** medidos a 390. Una clase fantasma no da error:
da un layout que parece casi bien.

### 4.16 Las versiones `?v=` hay que subirlas al tocar el archivo

Los assets se sirven con `?v=N` desde `index.html`. Si cambias el archivo y no subes el
numero, el navegador sigue usando el viejo y **tu arreglo no se ve** — o peor, los clientes con
cache siguen viendo el fallo. Hoy: `datos.js?v=4`, microapps.js?v=16`,
`microapps-taller.js?v=11`, `microapps-taller-2.js?v=3`, `app.js?v=15`, `taller.css?v=4`.

### 4.17 Los modelos de datos se filtran por tipo de linea, no por texto

El tipo de una partida (repuesto vs mano de obra) se infiere hoy parseando el prefijo del
texto. Es fragil. Si tocas esa zona, pasalo a un campo estructurado.

## 5. Donde va cada cosa

```
lib/catalog.js     DATOS: vehiculos, pilas, textos por zona. Sin logica.
lib/domain.js      REGLAS del taller. Puro, sin base de datos ni entorno.
lib/pure.js        Helpers puros del servidor (toInt, esc, slugify...)
db.js              Adaptador para SQLite / Turso / PostgreSQL.
seed.js            Solo orquesta la siembra. NO tiene reglas.
server-pg.js       ENSAMBLADOR: monta middlewares y routers, y arranca.
src/config/        Configuracion del entorno, leida y validada una sola vez.
src/routes/        Un modulo por dominio (montarX(app, deps)).
src/middleware/    CSP/nonce, CSRF, body-parser por ruta, redirects, estaticos.
src/services/      chat, identificador, anuncios, auth (primitivas), caches.
src/views/shell.js La maqueta del SSR (renderShell + pie legal).
src/db/            Migraciones versionadas (runner + versiones).
public/            Frontend sin build step (React 18 UMD + htm).
scripts/guard.js   Motor de restricciones.
scripts/metrics.js Metricas + trinquete de calidad.
scripts/qa.js      npm run verify.
quality/           Presupuestos, deuda aceptada, referencia e informe.
```

**`lib/` tiene que seguir siendo puro.** Nada de `require('./db')`, express, `process.env` ni
`console.log`. Es lo que permite probar las reglas del taller sin levantar nada, y hay una regla
del guard que lo vigila.

**`src/` es lo contrario:** codigo de servidor que si depende del entorno, de express o de la
base de datos, pero que no tiene por que vivir dentro de `server-pg.js`. Nada de logica del
taller ahi: eso es `lib/`.

## 6. Que hacer al agregar cosas

**Ruta nueva en la API?**
1. Si toca datos del taller: `requireWorkshop` + filtro `workshop_id`.
2. Prueba del caso feliz **y** del caso de error.
3. Errores como `res.status(4xx).json({ error: 'mensaje en espanol' })`.
4. Datos privados con `Cache-Control: no-store`.
5. Hay una prueba de contrato que falla si la ruta nueva no aparece en el snapshot:
   `ACTUALIZAR_CONTRATO=1 node --test test/contract/contrato.test.js` para regenerarlo.

**Vehiculo o pila nueva?**
1. Va en `lib/catalog.js`, respetando la forma de la fila.
2. Si el dato no es de manual, marcalo con `verified = 0`: saldra con el aviso
   ESTIMADO en la ficha. Es honestidad con el mecanico, no un detalle.
3. `npm run test:unit` valida forma, rangos, duplicados y solapes.

**Funcion pura nueva?** Va en `lib/`, con su archivo en `test/unit/`.

## 7. Seguridad al correr pruebas

**El `.env` apunta a la base de PRODUCCION en Turso.** Por eso:

- Toda prueba monta la app con `test/helpers.js`, que usa bases **en memoria** y el
  adaptador en modo **`'local'`** (ignora `TURSO_URL` aunque este puesta).
- **Nunca** ejecutes `npm run seed` ni `FORCE_SEED=1` sin saber a que base apunta el
  entorno. Para probar la siembra en local:
  `TURSO_URL= TURSO_AUTH_TOKEN= FORCE_SEED=1 node seed.js`
- Los robots de `test/robots/` **vacian `TURSO_URL`, `TURSO_AUTH_TOKEN` y
  `DATABASE_URL` antes de importar nada**. No es paranoia: `db.js` carga dotenv, dotenv lee
  el `.env` del repo (que apunta a produccion) y la conexion se abre sola despues de la
  comprobacion. Dejarlas presentes y vacias hace que dotenv no las pise. **No muevas ese bloque
  debajo de los `require`.**

## 8. Presupuestos y trinquete

- `quality/budgets.json` — tamanos, latencias y topes estructurales. **Subir un numero aqui
  para que pase el build es hacer trampa:** primero averigua por que se rompio, y paga con codigo
  muerto o mudando lo que no cabe. Si de verdad hace falta subirlo, el propio archivo tiene
  entradas `_comentario_*` donde se escribe **por que** y cuanto ocupa de verdad.
- `quality/baseline.json` — el trinquete. Las metricas pueden mejorar libremente;
  empeorar falla. Si el retroceso es deliberado: `npm run metrics:aceptar`.
- `quality/known-issues.json` — la **unica** puerta por la que una violacion pasa sin
  romper el build. La lista **solo puede encoger**.
- `quality/REPORT.md` y `quality/ROBOTS.md` — informes **generados**. No se editan a
  mano; se regeneran con `npm run metrics` y `npm run robots:informe`.

## 9. Estado actual

| | |
| --- | --- |
| Pruebas | **869**, todas en verde |
| Cobertura de `lib/` | **100 %** |
| Rutas de API | **130**, 100 % con prueba |
| Reglas de restriccion | **20**, 0 violaciones |
| Catalogo | 294 vehiculos, 37 marcas, 10 pilas |

Consulta `quality/REPORT.md` para el estado al dia.

## 10. Pendiente de decision del dueno

Cinco problemas reales de datos detectados, que necesitan conocimiento del negocio:

1. **Renault Kwid 2019-2024** duplicado (dos filas MFI iguales salvo L4 vs L3; el Kwid es
   tricilindrico).
2. **Mitsubishi L200** — solape 2010-2015 donde las dos filas **se contradicen** en si lleva
   retorno. Es el mas grave: genera despieces incompatibles para el mismo auto.
3. **Chevrolet Tracker** — solape 2020-2024 con presiones distintas.
4. **Renault Duster** — solape 2013-2019 duplicado.
5. **AIRTEX E8213 (universal)** — pila definida que ninguna clase ofrece.

## 11. Lo que NO se debe hacer

- Cambiar una prueba de `test/unit/domain.test.js` para que pase, sin fuente.
- Subir un presupuesto o agregar deuda para desbloquear el build.
- Borrar una regla del guard en vez de arreglar lo que senala.
- Usar logotipos de armadoras (Chevrolet, Nissan...). El logo siempre es la marca propia FuelTech.
- Inventar datos tecnicos. Si no lo verificaste, va con `verified = 0`.
- Sembrar o migrar contra Turso sin que el dueno lo pida.
- Dar por terminado un cambio con `npm run verify` en rojo.
- Firmar un commit con otra identidad o anadir `Co-authored-by:`.

## 12. Git: un solo autor

El repositorio tiene **un unico contribuidor**. Los hooks de `.githooks/` lo imponen:

| Hook | Que impone |
| --- | --- |
| `pre-commit` | Restricciones del proyecto + la suite de pruebas. |
| `commit-msg` | El autor del commit tiene que ser el dueno; quita trailers ajenos. |
| `pre-push` | Si el historial tiene firmas ajenas, **no publica**. |

Se activan solos al correr `npm install`. La **unica fuente de verdad** de quien puede firmar es
`scripts/git-identidad.js`.

```bash
npm run git:auditar            # revisa el historial y avisa de firmas ajenas
npm run git:limpiar -- --si    # reescribe el historial dejando solo al dueno
```

---

## 13. Historial de decisiones (antes: ADD/aspecs/FT-*)

Cada linea es un cambio que se hizo y **por que**. Se conservan porque el codigo hoy parece
raro sin ellas. Los detalles completos estan en el historial de git: cada cambio fue un commit.

| ID | Que se hizo | Por que |
| --- | --- | --- |
| FT-0001 | Adoptar ADD como disciplina de cambio | El historial tenia commits multi-proposito imposibles de revertir |
| FT-0002 | Securizar /api/connect/* | Auditoria P0: perfiles y match exponian datos sin control |
| FT-0003 | Hash de contrasenas asincrono (scrypt) | scryptSync bloqueaba el event loop en cada login |
| FT-0004 | Topes consistentes en listados | El robot de carga: inventario y clientes devolvian TODO |
| FT-0005 | 404 propio en espanol | Cualquier ruta desconocida caia al 404 por defecto de Express |
| FT-0006 | SSR persistente sin takeover de React | Guias, legales y perfiles servian HTML que React borraba |
| FT-0007 | Titulos de pagina <=70 caracteres | Titulos de 84 chars se cortan en el buscador |
| FT-0008 | Guias abre pantalla propia | La tarjeta hacia cosas distintas segun de donde vinieras |
| FT-0009 | Modo cliente en el asistente de IA | Las busquedas mas voluminosas son de clientes, no de mecanicos |
| FT-0011 | Chat por OpenRouter con limites | Dependia de GEMINI_API_KEY, nunca configurada en local |
| FT-0012 | Interfaz y accesibilidad | Auditoria Nielsen/WCAG dejo brechas baratas de cerrar |
| FT-0013 | Portada rastreable sin JavaScript | Auditoria SEO: la home no tenia contenido sin JS |
| FT-0014 | Extraer chat y config de server-pg.js | El monolito estaba en 3 849 lineas contra un tope de 3 850 |
| FT-0015 | Extraer ordenes, documentos, connect... | Segunda oleada de vaciado del monolito |
| FT-0016 | Extraer el panel de administracion | Tercera oleada |
| FT-0017 | Extraer el SSR/HTML | Cuarta oleada |
| FT-0018 | Pulir la cascara movil | El celular es donde se usa, y la capa movil tenia tres fallos |
| FT-0019 | Mejorar las diez apps de Consulta | Es el nucleo del producto |
| FT-0020 | Unificar el enrutado, retirar legacy | openMicro evaluaba un mapa antes de que existiera el registro |
| FT-0021 | Parte superior en celular | El dueno reporto que seguia fallando |
| FT-0022 | Diagnostico del acceso con Google | El dueno reporto que no podia entrar |
| FT-0023 | Los datos de negocio solo en la nube | Se guardaban en el navegador y se perdian |
| FT-0024 | Ver un despliegue sin vaciar cache | Habia que borrar la cache a mano para ver cambios |
| FT-0025 | La portada es el inicio, no el catalogo | React ya arrancaba en home pero la URL no |
| FT-0026 | Recargar cae siempre en el inicio | Al recargar volvia al catalogo de combustible |
| FT-0027 | Versionar el codigo por despliegue | El dueno seguia viendo ?v=26 al recargar |
| FT-0028 | Unificar el contacto del pie | El pie mostraba dos contactos distintos |
| FT-0029 | Licencia de propietario | El repo es publico y no tenia LICENSE |
| FT-0030 | Titularidad real y alcance | Tres huecos en la licencia anterior |
| FT-0031 | Operacion diaria del taller | Tres pantallas prometian mas de lo que daban |
| FT-0032 | Seccion taller unificada | Habia crecido a dieciseis tarjetas sueltas |

---

## 14. Cambios del 2026-10-01 (auditoria completa)

| Que | Donde | Por que |
| --- | --- | --- |
| **Ordenes volvio a abrir** | `microapps-taller.js` | Leia `orders` una linea antes de declararlo (zona muerta temporal de `const`). ReferenceError en el primer render = pantalla blanca. |
| **Limite de error** | `app.js` | No existia ninguno: cualquier error de render dejaba la pantalla muda. Ahora muestra el fallo y deja volver. |
| **La fila de partidas no se aplasta** | `taller.css` | La clase `w-24` no existia y la descripcion quedaba en ~10 px a 390. |
| **El boton + recibe el toque** | `taller.css` | El FAB estaba en `absolute` bajo el buscador pegajoso: no abria el formulario. |
| **La cantidad se teclea** | `microapps-taller.js` | Era un span de solo lectura: 12 unidades o 3,75 h eran imposibles. |
| **Tipo Cotizacion en el selector** | `microapps-taller.js` | El backend lo soportaba y la UI lo omitia. |
| **Telefono con codigo de pais** | `microapps.js`, `datos.js` | wa.me EXIGE el prefijo: sin el, el boton de WhatsApp fallaba. |
| **Taller en segundo lugar** | `microapps.js` | Es la razon por la que un taller entra todos los dias. |
| **Snapshot de rutas regenerado** | `test/contract/rutas.json` | Ya estaba desactualizado antes de esta auditoria (dos rutas de caja sin registrar). |

---

## 15. Emergencia de seguridad abierta

**Esto NO esta cerrado y NO se borra.** El antiguo `EMERGENCIAS-EXTERNAS.md` documentaba una
brecha en el repositorio publico `github.com/Gustav0H2O/llave.git`: el blob
`/raw/10c1752/llave.db` sigue descargable y contiene **13 hashes de contrasena (scrypt),
11 sesiones y 2 perfiles de contacto**, contra la misma base de produccion en Turso.

Los pasos completos estan en el historial de git (`git show <commit>:EMERGENCIAS-EXTERNAS.md`)
o en el backup `bombas de gasolina-COPIA-SEGURIDAD-2026-09-11`. Resumen:

1. **Rotar `TURSO_AUTH_TOKEN`** en console.turso.tech y actualizarlo en Render y en el `.env` local.
2. **Invalidar TODAS las sesiones** en Turso (los 11 `sessions.token_hash` expuestos).
3. Rotar las claves de Groq, OpenRouter y Google Cloud si estaban en el mismo entorno.
4. Purgar el blob del historial de GitHub (`git filter-repo` o BFG).
5. Volver a comprobar que el blob ya no responde 200 anonimo.

**Rotar NO es opcional aunque se purgue el historial.** El blob pudo descargarse ya: purgar quita
el acceso futuro, **no invalida** lo copiado. Purga sin rotacion = emergencia sin cerrar.

---

## 16. Limitaciones conocidas (antes de promocionar)

Lo que un taller ajeno va a notar y todavia no esta resuelto:

- ~~No hay Excel ni PDF reales~~ **RESUELTO el 2026-10-02.** Ver la seccion 17.
- ~~**Clientes:** sin exportacion, sin busqueda, y el campo Km actual escribe en `notes`~~
  **RESUELTO el 2026-10-02**: `GET /api/clients/export` (CSV/XLSX/PDF), buscador por
  nombre/documento/telefono/ciudad/correo, y el campo Km ahora escribe en `mileage`.
- ~~**Agenda:** solo vista Dia y Semana~~ **RESUELTO el 2026-10-02**: rejilla horaria,
  vista de mes 6x7, horario configurable, duracion, mecanico asignado y catalogo de servicios.
- **Documentos:** ya hay desglose fiscal real (subtotal, descuento, IVA sobre la base ya
  descontada) que se imprime en el PDF y viaja al emitir. **Lo que sigue sin resolverse:**
  no hay previsualizacion antes de emitir, no se puede corregir uno ya emitido (no existe
  `PUT /api/documents/:id`), ni RUC/NIT fiscal, ni validez, ni condiciones de venta.
- ~~**Checklist:** los puntos salen de una plantilla fija~~ **RESUELTO el 2026-10-02**:
  cada taller tiene su plantilla (`checklist_template`), editable desde la pestana
  «Plantilla». Las inspecciones ya creadas no se tocan: un hallazgo de la recepcion es un
  hecho del dia, no una preferencia. La lista sigue pintando hasta 200 puntos sin paginar.
- ~~**Tiempos:** catalogo fijo en `public/datos.js`~~ **RESUELTO el 2026-10-02**:
  `labor_catalog` por taller, con alta/edicion/borrado desde la app. La referencia de
  fabrica se materializa solo si el taller la pide (`POST /api/labor/seed`), para que
  borrarla entera no la resucite sola.
- ~~**Inventario:** maneja productos, no servicios~~ **PARCIAL el 2026-10-02**: cada
  artículo se clasifica como repuesto, servicio o consumible (`item_tipo`), con su filtro
  «Servicios». **Lo que sigue:** no hay catalogo para enviar a clientes ni forma de
  compartir entre talleres. El CSV incluye `cost_price`: **no enviarlo a un cliente**.

El informe completo de esta auditoria, con archivo:linea y el plan por bloques, esta en
`AUDITORIA-FUELTECH.md`.

---

## 17. Exportacion real: Excel y PDF (2026-10-02)

Antes, "PDF" era el dialogo de imprimir del navegador (Ctrl+P y elegir "Guardar como PDF") y
"Excel" era un CSV con coma y sin BOM que Excel en espanol abria en **una sola columna** y con
los acentos rotos ("Pérez" salia como "PÃ©rez"). La promesa de `public/datos.js` —"presupuestos
en PDF sin marca de agua"— no la cumplia el codigo.

**Ahora:**

| Que | Donde | Como |
| --- | --- | --- |
| Excel (.xlsx real) | `GET /api/documents/export?format=xlsx` | Libro de verdad: Excel lo abre, los numeros suman |
| PDF de la lista | `GET /api/documents/export?format=pdf` | Con cabecera del taller, filas y total |
| PDF de un documento | `GET /api/documents/:id/pdf` | Cabecera, cliente/vehiculo, partidas, total y firmas |
| Excel del almacen | `GET /api/inventory/export?format=xlsx` | Para mandar a la repuestera |
| CSV | ambos | Ahora con **punto y coma y BOM UTF-8** |

**Sin dependencias nuevas.** `src/services/exportar.js` genera el PDF y el XLSX a mano: el
proyecto no tiene build step y no cabe una libreria de 1,5-2 MB en el presupuesto de descarga
para algo que solo se usa aqui. El XLSX es un ZIP sin comprimir (metodo "stored"), que es
valido y evita implementar DEFLATE.

**Aviso al tocar esto:** el PDF usa WinAnsi (Latin-1). Un caracter fuera de ese rango hay que
sustituirlo o **corrompe el archivo entero**; `soloLatin` se encarga. Si algun dia hace falta
maquetar algo complejo, la conversacion cambia y habra que justificar una dependencia.

**Verificado con lectores reales**, no solo "no falla": openpyxl abre el .xlsx y lee los
numeros como `float`; el PDF tiene cabecera, `xref` y `%%EOF` correctos.

---

## 18. Los scripts de desarrollo ya no pueden tocar produccion

**Lo que paso.** Verificando arreglos en un navegador real, arranque el servidor con
`node server-pg.js` sin neutralizar el entorno. El `.env` del repo apunta a Turso
**produccion**, asi que los scripts de Puppeteer escribieron ahi: **26 talleres de prueba** con
sus clientes, piezas, ordenes y documentos, mezclados con los talleres reales.

Las suites de `npm test` nunca tuvieron este problema: `test/helpers.js` monta bases en
**memoria** y fuerza el modo `'local'` del adaptador. El agujero estaba en los scripts sueltos.

**Como se cierra.**

```bash
npm run dev                 # puerto 3000, SQLite LOCAL, ignora Turso
npm run dev -- --puerto=3111
```

`scripts/dev-server.js` neutraliza `TURSO_URL`, `TURSO_AUTH_TOKEN` y `DATABASE_URL`
**antes de cargar nada** —el bloque va primero, porque `db.js` carga dotenv y abre la conexion
con solo mirar `process.env`— y avisa por consola si las encontro puestas.

**Regla:** para verificar en navegador, usa `npm run dev`. **Nunca `node server-pg.js` a secas**
si vas a crear datos: ese arranca contra lo que diga el `.env`, y el `.env` apunta a produccion.

La limpieza de las 26 cuentas esta en `limpieza-cuentas-de-prueba.sql` (revisar antes de
ejecutar: comprueba que el id 3 siga siendo de prueba).

---

## 19. Emergencia de seguridad: estado real al 2026-10-02

Comprobado en vivo, no fiado del documento anterior:

| Comprobacion | Resultado |
| --- | --- |
| `github.com/Gustav0H2O/llave.git` (el repo viejo) | **404** — ya no existe |
| El blob `/raw/10c1752/llave.db` | **404** — ya no responde |
| Repo actual `llave-2.git` | Nunca tuvo un `.db` ni un `.env` en su historial |
| `.db`/`.env` rastreados ahora | Ninguno |
| `.gitignore` | Los cubre (`*.db`, `.env*`) |

**Lo que sigue abierto:** habia **dos tokens de Turso vivos** a la vez (el del `.env` y otro
distinto). Ambos respondian 200 contra la base de produccion. Si el par checo estuvo alguna vez
en un blob publico, hay que **rotarlo y revocar el anterior**, no solo crear uno nuevo:

1. `console.turso.tech` → base de produccion → Tokens → **revocar los antiguos**.
2. Actualizar `TURSO_AUTH_TOKEN` en Render y en el `.env` local.
3. Invalidar **todas** las sesiones (los `sessions.token_hash` estuvieron expuestos).
4. Rotar Groq / OpenRouter / Google Cloud si compartian entorno.

**Rotar no es opcional aunque el blob ya no responda:** pudo descargarse antes de que lo
borraran. Purgar quita el acceso futuro, no invalida lo ya copiado.

---

## 20. El taller deja de ser de un solo archivo (2026-10-02)

Cuatro limitaciones de la seccion 16 quedaron cerradas, y las cuatro son la misma
decision de fondo: **un dato que pertenece al taller deja de ser una constante del
codigo.** El taller es el cliente, asi que su catalogo de tiempos, su plantilla de
recepcion y su desglose fiscal son suyos, no nuestros.

| Que | Como se resolvio |
| --- | --- |
| Tiempos fijos | `labor_catalog` por taller + `GET/POST/PUT/DELETE /api/labor` |
| Checklist fijo | `checklist_template` por taller + `GET/POST/PUT/DELETE /api/inspections/template` |
| IVA como renglon de texto | `documents.subtotal/descuento/iva_pct/iva`, impresos en el PDF |
| Inventario solo de piezas | `inventory_items.item_tipo` = repuesto \\| servicio \\| consumible |

**La regla que comparten las tres primeras: la referencia de fabrica NO se siembra sola.**
`GET /api/labor` y `GET /api/inspections/template` devuelven los valores de referencia
marcados con `deFabrica: true` y **no escriben nada**; la tabla del taller se materializa
solo cuando el taller pulsa «Personalizar» (`POST .../seed`). Si se sembrara al vuelo,
borrar el catalogo entero lo resucitaria en el siguiente `GET` — y un taller que decide
que no quiere un punto lo tendria de vuelta sin haberlo pedido.

**Consecuencias que se aceptaron a proposito:**

- **El IVA se calcula sobre la base ya descontada**, no sobre el subtotal: descontar
  antes de taxpagar es lo que separa un desglose correcto de uno que multiplica dos veces
  (prueba 21c). El cotizador dejo de cocer el descuento en los precios unitarios y de
  mandar el IVA como renglon de texto; ahora manda `descuento_pct` e `iva_pct` y el
  servidor hace la cuenta, que es lo unico que permite que el PDF diga de donde sale el total.
- **`total` no cambio de significado**: sigue siendo el importe a cobrar (subtotal −
  descuento + IVA). Todo lo que ya lo leia sigue leyendo lo mismo; solo se anadio de
  donde sale.
- **Las filas de inventario ya escritas quedan con `item_tipo = NULL`.** Reclasificar solo
  seria adivinar que es un articulo que el taller nunca dijo.
- **Las inspecciones ya creadas no se tocan** al editar la plantilla: un hallazgo de la
  recepcion (`malo`) es un hecho del dia, no una preferencia del taller.

**Y una mudanza de piso, que es la parte menos obvia.** Los tres primeros cambios
metieron ~10 KB mas en el frontend, y `microapps.js` estaba contra sus **dos** topes a la
vez (299,3 KB contra 297 y 4.783 lineas contra 4.750). Subir cualquiera de los dos habria
sido tapar la senal del monolito en vez de responder a ella, asi que **Tiempos se mudo a
`microapps-agenda.js`**, el archivo que ya era del taller (ademas `labor` esta registrado
en el grupo `taller` del panel, no en el de Consulta: siempre fue una pantalla del taller
que vivia en el archivo equivocado). El costo: dos etiquetas `<script>` mas en `index.html` y un
presupuesto mas que vigilar. La prueba `test/qa/movil-pwa.test.js` sigue vigilando que las
listas de exportacion de los dos archivos no se solapen, y se paso sin tocarla.

