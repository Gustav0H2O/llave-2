# A.SPEC FT-0029 — Licencia de propietario explícita

## WHY

El repositorio es **público** y no tenía licencia. Sin un archivo `LICENSE`,
GitHub lo muestra sin licencia y el que lo abre no sabe qué puede hacer con lo
que ve: el «todos los derechos reservados» del derecho de autor aplica por
defecto, pero queda implícito. Para un producto que se vende, la ambigüedad no
es neutral: ni protege de forma legible ni deja claro al cliente potencial qué
está mirando.

Además, el repositorio **redistribuye** código de terceros en `public/vendor/`
(React, htm, three.js, Tabler Icons: 8 archivos, licencias MIT). Un aviso de
propietario que no los exceptúe sería, además de ambiguo, falso.

## WHAT

El proyecto declara una licencia de propietario explícita: un `LICENSE` con
«todos los derechos reservados» que enumera lo prohibido, exceptúa los
componentes de terceros y dice por dónde se piden licencias comerciales. El
`package.json` lo refleja con `"license": "UNLICENSED"` y el README lo resume
con enlace al archivo.

## SCOPE

- `LICENSE` (nuevo): aviso de propietario, catálogo de datos, marca, terceros,
  plataforma, sin garantía y datos de referencia.
- `package.json`: campo `"license": "UNLICENSED"`.
- `README.md`: sección «📄 Licencia» con enlace a `LICENSE`.

## OUT OF SCOPE

- Los términos de uso del sitio servido (`/terminos`, `/privacidad`) no cambian.
- Los componentes de `public/vendor/` no se tocan: conservan sus licencias MIT.
- No se cambia la visibilidad del repositorio.

## CONTRACT

Post: existe `LICENSE` en la raíz con «Todos los derechos reservados» y la
enumeración de lo prohibido; `package.json` declara `UNLICENSED`; el README
enlaza a `LICENSE`; y el aviso exceptúa explícitamente los 8 archivos de
terceros de `public/vendor/`.

## INVARIANTS

```yaml
invariants:
  - "el paquete sigue instalable: `npm ls --depth=0` no falla por el campo license"
  - "las cabeceras de licencia MIT de public/vendor/ quedan intactas"
  - guard:tamano-de-archivos
```

## VERIFICATION

```yaml
verification:
  - npm run verify
```

## ROLLBACK

`git revert`.

## Change Surface

```yaml
change_surface:
  allowed: [LICENSE, package.json, README.md, ADD/aspecs/FT-0029-licencia-de-propietario.md, quality/REPORT.md, quality/history.ndjson]
  prohibited: [public/vendor/, public/, src/, lib/, server-pg.js, db.js]
```

## Blast Radius

```yaml
blast_radius:
  direct: [metadatos del paquete, portada del repositorio]
  indirect: []
  must_not_affect: [API, sesiones, catálogo de datos, CSP, sitios desplegados]
```

## Traceability

- Requirement: "ponle una licencia de propietario"
- Commit: add/FT-0029-licencia-de-propietario
- Deployment: metadatos del repositorio; no afecta al despliegue de la app

## Definition of Done

- [x] Objective satisfied · [x] Invariants preserved · [x] Verification passed
