# A.SPEC FT-0027 — Versionar el código en cada despliegue

## WHY

Tras arreglar la navegación, el dueño seguía viendo `?v=26` al recargar. No era
el código nuevo: era el **viejo**. La URL `app.js?v=12` no cambiaba entre
despliegues y su entrada de caché HTTP se había creado cuando aún se servía con
`max-age: 1d`, así que el navegador la daba por fresca y **no pedía el archivo**
(aunque la cabecera diga `no-cache`, una entrada que todavía está vigente no se
revalida). Los usuarios quedaban clavados en la versión anterior hasta que
caducara la entrada, y el arreglo no se veía.

## WHAT

El HTML sirve el código propio con una versión que cambia sola en cada
despliegue: `renderShell` reescribe el `?v=` de los `.js`/`.css` del sitio con la
fecha del archivo (mtime en base36). Ninguna caché puede quedar sirviendo la
versión anterior porque la URL es distinta. Las librerías de `/vendor/` se dejan
intactas (son inmutables; versionarlas obligaría a rebajar 1,9 MB en cada
despliegue).

## SCOPE

- `src/views/shell.js`: `versionDe()` y el reescrito del `?v=` de los assets
  propios en `renderShell`.
- `public/index.html`: suben las versiones escritas a mano (respaldo para el
  `index.html` estático).
- `public/sw.js`: caché a v23.

## OUT OF SCOPE

- Las librerías de `/vendor/` y las imágenes, que se sirven inmutables.
- Los filtros y el `?v=` de vehículo en la URL (FT-0026).

## CONTRACT

Post: sirviendo la app desde Node, cada `<script src>` y `<link href>` a un
`.js`/`.css` propio sale con `?v=<mtime36>` y `/vendor/…` sale sin versión. El
HTML cambia cuando cambia el archivo versionado.

## INVARIANTS

```yaml
invariants:
  - "guard:hashes-csp-calculados (los inline de index.html no cambian)"
  - "robot recorrido 6b: el HTML servido sobrevive al arranque de React"
  - "robot interfaz 214/214 (la app carga con las URLs versionadas)"
  - "los archivos de public/ siguen existiendo para el SHELL del service worker"
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
  allowed: [src/views/shell.js, public/index.html, public/sw.js]
  prohibited: [lib/, db.js, schema.sql, src/routes/, public/app.js]
```

## Blast Radius

```yaml
blast_radius:
  direct: [todo el HTML servido en SSR, URLs de los scripts propios]
  indirect: [caché del navegador, robots de recorrido e interfaz]
  must_not_affect: [API, sesiones, CSP, contenido de las páginas]
```

## Traceability

- Requirement: "todavía sigo recargando y me lleva al catálogo … el url se coloca así /?v=26"
- Commit: add/FT-0027-versionado-por-despliegue
- Deployment: assets de public/ → CACHE del service worker

## Definition of Done

- [x] Objective satisfied · [x] Invariants preserved · [x] Verification passed
