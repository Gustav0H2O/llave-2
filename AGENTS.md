# Reglas del proyecto — FuelTech Master

**Léeme entero antes de tocar una línea.** Este archivo es el contrato de trabajo
para cualquier persona o IA que edite este repositorio. No es documentación
opcional: casi todo lo que dice está respaldado por una prueba o por una regla
de `scripts/guard.js` que va a fallar si lo ignoras.

---

## 0. Lo mínimo que tienes que saber

FuelTech Master es la herramienta de consulta de un taller real de reparación de
**módulos y pilas (bombas) de gasolina** en Latinoamérica. Un mecánico la abre en
el celular, con las manos sucias, para decidir **si una bomba sirve o se
devuelve**. Si publicas una presión equivocada, alguien cambia una pieza buena o
deja una mala puesta.

Por eso este proyecto es estricto. No por gusto por el proceso.

**Vocabulario del dueño (úsalo tal cual):**

| Término | Significa |
| --- | --- |
| **pila** | la bomba sola, en bruto, sin ensamblar |
| **módulo** | el ensamble completo que va en el tanque |
| **riel / flauta** | el conducto que alimenta los inyectores |
| **banco** | la prueba de la pila sola, sin regulador (*deadhead*) |

---

## 1. El único comando que importa

```bash
npm run verify
```

Corre restricciones + pruebas + métricas en unos 17 segundos. **No des ningún
cambio por terminado hasta que salga en verde.** Decir "listo" con esto en rojo
es el peor error que puedes cometer aquí.

Mientras trabajas:

```bash
npm run guard:rapido    # < 1 s, solo análisis estático
npm run test:unit       # reglas del taller y helpers puros
npm run test:qa         # seguridad, contrato, datos, rendimiento
npm run metrics         # informe de calidad → quality/REPORT.md
```

### Robots de prueba masiva (aparte de `verify`)

```bash
npm run robots              # los siete, ~5 min
npm run robots:rapido       # tandas cortas y sin navegador, ~30 s
npm run robots:informe      # los siete + escribe quality/ROBOTS.md
npm run robots -- --solo=aislamiento
```

`verify` comprueba casos escritos a mano y tiene que seguir tardando segundos.
Los robots hacen lo contrario: volumen y combinaciones que nadie escribiría a
mano. Por eso viven en `test/robots/` y **no** entran en `verify`.

| Robot | Qué busca |
| --- | --- |
| `registro` | validación del alta, normalización, limitador, altas masivas, carrera por el mismo correo, ciclo de sesión |
| `aislamiento` | fugas entre talleres: lee las rutas protegidas de `server-pg.js` y las ataca **todas** desde una cuenta ajena |
| `fuzz` | ~2.900 cargas hostiles: nunca un 500, nunca una petición colgada, nunca tripas del servidor |
| `carga` | escalado con 800 filas, listados sin tope, concurrencia, escritura sostenida |
| `recorrido` | **todas** las páginas del `sitemap.xml`: estado, título, canónica, JSON-LD, enlaces rotos, 404 propios, cabeceras, y si el HTML servido sobrevive al arranque de React |
| `jornada` | alta tecleada en el formulario real + las 38 herramientas abiertas con y sin sesión, escritura verificada contra la base |
| `interfaz` | navegador real: contraste compuesto, desbordes, scroll anidado, objetivos táctiles, en 2 temas × 3 anchos |

`quality/ROBOTS.md` es el informe generado. **No se edita a mano**, igual que
`quality/REPORT.md`.

**Están en `test/` a propósito.** Ahí los cubre la regla
`pruebas-nunca-tocan-bases-reales` del guard. Un robot que crea miles de
talleres es exactamente lo que no puede apuntar nunca a Turso.

Y `test/robots/comun.js` **vacía `TURSO_URL`, `TURSO_AUTH_TOKEN` y
`DATABASE_URL` antes de importar nada**. No es paranoia de más: comprobar el
entorno no bastaba, porque `db.js` carga dotenv, dotenv lee el `.env` del repo
—que apunta a producción— y la conexión se abría sola después de la
comprobación. Dejarlas presentes y vacías hace que dotenv no las pise y que
`db.js` caiga en SQLite local pase lo que pase. **No muevas ese bloque debajo
de los `require`.**

Cuando un robot falla, la línea `✗` dice qué esperaba y qué pasó. Antes de
tocar la aplicación, comprueba si el fallo es del robot: varios de los primeros
lo fueron (ids que se repiten entre tandas porque cada tanda estrena base, o el
propio texto de ataque devuelto como eco).

