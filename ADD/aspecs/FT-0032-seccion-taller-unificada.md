# A.SPEC FT-0032 — Sección taller unificada: seis apps con pestañas, botones de verdad y sin emojis

## WHY

La sección taller había crecido a **dieciséis tarjetas** (Órdenes, Inventario,
Clientes, Documentos, Notas, Caja, Inspección, Cotizador, Agenda, Mano de obra,
Mi Taller, Checklist, Mecánicos, Alertas, Cortes y Expediente). Cada una era una
pantalla suelta en el inicio:

1. **Demasiadas puertas para el mismo trabajo.** Para entregar un vehículo el
   mecánico abría tres tarjetas distintas (Órdenes, Checklist, Documentos) y
   volvía al inicio entre cada una.
2. **La mitad de las acciones eran hipervínculos.** `.link-btn` estaba definido
   como enlace subrayado sin área tocable (padding 12px 0): en el celular, con
   el dedo, se fallaba el toque. Es justo lo contrario del objetivo de la
   sección móvil.
3. **Emojis en toda la interfaz** (📦 🔧 🖨 ⛽ 👥 …) mezclados con los iconos
   Tabler, y además metidos en datos guardados (`descr` de partidas con prefijo
   📦/🔧, del que dependía la detección de tipo de partida).
4. **La documentación de diseño (`DESIGN.md`) dictaba la capa visual** con
   reglas que ya no se seguían (el propio archivo citaba GSAP y `public/fx.js`,
   eliminados) y el CSS del sitio, que vive dentro de `index.html`, estaba
   contra su tope: cualquier sección nueva empujaba el presupuesto.

## WHAT

**Organización (6 tarjetas con pestañas).** `MicroShell` gana `tabs`/`tab`/
`onTab` y un modo `nested` que devuelve solo el cuerpo. Cada grupo monta sus
vistas dentro de un solo armazón:

| Tarjeta | Pestañas |
| --- | --- |
| Órdenes de Trabajo | Trabajos, Checklist, Mano de obra, Notas |
| Clientes | Clientes (+proveedores), Expediente |
| Almacén | Inventario, Alertas |
| Dinero | Caja, Cortes, Documentos, Cotizador |
| Agenda | Citas (con migración de la agenda vieja del navegador) |
| Equipo | Mecánicos, Mi Taller |

Las diez tarjetas absorbidas siguen existiendo como app (enlaces directos
`?app=documents`), pero quedan `oculta: true` en el catálogo y fuera de la
búsqueda. `agenda` y `mechanics` se declaran en `microapps.js` (una sola lista).

**Botones en todo el sitio.** `.link-btn` deja de ser un enlace subrayado y pasa
a botón (borde, radio, `min-height` 40px y 44px en pantalla táctil) en el sitio
donde se define: cambia TODA la web, no solo el taller.

**Emojis fuera.** Se quitan de la interfaz (catálogo, taller, admin, impresión)
y de los datos: la partida se identifica por `item_type`, no por el emoji del
texto, y el prefijo viejo se limpia al mostrar con `/^[\u{1F4E6}\u{1F527}]\s*/u`
(escapes, sin emoji literal). La nota de dominio pasa de `⚠ ESTIMADO` a
`ESTIMADO` y sus cuatro aserciones se actualizan en el mismo commit.

**Capa visual del taller.** Nace `public/taller.css` (pestañas, botón de acción
y tarjetas de la operación diaria) para no pelear con el tope de `index.html`;
se enlaza, entra en el SHELL del service worker y tiene su presupuesto.

**`DESIGN.md` se elimina** y sus citas se corrigen (comentarios en
`index.html`, `paginas.js`, `guias.test.js` y `budgets.json`, y un hallazgo de
`quality/verificacion-final.md`). No se toca ninguna regla de `scripts/guard.js`
ni se afloja ningún invariante: el único número que sube es
`public/microapps-taller.js` (84 → 86 KB) porque el armazón de pestañas pesa
~1,6 KB; el resto del rediseño se pagó mudando apps a los otros archivos.

