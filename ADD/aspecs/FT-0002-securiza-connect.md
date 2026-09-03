# A.SPEC FT-0002 â€” Securizar /api/connect/*: subset pÃºblico y limitador

## WHY

AuditorÃ­a tÃ©cnica (hallazgo P0): `GET /api/connect/profiles` y `/api/connect/match`
devuelven TODOS los perfiles con PII (email, telÃ©fono, direcciÃ³n, lat/lng exactas)
sin autenticaciÃ³n, y `POST` permite altas masivas sin lÃ­mite propio. Contradice la
postura de seguridad del resto del proyecto.

## WHAT

Las respuestas pÃºblicas de connect ya NO contienen email, direcciÃ³n ni coordenadas
exactas; solo el subconjunto que un directorio necesita (id, role, name, phone,
city, zone, offers, needs) mÃ¡s distance_km/match_score calculados en servidor. El
POST de alta lleva limitador propio.

## SCOPE

- `server-pg.js`: SELECT con columnas explÃ­citas en profiles/match; `connectLimiter`
  en POST /api/connect/profiles.
- Prueba QA nueva: ninguna respuesta de connect expone email/address/lat/lng.

## OUT OF SCOPE

- Autenticar el GET (matarÃ­a el uso anÃ³nimo del directorio por clientes).
- El resto de endpoints /api/connect/locate.

## CONTRACT

Pre: los endpoints existen y estÃ¡n probados en contract.test.js.
Post: `JSON.parse(body)` de GET profiles/match no contiene las claves
`email`, `address`, `lat`, `lng`. POST sigue creando perfiles (201) pero con
limitador; a partir del lÃ­mite responde 429.

## INVARIANTS

```yaml
invariants:
  - "aislamiento y contrato de rutas existentes intactos (test-qa en verde)"
  - "el flujo conectar clienteâ†”mecÃ¡nico sigue funcionando para anÃ³nimos"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
  - npm run robots:rapido   # blast radius: superficie pÃºblica + fuzz
```

## ROLLBACK

Revertir el commit: restaurar `SELECT *` y quitar el limiter (git revert).

## Change Surface

```yaml
change_surface:
  allowed: [server-pg.js, test/qa/security.test.js]
  prohibited: [lib/, public/, quality/budgets.json]
```

## Blast Radius

```yaml
blast_radius:
  direct: [/api/connect/profiles, /api/connect/match]
  indirect: [micro-app "Conectar Cliente â†” MecÃ¡nico"]
  must_not_affect: [/taller/:slug, reseÃ±as, catÃ¡logo]
```

## Traceability

- Requirement: FuelTech_Master_Auditoria.pdf Â§9.2 hallazgo 1 (P0)
- Commit: add/FT-0002-securiza-connect
- Deployment: render.yaml (sin cambios)

## Definition of Done

- [x] Objective satisfied Â· [x] Invariants preserved Â· [ ] Verification passed

