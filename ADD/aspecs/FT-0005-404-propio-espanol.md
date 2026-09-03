# A.SPEC FT-0005 â€” 404 propio en espaÃ±ol para pÃ¡ginas

## WHY

Robot recorrido (5 URLs): cualquier ruta desconocida cae al 404 por defecto de
Express (`<html lang="en">`, tÃ­tulo Â«ErrorÂ», sin marca ni navegaciÃ³n). Una app en
espaÃ±ol no puede responder en inglÃ©s ni sin salida.

## WHAT

Toda peticiÃ³n NO-API que no matchee ninguna ruta recibe una pÃ¡gina 404 con marca,
en espaÃ±ol, con navegaciÃ³n a inicio/catÃ¡logo/guÃ­as y estado HTTP 404. Las rutas
/api/* siguen respondiendo JSON `{error:'No encontrado'}` como hoy.

## SCOPE

- `server-pg.js`: middleware catch-all de pÃ¡ginas tras el `app.use('/api', â€¦)`.
  Usa renderShell + staticApp (FT-0006).

## OUT OF SCOPE

- PÃ¡gina 500 HTML (los errores internos siguen en JSON para API; pÃ¡ginas caen al
  handler existente).
- Sitemap de sugerencias "quizÃ¡ buscabas".

## CONTRACT

Post: `GET /pagina-que-no-existe` â†’ 404, `lang="es"`, title contiene
Â«no encontradaÂ», body contiene enlace a `/`. `GET /api/inexistente` â†’ 404 JSON.

## INVARIANTS

```yaml
invariants:
  - "el fuzz robot sigue sin ver un solo 500"
  - "ningÃºn cambio en rutas existentes ni su orden relativo"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
  - npm run robots:rapido
```

## ROLLBACK

git revert (middleware aislado al final del stack).

## Change Surface

```yaml
change_surface:
  allowed: [server-pg.js]
  prohibited: [public/, lib/, test/qa/contract.test.js]
```

## Blast Radius

```yaml
blast_radius:
  direct: [rutas desconocidas]
  indirect: [robot recorrido, fuzz]
  must_not_affect: [rutas definidas, static files, /admin]
```

## Traceability

- Requirement: AuditorÃ­a Â§6.9 + ROBOTS.md recorrido (Â«el N lleva la marcaÂ»)
- Commit: add/FT-0005-404-propio-espanol
- Deployment: sin cambios

## Definition of Done

- [x] Objective satisfied Â· [x] Invariants preserved Â· [ ] Verification passed

