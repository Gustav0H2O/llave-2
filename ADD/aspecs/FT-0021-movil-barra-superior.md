# A.SPEC FT-0021 — La parte superior en celular y el aviso de reporte

## WHY

El dueño reportó que "todavía sigue el fallo en la parte superior, falla en
celular". Medido a 390 px, había cinco fallos reales, no uno:

1. `.sin-red` (aviso de sin conexión) medía más de lo reservado: el texto no
   cabía en 362 px útiles, saltaba a dos líneas y con el notch llegaba a ~89 px,
   mientras los desplazamientos de `.home-nav` y `.micro-shell-head` estaban
   clavados en 34 px. Media cabecera —y el botón "Volver"— quedaba debajo.
2. `.results-strip` (franja de resultados del catálogo) se pegaba en `top: 0`
   sin safe-area y era la única barra sin desplazamiento por `.sin-red`.
3. `.home-buscador`: la regla base está más abajo en la hoja y, a igual
   especificidad, pisaba a la de móvil (mandaba 260 px de base y 400 de tope).
4. `.home-nav` reservaba el notch solo con `body.pwa`; sin instalar, la primera
   fila podía quedar bajo la barra de estado.
5. El buscador pegajoso de una herramienta se anclaba en 58 px, pero la cabecera
   mide 61 (8 + 44 del "Volver" + 8 + borde): 3 px de solape.

Además no había en los pies dónde reportar un bug.

## WHAT

La parte superior deja de solaparse en celular y los dos pies invitan a
reportar bugs, fallos o críticas al correo del dueño.

## SCOPE

- `public/index.html`: `.sin-red` (una línea + offsets), `.results-strip`,
  `.home-nav`, `.home-buscador`, `.micro-shell-body > .styled-input:first-child`,
  `.conv-modes`, `.home-footer-reporta`.
- `public/app.js` y `public/microapps.js`: línea de reporte en los dos pies.

## OUT OF SCOPE

- Reescribir el resto de la capa móvil.
- Cambiar la API o la base de datos.

## CONTRACT

Post: con `body.sin-red-activo`, las tres barras pegadas bajan al alto real de
la franja; `.results-strip` respeta el notch; el buscador del home ocupa la fila
en ≤720 px; el buscador pegajoso queda justo bajo la cabecera; y los dos pies
muestran el correo `newpersonal98@gmail.com` con un enlace tocable (≥24 px).

## INVARIANTS

```yaml
invariants:
  - guard:tamano-de-archivos
  - "robot interfaz 214/214 (contraste, desbordes, scroll, táctil; 2 temas × 3 anchos)"
  - "movil-pwa: campos a 16px y .micro-back a 44px siguen presentes"
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
  allowed: [public/index.html, public/app.js, public/microapps.js, quality/budgets.json]
  prohibited: [server-pg.js, src/, lib/, db.js]
```

## Blast Radius

```yaml
blast_radius:
  direct: [cabecera del inicio, franja de resultados, cabecera de herramienta, pies]
  indirect: [robot interfaz]
  must_not_affect: [API, sesiones, catálogo, CSP]
```

## Traceability

- Requirement: "todavía sigue el fallo en la parte superior … en celular" + "en los footer … reportar algún bug … mi correo"
- Commit: add/FT-0021-movil-barra-superior
- Deployment: assets de public/ → subir CACHE del service worker

## Definition of Done

- [x] Objective satisfied · [x] Invariants preserved · [x] Verification passed
