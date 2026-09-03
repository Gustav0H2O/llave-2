# A.SPEC FT-0003 â€” Hash de contraseÃ±as asÃ­ncrono (crypto.scrypt)

## WHY

Robot registro (1 fallo): `hashPassword`/`verifyPassword` usan `crypto.scryptSync`
(N=16384) y congelan el bucle 818 ms por alta; una consulta de catÃ¡logo simultÃ¡nea
pasa de ~6 ms a 668 ms. El KDF lento es correcto; bloquear el proceso entero, no.

## WHAT

El hashing/verificaciÃ³n usa `crypto.scrypt` asÃ­ncrono (promisificado). Durante un
alta, el retraso del bucle de eventos se mantiene en el orden del reposo (<120 ms).

## SCOPE

- `server-pg.js`: helper `scryptAsync`, `hashPassword`/`verifyPassword` async,
  await en register/login (Ãºnica llamada de cada uno).
- Sin cambios de formato del hash almacenado (`scrypt$N$r$p$salt$hash` intacto):
  las cuentas existentes siguen verificando.

## OUT OF SCOPE

- Cambiar N/r/p o el esquema de sesiones.
- La comparaciÃ³n de admin (ya timingSafeEqual aparte).

## CONTRACT

Post: registro y login responden igual (201/401/400); contraseÃ±as creadas antes
del cambio siguen siendo vÃ¡lidas en login.

## INVARIANTS

```yaml
invariants:
  - "formato de pass_hash inmutable â†’ cero migraciÃ³n"
  - "mensajes de error y cÃ³digos HTTP idÃ©nticos"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
  - npm run robots:rapido   # incluye robot registro en tanda corta
```

## ROLLBACK

git revert (funciones puras locales, sin estado).

## Change Surface

```yaml
change_surface:
  allowed: [server-pg.js]
  prohibited: [lib/, db.js, test/unit/domain.test.js]
```

## Blast Radius

```yaml
blast_radius:
  direct: [/api/auth/register, /api/auth/login]
  indirect: [todas las peticiones concurrentes durante un alta]
  must_not_affect: [admin HMAC, sesiones, perfiles]
```

## Traceability

- Requirement: AuditorÃ­a P1 + ROBOTS.md registro D2
- Commit: add/FT-0003-scrypt-asyncrono
- Deployment: sin cambios

## Definition of Done

- [x] Objective satisfied Â· [x] Invariants preserved Â· [ ] Verification passed

