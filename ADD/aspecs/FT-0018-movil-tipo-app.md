# A.SPEC FT-0018 — Pulir la cáscara móvil para que se sienta app

## WHY

El celular es donde el mecánico usa la aplicación, pero la capa móvil tiene tres
solapamientos medibles que estorban el uso real y varios detalles que la delatan
como web:

1. La burbuja del chat (`.chat-fab`, `z-index: 200`, `bottom: 16px`) se pinta
   **encima** de la pestaña "Más" de la barra inferior (`.home-tabbar`,
   `z-index: 60`, 56 px): la última pestaña queda tapada.
2. Los avisos (`.toast-stack`, `bottom: 24px`) y el banner de instalación se
   apoyan sobre la misma barra.
3. El aviso de sin conexión (`.sin-red`, `z-index: 80`, `top: 0`) tapa la
   cabecera pegajosa de la micro app (`.micro-shell-head`, `z-index: 40`,
   `top: 0`), que es donde vive el único botón de "Volver".
4. Al tocar una tarjeta de herramienta no hay respuesta visual
   (`.micro-card:active` es un no-op: `translateY(0)`), y al abrir una
   micro app el cambio de pantalla es instantáneo, sin transición.
5. `.micro-back` —la única salida de una herramienta— mide 10,5 px de texto.

## WHAT

La cáscara móvil deja de solaparse consigo misma y responde al tacto: el FAB del
chat, el banner de instalar y los avisos se apartan de la barra inferior; el
aviso de sin conexión desplaza la cabecera de la herramienta; las tarjetas, las
pestañas y la apertura de una micro app tienen respuesta visual; y el botón
"Volver" se lee.

## SCOPE

- `public/index.html`, bloque móvil (`@media (max-width: 720px)`, `(pointer:
  coarse)`, `body.pwa`, `.sin-red`): separar FAB/avisos/banner de la tabbar,
  desplazar `.micro-shell-head`, feedback `:active` de `.micro-card` y
  `.home-tab`, `@keyframes` de entrada de `.micro-app-view`, y subir el texto de
  `.micro-back`.
- `public/app.js`: el estado "Cargando…" del dashboard pasa a un esqueleto
  (`.skel`/`.skel-line`, ya existentes).

## OUT OF SCOPE

- Ocultar la cabecera del inicio al hacer scroll, `visualViewport` para el
  teclado y swipe-down de la hoja "Más" (mejoras P2, otra A.SPEC).
- Cualquier cambio en micro apps, catálogo, API, base de datos o `lib/`.
- El CSS de las páginas SSR.

## CONTRACT

Post:
- `.chat-fab` y `.chat-panel` quedan por encima de `.home-tabbar` en ≤720 px y
  siguen respetando `env(safe-area-inset-bottom)`.
- `.toast-stack` y `.instalar-banner` no se apoyan sobre `.home-tabbar`.
- Con `body.sin-red-activo`, `.micro-shell-head` baja 34 px y el buscador
  pegajoso del cuerpo se recoloca.
- `.micro-card:active` y `.home-tab:active` cambian fondo/color de forma visible.
- `.micro-app-view` entra con una animación ≤200 ms, desactivada con
  `prefers-reduced-motion: reduce`.
- `.micro-back` se pinta a 12,5 px sin bajar de 44 px de alto.
- El dashboard muestra un esqueleto mientras `authChecked` es falso.

## INVARIANTS

```yaml
invariants:
  - guard:tamano-de-archivos — public/index.html y public/app.js dentro de budgets.json
  - guard:convenciones-de-htm-react — sin `for=` ni `maxlength=` en minúscula
  - "movil-pwa: campos a 16px y .micro-back a 44px siguen presentes"
  - "movil-pwa: el trinquete fabRespetaAreaSegura sigue contento (env(safe-area-inset-bottom) presente)"
  - "robot interfaz: contraste, desbordes, scroll anidado y objetivos táctiles no empeoran en 2 temas × 3 anchos"
  - "CSP: sin on*= inline en index.html"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
  - npm run robots:rapido
```

## ROLLBACK

`git revert` del commit (reglas CSS y un estado de carga aislados).

## Change Surface

```yaml
change_surface:
  allowed: [public/index.html, public/app.js, quality/budgets.json]
  prohibited: [server-pg.js, src/, lib/, db.js, public/microapps.js, public/microapps-taller.js]
```

## Blast Radius

```yaml
blast_radius:
  direct: [barra inferior móvil, FAB del chat, avisos, cabecera de micro app]
  indirect: [robot interfaz (2 temas × 3 anchos), usuario instalado (body.pwa)]
  must_not_affect: [API, sesiones, aislamiento por taller, catálogo, CSP]
```

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: una sola responsabilidad — la cáscara móvil
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  preferred_new_logic_locations: [public/index.html]
```

## Traceability

- Requirement: "mejora la ui en general de toda la pagina web en celular … tipo app"
- Commit: add/FT-0018-movil-tipo-app
- Deployment: assets de public/ → subir CACHE del service worker

## Definition of Done

- [ ] Objective satisfied
- [ ] Scope respected
- [ ] Contract satisfied
- [ ] Invariants preserved
- [ ] Verification passed
- [ ] Rollback honest
- [ ] No unrelated changes
- [ ] Traceability established
