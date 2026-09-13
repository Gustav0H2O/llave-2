# A.SPEC FT-0026 — Recargar la página cae siempre en el inicio

## WHY

El dueño reportó que al recargar la página volvía al catálogo de combustible en
vez de a la portada. La causa eran dos escrituras en la URL que se leían al
arrancar:

1. Abrir el catálogo (`openMicro('search')`) dejaba `?app=search` en la barra de
   direcciones, y el arranque lo interpretaba como una ruta: recargar reabría el
   catálogo.
2. El efecto que sincronizaba la URL escribía el vehículo elegido (`?v=`) y los
   filtros cada vez que cambiaba la selección dentro del catálogo. Bastaba con
   abrir el catálogo (el primer resultado se autoselecciona) para que la URL
   quedara con `?v=` y recargar devolviera ahí.

## WHAT

Al recargar, la aplicación arranca en la página de inicio. El catálogo deja de
ser una ruta (`?app=search` ya no se escribe y se limpia si está) y la URL ya no
guarda el vehículo ni los filtros: solo la posición en el dashboard (`?app=` de
la herramienta abierta y `?cat=` de la categoría), que sí es compartible y
sobrevive al gesto de atrás de Android.

## SCOPE

- `public/app.js`: `abrirCatalogo` (limpia `?app=` y deja entrada de historial
  con la misma dirección), `aplicarRuta` y `rutaInicial` (ignoran `search`) y
  retirada del efecto que escribía `?v=` y los filtros.
- `public/sw.js`: caché a v22.

## OUT OF SCOPE

- Las páginas SEO `/vehiculo/<slug>`, que siguen arrancando en la ficha
  (AGENTS.md §4.13) y son el enlace que se comparte.
- El enrutado de las herramientas (`?app=dtc`…), que se conserva para no romper
  los enlaces que se mandan por WhatsApp.
- Los filtros y el `?v=` se siguen LEYENDO al arrancar: un enlace viejo con
  `?v=` sigue abriendo la ficha.

## CONTRACT

Post: recargar cualquier URL del catálogo (sin `/vehiculo/`) abre el inicio;
`?app=<herramienta>` sigue abriendo su herramienta; `/vehiculo/<slug>` sigue
abriendo su ficha; el botón atrás de Android vuelve del catálogo al inicio.

## INVARIANTS

```yaml
invariants:
  - "invariants: useState(initialURL.selected ? 'search' : 'home') y dataset.vehicle siguen en app.js"
  - "movil-pwa: rutaEscribir({ app: id }) y popstate siguen presentes"
  - "robot interfaz 214/214 y recorrido 247 comprobaciones"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
  - npm run robots:rapido
  - npm run robots:interfaz
```

## ROLLBACK

`git revert`.

## Change Surface

```yaml
change_surface:
  allowed: [public/app.js, public/sw.js]
  prohibited: [server-pg.js, src/, lib/, db.js, public/index.html]
```

## Blast Radius

```yaml
blast_radius:
  direct: [arranque de la app, enrutado del catálogo y de las herramientas, botón atrás]
  indirect: [robots interfaz y jornada, enlaces compartidos]
  must_not_affect: [API, sesiones, SEO de /vehiculo/<slug>, catálogo]
```

## Traceability

- Requirement: "al recargar la pagina me lleva al catalogo de combustible esta mal"
- Commit: add/FT-0026-recargar-cae-en-el-inicio
- Deployment: assets de public/ → CACHE del service worker

## Definition of Done

- [x] Objective satisfied · [x] Invariants preserved · [x] Verification passed
