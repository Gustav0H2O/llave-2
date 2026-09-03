# A.SPEC FT-0012 â€” Mejoras de interfaz y accesibilidad puntual

## WHY

AuditorÃ­a tÃ©cnica (Nielsen/WCAG) dejÃ³ brechas concretas de interfaz baratas de
cerrar: login admin con placeholder como Ãºnica etiqueta (P1), oliva del admin
fuera de calibraciÃ³n (#55700D, 4.3:1 vs el #4E680A 4.8:1 de la app principal),
indicador Â«pensandoÂ» del chat sin aria-live, y el skip-link apuntando a un div
sin landmark <main>. AdemÃ¡s el interruptor de modo del chat (FT-0009) naciÃ³ como
texto pelado sin estado visual.

## WHAT

Cuatro mejoras observables: â‘  el login de admin tiene etiqueta real asociada;
â‘¡ el oliva del admin unifica el contraste con la app principal; â‘¢ el Â«pensandoÂ»
del chat anuncia su estado (role=status + aria-live + texto sr-only); â‘£ existe
un landmark <main> real donde apunta el skip-link, y el modo del chat se muestra
como chip con estado activo lima segÃºn el sistema de diseÃ±o.

## SCOPE

- `public/admin.html`: label for="pass" + token --accent:#4E680A.
- `public/app.js`: main.content-pane (antes div), aria-live en burbuja loading,
  chip del modo del chat con tokens (borde/fondo/color segÃºn estado).

## OUT OF SCOPE

- Hero video (reduced-motion/Save-Data): decisiÃ³n de producto documentada en
  DESIGN.md Â§2c â€” solo el dueÃ±o puede revertirla.
- Accesibilidad del visor 3D (P2, requiere diseÃ±o propio).
- Robot interfaz sobre el panel admin.

## CONTRACT

Post: â‘  input#pass tiene label[for] asociado; â‘¡ --accent del admin vale
#4E680A; â‘¢ la burbuja loading lleva role="status" aria-live="polite" y texto
sr-only; â‘£ #main-content es un elemento <main> y el chip del modo lleva
aria-pressed con estilo diferenciado en estado activo.

## INVARIANTS

```yaml
invariants:
  - "robot interfaz 214/214: contraste compuesto, desbordes, scroll anidado y
     objetivos tÃ¡ctiles no empeoran en 2 temas Ã— 3 anchos"
  - "CSS de .content-pane es por clase: cambiar el elemento no rompe layout"
  - "presupuestos de tamaÃ±o respetados (app.js/admin.html/index.html)"
  - "funcionalidad del toggle y del login idÃ©ntica"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
  - npm run robots:rapido   # interfaz va en tanda rÃ¡pida
```

## ROLLBACK

git revert (cambios de marcado/estilo aislados).

## Change Surface

```yaml
change_surface:
  allowed: [public/app.js, public/admin.html]
  prohibited: [server-pg.js, lib/, public/index.html, budgets.json]
```

## Blast Radius

```yaml
blast_radius:
  direct: [/admin (login), ChatBot UI, landmark principal de la SPA]
  indirect: [lectores de pantalla, robot interfaz]
  must_not_affect: [SSR pages, micro apps, catÃ¡logo, flujos de sesiÃ³n]
```

## Traceability

- Requirement: AuditorÃ­a Â§7 (brechas a11y 1 y 5) + Â§6 heurÃ­stica 1 + FT-0009 pulido
- Commit: add/FT-0012-interfaz-a11y
- Deployment: sin cambios

## Definition of Done

- [x] Objective satisfied Â· [x] Invariants preserved Â· [ ] Verification passed

