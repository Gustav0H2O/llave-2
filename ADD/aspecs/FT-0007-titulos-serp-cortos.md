# A.SPEC FT-0007 â€” TÃ­tulos de pÃ¡gina â‰¤70 caracteres (SERP)

## WHY

Robot recorrido (15 pÃ¡ginas): tÃ­tulos de hasta 84 chars se cortan en el buscador.
El robot exige `title.length <= 70`; SEO sano pide â‰¤60. Todos los tÃ­tulos fijos se
acortan manteniendo unicidad (regla del robot: ningÃºn tÃ­tulo repetido).

## WHAT

Cada `<title>` servido mide â‰¤70 chars; el sufijo de marca pasa a Â«| FuelTechÂ»
donde el nombre largo no cabe. Los tÃ­tulos dinÃ¡micos (vehÃ­culo/taller) acortan su
plantilla de sufijo.

## SCOPE

- HOME_TITLE, /guias, GUIDESÃ—9, PAGES (acerca-de), /vehiculos, plantillas de
  taller y vehÃ­culo, y los tÃ­tulos nuevos (404, cÃ³mo-verificamos si aplica).

## OUT OF SCOPE

- Meta descriptions, OG images, contenido de h1.

## CONTRACT

Post: ninguna URL del sitemap supera 70 chars en `<title>`; no hay duplicados.

## INVARIANTS

```yaml
invariants:
  - "descripciones y canÃ³nicas intactas"
  - "JSON-LD sin cambios"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
  - npm run robots:rapido
```

## ROLLBACK

git revert (solo strings).

## Change Surface

```yaml
change_surface:
  allowed: [server-pg.js, og-gen.js]
  prohibited: [public/, quality/budgets.json]
```

## Blast Radius

```yaml
blast_radius:
  direct: [<title> de pÃ¡ginas SSR]
  indirect: [robot recorrido]
  must_not_affect: [rutas, contenidos, APIs]
```

## Traceability

- Requirement: ROBOTS.md recorrido (Â«el tÃ­tulo no se cortaÂ»)
- Commit: add/FT-0007-titulos-serp-cortos
- Deployment: sin cambios

## Definition of Done

- [x] Objective satisfied Â· [x] Invariants preserved Â· [ ] Verification passed

