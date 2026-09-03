# A.SPEC FT-0008 â€” "GuÃ­as de DiagnÃ³stico" abre pantalla propia

## WHY

Robot jornada (3 fallos): la tarjeta 'GuÃ­as de DiagnÃ³stico' hacÃ­a
`window.location.href='/guias'`; al cargar esa URL la SPA pintaba el hero encima
del contenido SSR y no quedaba ningÃºn shell aceptado (.micro-shell/.app-shell/â€¦):
el robot lo lee como pantalla en blanco y el usuario pierde el contexto de la app.

## WHAT

La tarjeta abre una micro app propia (GuidesApp) con los enlaces a las 9 guÃ­as.
/guia/:slug se abre como pÃ¡gina normal; /guias sigue existiendo como Ã­ndice SEO.

## SCOPE

- `public/microapps.js`: constante GUIAS (slug+tÃ­tulo, espejo del GUIDES del
  servidor con contrato de duplicaciÃ³n documentado) y componente GuidesApp.
- `public/app.js`: `guides` pasa del mapa de atajos al registro de apps.

## OUT OF SCOPE

- Cambiar /guias o /guia/:slug en el servidor (eso es FT-0006).
- Contenido de las guÃ­as.

## CONTRACT

Post: abrir la tarjeta monta `.micro-shell` con tÃ­tulo Â«GuÃ­as de DiagnÃ³sticoÂ»,
cuerpo â‰¥200 caracteres y 9 enlaces `/guia/â€¦`. El botÃ³n Volver regresa al home.

## INVARIANTS

```yaml
invariants:
  - "las URLs de guÃ­as siguen existiendo y sirven SSR completo"
  - "las demÃ¡s tarjetas no cambian de comportamiento"
  - "presupuesto de tamaÃ±o de microapps.js respetado"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
  - npm run robots:rapido   # jornada va en tanda corta sin navegador: cubre registro de apps
```

Nota honesta: la comprobaciÃ³n completa de jornada usa Puppeteer y vive en
`npm run robots` (~5 min); se corre manual antes de integrar.

## ROLLBACK

git revert (componente nuevo + una lÃ­nea de registro).

## Change Surface

```yaml
change_surface:
  allowed: [public/microapps.js, public/app.js]
  prohibited: [server-pg.js, lib/, budgets.json]
```

## Blast Radius

```yaml
blast_radius:
  direct: [tarjeta 'GuÃ­as de DiagnÃ³stico']
  indirect: [robot jornada]
  must_not_affect: [otras micro apps, catÃ¡logo, chat]
```

## Traceability

- Requirement: ROBOTS.md jornada (Â«GuÃ­asÂ» en blanco) + AuditorÃ­a Â§6.9
- Commit: add/FT-0008-guias-pantalla-propia
- Deployment: sin cambios

## Definition of Done

- [x] Objective satisfied Â· [x] Invariants preserved Â· [ ] Verification passed