---

## 1b. Todo cambio entra como A.SPEC

Este repo opera bajo **ADD (Atomic Development Discipline)**: cada cambio se
diseña, implementa y valida como unidad mínima, independiente, trazable y
reversible. La doctrina está en `ADD/` (empieza por `ADD/README.md`); lo
operativo, en cuatro líneas:

1. **La A.SPEC se escribe antes del código**, en
   `ADD/aspecs/FT-XXXX-<verbo>-<objeto>.md`, con la plantilla
   `ADD/ASPEC-TEMPLATE.md`.
2. **`VERIFICATION` solo cita comandos de `ADD/VERIFY.yaml`**: nada
   inventado, el verifier lee el binding y nada más.
3. **`npm run verify` en verde sigue siendo la puerta** — ADD no agrega
   verificación, exige declarar cuál corrió y qué invariante cubría. Si el
   cambio toca auth, sesiones, aislamiento, catálogo, CSP o el chat de IA
   (blast radius alto): añade `npm run robots:rapido`.
4. **1 A.SPEC = 1 rama `add/FT-XXXX-…` = 1 squash-commit en `master`**
   (GitFlow Lite). Encontraste una mejora por el camino: no la metas, es
   otra A.SPEC (*no opportunistic refactoring*, `ADD/SPECIFICATION.md` §4).

La A.SPEC es contrato, no burocracia: si un cambio no cabe en una página
WHY → ROLLBACK, es que todavía no se entiende el cambio.

## 2. Las reglas del taller (lo más importante del proyecto)

Las dictó el dueño desde su banco de pruebas. Viven **solo** en `lib/domain.js` y
están cubiertas por `test/unit/domain.test.js`.

### Presión en banco (pila sola, sin regulador — *deadhead*)

| Sistema | PSI |
| --- | --- |
| TBI puro | **60–70** |
| Full inyección (MFI) | **> 90** |
| Vortec / CSFI | **90 exactos** |

### Presión en el riel (vehículo armado, llave ON / acelerado)

| Sistema | PSI |
| --- | --- |
| MFI genérico | **50 / 60** |
| MFI familia Yaris | **38 / 44** |
| TBI (regulado en el cuerpo) | **9–13** |
| Vortec, GDI | el valor propio de cada uno; no se toca |

**Familia Yaris** = Toyota **Yaris, Corolla, Corolla GR-S, Avanza** (plataformas
1NZ / 2NZ / 1ZZ / 2ZR-FE). Es la **única** excepción a la regla de MFI, y es una
spec de manual, no una estimación.

### Módulo con regulador integrado

**60 PSI**, o **75 PSI** si el motor es V8 (rango de taller 60–80). Un V6 **no**
sube: la regla dice "más de 6 cilindros".

### Consecuencias que hay que respetar

- A un **TBI nunca** se le ofrece una pila de alta: satura el regulador y **ahoga
  el motor**.
- El **Vortec/CSFI** exige sus 90 PSI: por debajo de 60 PSI en el riel **los
  poppets no abren y el motor no enciende**. Tiene catálogo de pilas propio
  (`CLASS_PUMPS.VORTEC`), que **no comparte** con MFI.
- En **GDI**, la pila del tanque es la de **baja**; la de alta es mecánica y va en
  el motor.

### Para cambiar una regla hacen falta, en el mismo commit

1. el cambio en `lib/domain.js`,
2. el cambio en la prueba correspondiente,
3. **de dónde salió el dato nuevo** (manual, banco, medición), escrito en el commit.

Cambiar la prueba para que pase es la forma más rápida de publicar un dato falso.

---

## 3. Dónde va cada cosa

```
lib/catalog.js     DATOS: vehículos, pilas, textos por zona. Sin lógica.
lib/domain.js      REGLAS del taller. Puro, sin base de datos ni entorno.
lib/pure.js        Helpers puros del servidor (toInt, esc, slugify…).
db.js              Adaptador para SQLite / Turso / PostgreSQL.
seed.js            Solo orquesta la siembra. NO tiene reglas.
server-pg.js       ENSAMBLADOR: monta middlewares y routers, y arranca (~25 KB).
src/config/        Configuración del entorno, leída y validada una sola vez (4.2).
src/routes/        Un módulo por dominio (montarX(app, deps)): catálogo, orders,
                   documents, admin, auth, paginas (SSR), misc (catch-alls)…
src/middleware/    CSP/nonce, CSRF, body-parser por ruta, redirects, estáticos.
src/services/      chat, identificador, anuncios, auth (primitivas), caches.
src/views/shell.js La maqueta del SSR (renderShell + pie legal).
src/db/            Migraciones versionadas (runner + versiones).
public/            Frontend sin build step (React 18 UMD + htm).
scripts/guard.js   Motor de restricciones (20 reglas).
scripts/metrics.js Métricas + trinquete de calidad.
scripts/qa.js      npm run verify.
quality/           Presupuestos, deuda aceptada, referencia e informe.
```

