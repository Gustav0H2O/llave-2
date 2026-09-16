# A.SPEC FT-0028 — Unificar el contacto del pie del catálogo

## WHY

El pie del catálogo de combustible (`pie` en `public/app.js`) muestra **dos**
bloques de contacto seguidos con el **mismo correo**:

1. «¿Encontraste un bug, un fallo o tienes una crítica? Escríbeme a
   newpersonal98@gmail.com»
2. «¿Quieres un desarrollo similar? Contáctame: newpersonal98@gmail.com»

FT-0021 añadió la línea de reporte «en los dos pies» sin mirar que el del
catálogo ya tenía una invitación de contacto. El resultado es una repetición:
el mismo correo dos veces en dos renglones consecutivos, con dos promesas
distintas, en el pie que más se ve del sitio.

## WHAT

El pie del catálogo tiene **una** línea de contacto: la de desarrollo similar.
El aviso de reportar bugs, fallos o críticas se queda solo en el pie del inicio
(`public/microapps.js`), que es donde FT-0021 lo quería.

## SCOPE

- `public/app.js`: se retira el bloque `.dev-contact` de reporte del `pie` y el
  que queda pierde el modificador `--sin-borde`.
- `public/index.html`: se retira la regla `.dev-contact--sin-borde` y su
  comentario, que existían solo para pegar el segundo aviso al primero.
- `public/sw.js`: `CACHE` sube a `llave-v27`.

## OUT OF SCOPE

- El pie del inicio (`home-footer-reporta` en `public/microapps.js`) no se toca.
- `handleEmailClick` (ofuscación del correo contra raspado) sigue igual.
- El resto del CSS del pie y la API.

## CONTRACT

Post: el `pie` del catálogo renderiza un único elemento `.dev-contact`, con un
único enlace al correo del dueño, y ninguna clase `dev-contact--sin-borde`
aparece ni en el markup ni en la hoja de estilos.

## INVARIANTS

```yaml
invariants:
  - guard:tamano-de-archivos
  - "quality/budgets.json: public/app.js ≤ 109 KB (vuelve a 107,9 KB)"
  - "movil-pwa: los objetivos táctiles de .dev-contact a (44px en pantalla táctil) siguen presentes"
  - "el correo no se escribe en claro en el markup: sigue saliendo por handleEmailClick"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
  - npm run robots:rapido
```

## ROLLBACK

`git revert`.

## Change Surface

```yaml
change_surface:
  allowed: [public/app.js, public/index.html, public/sw.js, ADD/aspecs/FT-0028-unificar-contacto-pie.md, quality/REPORT.md, quality/history.ndjson]
  prohibited: [server-pg.js, src/, lib/, db.js, public/microapps.js]
```

## Blast Radius

```yaml
blast_radius:
  direct: [pie del catálogo de combustible]
  indirect: [caché del service worker (llave-v27)]
  must_not_affect: [API, sesiones, catálogo de datos, CSP]
```

## Traceability

- Requirement: "unifica esto ya que se repite en el catálogo de combustible
  [los dos avisos de correo] … y súbelo al repo"
- Commit: add/FT-0028-unificar-contacto-pie
- Deployment: assets de public/ → subir CACHE del service worker

## Definition of Done

- [x] Objective satisfied · [x] Invariants preserved · [x] Verification passed
