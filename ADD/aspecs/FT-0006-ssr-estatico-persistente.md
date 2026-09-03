# A.SPEC FT-0006 â€” Contenido SSR persistente: pÃ¡ginas estÃ¡ticas sin takeover de React

## WHY

Robot recorrido (7 URLs): guÃ­as, legales, /vehiculos y perfiles de taller sirven
contenido real en el HTML, pero app.js monta la SPA sobre #root sin condiciÃ³n y lo
borra ("desapareciÃ³ Â«â€¦Â» y en su lugar se pintÃ³ el panel de inicio"). El contenido
que Googlebot-Ã­ndice y el usuario vio desaparece si JS tarda o falla.

## WHAT

renderShell acepta `staticApp`; las pÃ¡ginas de SOLO CONTENIDO estampan
`data-app="none"` en #root y app.js NO monta la SPA ahÃ­. Las pÃ¡ginas interactivas
(/, /vehiculo/:slug, /taller/:slug) siguen montando igual.

## SCOPE

- `server-pg.js`: opciÃ³n `staticApp` en renderShell; aplicada a PAGES (4),
  /guias, /guia/:slug y /vehiculos.
- `public/app.js`: guarda en el montaje (`dataset.app === 'none'` â†’ return).

## OUT OF SCOPE

- /taller/:slug (PublicProfileApp monto intencional, DESIGN.md Â§2d).
- /vehiculo/:slug (flujo data-vehicle).
- HidrataciÃ³n incremental u otras arquitecturas.

## CONTRACT

Pre: esas pÃ¡ginas renderizan su h1 en el HTML inicial.
Post: 3 s despuÃ©s de load, el h1 original SIGUE en el DOM y no existe .app-shell.

## INVARIANTS

```yaml
invariants:
  - "/, /vehiculo/:slug y /taller/:slug montan la app exactamente como hoy"
  - "los hashes CSP y el arranque de React en home no cambian"
  - "214 comprobaciones del robot interfaz en verde"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
  - npm run robots:rapido
```

## ROLLBACK

git revert (flag + una guarda de dos lÃ­neas).

## Change Surface

```yaml
change_surface:
  allowed: [server-pg.js, public/app.js]
  prohibited: [lib/, public/microapps.js, budgets.json]
```

## Blast Radius

```yaml
blast_radius:
  direct: [/guias, /guia/:slug, /acerca-de, /contacto, /privacidad, /terminos, /vehiculos]
  indirect: [SEO, robot recorrido]
  must_not_affect: [home SPA, fichas, perfil taller, chat]
```

## Traceability

- Requirement: AuditorÃ­a Â§6.9 fallo 2 + ROBOTS.md recorrido
- Commit: add/FT-0006-ssr-estatico-persistente
- Deployment: sin cambios

## Definition of Done

- [x] Objective satisfied Â· [x] Invariants preserved Â· [ ] Verification passed