**`lib/` tiene que seguir siendo puro.** Nada de `require('./db')`, express,
`process.env` ni `console.log`. Es lo que permite probar las reglas del taller
sin levantar nada, y hay una regla del guard que lo vigila.

**`src/` es lo contrario: código de servidor que sí depende del entorno, de
express o de la base de datos, pero que no tiene por qué vivir dentro de
`server-pg.js`.** Nada de lógica del taller ahí: eso es `lib/`. Un módulo de
`src/` que declare rutas de la API entra igual en las pruebas de contrato y en
la de seguridad (`test/helpers.js` y `scripts/metrics.js` leen `server-pg.js`
**y** `src/`).

---

## 4. Trampas de este proyecto (todas ocurrieron de verdad)

### 4.1 `await` en todo lo que toque la base

`db.get/all/run/exec/insertReturningId` devuelven **promesas**. Sin `await`:

```js
const total = await statsDb.get('…')?.value;   // ❌ lee .value de la PROMESA → undefined
const total = (await statsDb.get('…'))?.value; // ✅
```

El contador de visitas estuvo clavado en 0 por exactamente esto. Lo mismo aplica
a las funciones `async` propias: `createVehicle()` sin `await` devolvía
`{"id":{}}` al panel, y `updateVehicle()` sin `await` podía **tumbar el proceso**
(Node aborta ante un rechazo sin capturar).

### 4.2 Los parámetros van en un **array**

`db.run(sql, params)` recibe **dos** argumentos:

```js
db.run('UPDATE v SET a=? WHERE id=?', valor, id);    // ❌ el id se descarta en silencio
db.run('UPDATE v SET a=? WHERE id=?', [valor, id]);  // ✅
```

Marcar un vehículo como verificado no funcionó nunca por este error.

### 4.3 Valida el id **antes** de consultar

`toInt()` devuelve `null` para basura, y pasar `null` a un `?` hace que
better-sqlite3 lance:

```js
const id = toInt(req.params.id, 1, 1e9);
if (id === null) return res.status(404).json({ error: 'No encontrado' });
```

### 4.4 Express 4 no captura promesas rechazadas

Hay un envoltorio en `server-pg.js` (busca `const envolver =`) que manda los
rechazos a `next(err)`. **No lo quites.** Sin él, un error en una ruta `async`
deja la petición **colgada para siempre**: sin respuesta, sin log, sin 500.

### 4.5 Todo dato del taller se filtra por `workshop_id`

Los talleres comparten tablas. Una consulta sin ese filtro es una fuga de datos
entre negocios. Va en **todas**: `SELECT`, `UPDATE` y `DELETE`, aunque ya hayas
comprobado la propiedad antes.

### 4.6 Escapa el HTML del servidor con `esc()` de `lib/pure.js`

No escribas otra función de escape. Dos escapes que se separan son un XSS
esperando. (Había dos duplicados; ya se eliminaron.)

### 4.7 La CSP calcula sus hashes sola

Los hashes de los `<script>` inline de `index.html` se calculan leyendo el
archivo, y se normaliza CRLF → LF porque el proyecto se edita en Windows. **Nunca
escribas un hash a mano:** caduca en silencio y el navegador bloquea el script
sin que el servidor se entere.

### 4.8 Convenciones de htm + React

El frontend no tiene build step. Usa `htmlFor` y `maxLength` (no `for` ni
`maxlength`). `class=` sí es la convención establecida aquí.

### 4.9 Las estadísticas viven en otra base

`stats.db` está separada de `fueltech.db` porque el seed borra el catálogo
entero. No muevas el contador de visitas ahí.

### 4.10 El modelo de Gemini tiene que existir

`gemini-3.5-flash` **no es un id real** y hacía que el chat respondiera 502.

---

## 5. Seguridad al correr pruebas

