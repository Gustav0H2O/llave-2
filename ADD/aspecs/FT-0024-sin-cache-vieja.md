# A.SPEC FT-0024 — Ver un despliegue sin vaciar la caché a mano

## WHY

Para ver una actualización había que borrar la caché del navegador. La causa no
era el service worker (que ya es network-first) sino el **caché HTTP**:

- `src/middleware/estaticos.js` servía el JS con `max-age: 1d` en producción, y
  el HTML con `max-age: 1d` también (`express.static`). El navegador no volvía a
  pedirlo en un día entero.
- La portada (`/`) respondía `public, max-age=300` en `src/routes/paginas.js`.
- Una pestaña abierta seguía con el worker viejo hasta cerrarla: no se buscaba
  actualización ni se recargaba al tomar el control uno nuevo.

## WHAT

El código de la app se revalida en cada carga (`no-cache, must-revalidate`), la
portada también, el worker busca actualización al arrancar y recarga una sola vez
cuando uno nuevo toma el control, y al salir de la página se vacía el caché de
código conservando librerías, imágenes y **todo** `localStorage`.

## SCOPE

- `src/middleware/estaticos.js`: HTML/JS/CSS/JSON/SVG/manifiesto con `no-cache`;
  imágenes y `.glb` siguen inmutables una semana.
- `src/routes/paginas.js`: la portada `/` con `no-cache, must-revalidate`.
- `public/sw.js`: versión de caché a v20 (publica el cambio a quien ya la tiene).
- `public/app.js`: `registration.update()` al arrancar, recarga única en
  `controllerchange`, y limpieza best-effort del caché de código en `pagehide`
  (solo con red; nunca toca `localStorage`).

## OUT OF SCOPE

- Las páginas SSR de contenido (`/guias`, `/vehiculo/…`), que pueden cachearse
  unos minutos: llevan su propio `?v=` y su JS se revalida igual.
- El backend de datos (`/api/…`): sus cabeceras no cambian.

## CONTRACT

Post: recargar la página basta para ver un despliegue nuevo, con o sin service
worker; ningún `Cache-Control` de HTML o JS supera la revalidación; al salir con
red se eliminan las entradas de caché que no son `/vendor/` ni `/media/`, y
`localStorage` queda intacto.

## INVARIANTS

```yaml
invariants:
  - "el API nunca se cachea (sw.js): pathname.startsWith('/api/')"
  - "sw.js declara const CACHE con número de versión y llama a caches.delete"
  - "los datos privados siguen respondiendo no-store"
  - "el catálogo de pilas conserva max-age (contract.test.js)"
  - "offline: cerrar sin red no vacía el caché que deja abrir la app en la fosa"
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
  allowed: [src/middleware/estaticos.js, src/routes/paginas.js, public/sw.js, public/app.js]
  prohibited: [lib/, db.js, schema.sql, src/services/]
```

## Blast Radius

```yaml
blast_radius:
  direct: [cabeceras de caché de public/, service worker, actualización en caliente]
  indirect: [robot recorrido y interfaz; consumo de datos móviles]
  must_not_affect: [API, sesiones, aislamiento, catálogo]
```

## Traceability

- Requirement: "que cuando se actualice la página no sea necesario borrar los datos o caché para ver los cambios"
- Commit: add/FT-0024-sin-cache-vieja
- Deployment: assets de public/ → CACHE del service worker a v20

## Definition of Done

- [x] Objective satisfied · [x] Invariants preserved · [ ] Verification passed