**Robots al día.** `jornada.js` abre las 33 tarjetas reales, entra a las
pestañas para escribir y exime del «solo Google, sin campos» al formulario de
desarrollo (`Acceso local`), que es una decisión anterior. Se corrigen además
dos expectativas viejas del robot (selector de Fusibles y el campo elegido en
el Almacén, que era el buscador).

## SCOPE

- `public/microapps.js` (MicroShell, APPS, QuoteApp/LaborApp), `public/microapps-taller.js`
  (Órdenes/Clientes/Almacén/Dinero con pestañas, Documentos y Perfil anidables),
  `public/microapps-taller-2.js` (Agenda con migración, Equipo con pestañas),
  `public/app.js` (alias `appointments` → Agenda del servidor), `public/index.html`
  (.link-btn botón), `public/taller.css` (nuevo), `public/sw.js`.
- `lib/domain.js` (nota sin ⚠), `src/routes/orders.js` y `documents.js` (impresión),
  `src/config/index.js`, `src/services/chat.js`, `server-pg.js` (logs sin emoji).
- `test/seed-test.js`, `test/unit/domain.test.js`, `test/qa/data-quality.test.js`,
  `test/robots/{jornada,index,reporte,interfaz}.js`.
- `quality/budgets.json`, `DESIGN.md` (eliminado) y citas en `ADD/aspecs/` (histórico),
  `quality/verificacion-final.md`.

## OUT OF SCOPE

- No se borra ni se suaviza ninguna regla de `scripts/guard.js`.
- No se sube ningún tope salvo el del armazón de pestañas, con razón escrita.
- No se toca `lib/domain.js` más allá de la nota (las presiones no cambian).
- No se retiran del código las apps absorbidas (siguen accesibles por enlace).

## CONTRACT

Post: la sección taller ofrece seis tarjetas; cada una abre su vista principal y
sus pestañas sin salir del mismo armazón; toda acción del sitio es un botón con
área tocable; no queda ningún emoji en la interfaz servida ni en los datos que
la app escribe; el CSS del taller vive en `public/taller.css`; `npm run verify`
en verde y el robot `jornada` en verde con las tarjetas nuevas.

## INVARIANTS

```yaml
invariants:
  - guard:tamano-de-archivos
  - guard:convenciones-de-htm-react
  - "el service worker solo precarga archivos que existen (test/qa/movil-pwa.test.js)"
  - "el botón de volver de las micro apps sigue a 44px en pantalla táctil"
  - "las listas de exportación de los tres archivos de micro apps no se solapan"
  - "las rutas /api siguen al 100% con prueba (test/qa/contract.test.js)"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
```

## ROLLBACK

`git revert`. La migración de citas es de ida (sube lo del navegador a la base y
borra la clave local): revertir el código deja las citas ya migradas en la base.

## Change Surface

```yaml
change_surface:
  allowed: [public/, lib/domain.js, src/, server-pg.js, test/, quality/, DESIGN.md, ADD/aspecs/FT-0032-*.md]
  prohibited: [scripts/guard.js, db.js, .githooks/, ADD/VERIFY.yaml, schema.sql]
```

## Blast Radius

```yaml
blast_radius:
  direct: [sección taller del frontend, capa visual de botones, robots de interfaz y jornada]
  indirect: [datos guardados (descr sin emoji), notas de catálogo (ESTIMADO)]
  must_not_affect: [API y sus contratos, esquema, presiones del taller, sesiones, aislamiento por taller]
```

## Traceability

- Requirement: «puedes unificar en la sección de taller algunas micro apps para
  que sean menos… lo que no son botones, conviértelos en botones… quita emojis
  … quita las reglas de design y demás reglas de UI y UX» + permiso explícito de
  mejorar la UI/UX y la organización de la sección taller.
- Commit: el commit de esta sesión.
- Deployment: sin migración de esquema; cambio de assets y de catálogo.

## Definition of Done

- [x] Objective satisfied — [x] Invariants preserved — [x] Verification passed
