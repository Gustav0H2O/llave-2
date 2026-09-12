# A.SPEC FT-0023 — Los datos de negocio viven solo en la nube

## WHY

Los datos de negocio (inventario, clientes, órdenes, notas, caja) se guardaban
en la API **y** se copiaban a `localStorage`, con dos vías para subirlos desde
el navegador: un botón "Importar mis datos del navegador" en la pantalla de
acceso y una importación automática al iniciar sesión. Eso tenía tres averías
reales:

1. El botón manual **no comprobaba** si el servidor ya tenía datos: pulsarlo con
   datos en la nube **duplicaba filas**.
2. Las copias locales se borraban al cerrar sesión, pero el botón ofrecía
   "recuperar" algo que ya vivía en el servidor; confundía más que ayudaba.
3. Había claves muertas o mal formadas: `ft_pressure_log` (nunca se escribe),
   `ftm_author_name` (se leía y nadie la escribía, el autor del foro salía
   siempre "Anónimo") y `ft_device_id` con dos generadores distintos y dos
   formatos sobre la misma clave.

## WHAT

El servidor es la única fuente de los datos de negocio: el espejo local queda
solo como caché de LECTURA para mirar sin conexión. Se elimina el botón de
importar y la subida automática; se limpian las claves muertas y se unifica el
identificador de dispositivo; y el nombre del autor del foro se persiste de
verdad en el aparato.

## SCOPE

- `public/app.js`: eliminar `importTallerFromLocal`, `importLocal`, el botón, la
  importación automática de `syncFromBackend` y la clave `ft_pressure_log`;
  exponer `getDeviceId`.
- `public/microapps-taller.js`: usar el `getDeviceId` único; persistir
  `ft_forum_author`.

## OUT OF SCOPE

- Cambiar la API o el esquema.
- Las preferencias de aparato, que sí viven en `localStorage` a propósito
  (tema, recientes, garage, magnitudes, aviso de privacidad).

## CONTRACT

Post: no existe ningún camino que suba datos locales al servidor; el espejo se
escribe solo desde la API y se borra al cerrar sesión; hay un único generador de
`ft_device_id`; y no queda ninguna clave local sin escritor.

## INVARIANTS

```yaml
invariants:
  - guard:aislamiento-por-taller
  - guard:rutas-de-negocio-protegidas
  - "los datos de una cuenta no se mezclan con los de otra en el mismo navegador"
  - "guard:tamano-de-archivos"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
  - npm run robots:rapido
  - npm run robots:jornada
```

## ROLLBACK

`git revert`.

## Change Surface

```yaml
change_surface:
  allowed: [public/app.js, public/microapps-taller.js]
  prohibited: [src/, server-pg.js, db.js, lib/]
```

## Blast Radius

```yaml
blast_radius:
  direct: [pantalla de acceso, sincronización al iniciar sesión, foro, reseñas]
  indirect: [robot jornada, aislamiento entre cuentas en el mismo navegador]
  must_not_affect: [API, sesiones, datos en la nube]
```

## Traceability

- Requirement: "haz que use el almacenamiento local cuando incumba… si no elimina eso" + "elimina el boton de importar datos del navegador"
- Commit: add/FT-0023-datos-negocio-en-la-nube
- Deployment: sin cambios

## Definition of Done

- [x] Objective satisfied · [x] Invariants preserved · [ ] Verification passed