`.env` apunta a la **base de producción en Turso**. Por eso:

- Toda prueba monta la app con `test/helpers.js`, que usa bases **en memoria** y
  el adaptador en modo **`'local'`** (ignora `TURSO_URL` aunque esté puesta).
- **Nunca** ejecutes `npm run seed` ni `FORCE_SEED=1` sin saber a qué base apunta
  el entorno. Para probar la siembra en local:
  `TURSO_URL= TURSO_AUTH_TOKEN= FORCE_SEED=1 node seed.js`.
- Hay una regla del guard que falla si una prueba abre una base en disco o
  construye el adaptador sin el modo `'local'`.

---

## 6. Qué hacer al agregar cosas

**¿Ruta nueva en la API?**
1. Si toca datos del taller: `requireWorkshop` + filtro `workshop_id`.
2. Prueba del caso feliz **y** del caso de error (`test/qa/business-flows.test.js`).
3. Errores como `res.status(4xx).json({ error: 'mensaje en español' })`.
4. Datos privados con `Cache-Control: no-store`.
5. `test/qa/contract.test.js` falla si la ruta no aparece en ninguna prueba.

**¿Vehículo o pila nueva?**
1. Va en `lib/catalog.js`, respetando la forma de la fila.
2. Si el dato no es de manual, márcalo con `verified = 0`: saldrá con el aviso
   **⚠ ESTIMADO** en la ficha. Es honestidad con el mecánico, no un detalle.
3. `npm run test:unit` valida forma, rangos, duplicados y solapes.

**¿Función pura nueva?**
Va en `lib/`, con su archivo en `test/unit/`. El guard exige que cada módulo de
`lib/` tenga pruebas.

**¿Regla nueva del guard?**
Solo si romperla causa un **daño concreto y demostrable**. El campo `porque` debe
explicar ese daño, no la preferencia de estilo.

---

## 7. Deuda conocida y presupuestos

- `quality/known-issues.json` — la **única** puerta por la que una violación pasa
  sin romper el build. Cada entrada lleva razón y qué hay que decidir. La lista
  **solo puede encoger** (tope: 5).
- `quality/budgets.json` — latencias, tamaños de archivo, cobertura mínima y
  topes estructurales. Subir un número aquí para que pase el build es hacer
  trampa: primero averigua por qué se rompió.
- `quality/baseline.json` — el trinquete. Las métricas pueden mejorar libremente;
  empeorar falla. Si el retroceso es deliberado: `npm run metrics:aceptar`, y
  explica el porqué en el commit.
- `quality/REPORT.md` — informe generado. No lo edites a mano.

### Pendiente de decisión del dueño del taller

Cinco problemas reales de datos detectados y registrados, que necesitan
conocimiento del negocio para resolverse:

1. **Renault Kwid 2019-2024** duplicado (dos filas MFI iguales salvo "1.0L L4" vs
   "1.0L L3"; el Kwid es tricilíndrico).
2. **Mitsubishi L200** — solape 2010-2015 donde las dos filas **se contradicen**
   en si lleva retorno, y por eso generan módulos distintos. Es el más grave.
3. **Chevrolet Tracker** — solape 2020-2024 con presiones distintas.
4. **Renault Duster** — solape 2013-2019 duplicado.
5. **AIRTEX E8213 (universal)** — pila definida que ninguna clase ofrece.

---

## 8. Lo que NO debes hacer

- ❌ Cambiar una prueba de `test/unit/domain.test.js` para que pase, sin fuente.
- ❌ Subir un presupuesto o agregar deuda para desbloquear el build.
- ❌ Borrar una regla del guard en vez de arreglar lo que señala.
- ❌ Usar logotipos de armadoras (Chevrolet, Nissan…). "El logo" siempre es la
  marca propia **FuelTech**.
- ❌ Inventar datos técnicos. Si no lo verificaste, va con `verified = 0`.
- ❌ Sembrar o migrar contra Turso sin que el dueño lo pida explícitamente.
- ❌ Dar por terminado un cambio con `npm run verify` en rojo.

---

## 9. Estado actual

| | |
| --- | --- |
| Pruebas | **757**, todas en verde |
| Cobertura de `lib/` | **100 %** |
| Rutas de API | **103**, **100 %** con prueba |
| Reglas de restricción | **20**, 0 violaciones |
| Catálogo | 208 vehículos, 33 marcas, 10 pilas |

Consulta `quality/REPORT.md` para el estado al día.
