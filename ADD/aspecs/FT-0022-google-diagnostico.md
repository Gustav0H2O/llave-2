# A.SPEC FT-0022 — Diagnóstico y redirect canónico del acceso con Google

## WHY

El dueño reporta que "no quiere registrar ni iniciar sesión con Google". El
síntoma —vuelve al inicio sin entrar— corresponde a `google_error`, que es el
cajón de sastre del callback: cubre el `state` inválido, el fallo del
intercambio de código y cualquier excepción. El problema no era la lógica (está
cubierta por `test/qa/oauth-google.test.js`), sino que el fallo era **mudo**:

- La ruta que inicia el flujo redirigía a `google_unconfigured` **sin escribir
  nada en el log** cuando faltaban las credenciales en el host.
- El error del intercambio de tokens solo se registraba en desarrollo.
- El `redirect_uri` se derivaba del `Host` de la petición, así que un alias
  distinto del canónico producía el clásico `redirect_uri_mismatch`.
- La pantalla solo decía "prueba de nuevo".

## WHAT

Un fallo de Google deja de ser mudo: el servidor registra siempre el motivo
(estado, error del intercambio, `redirect_uri` usado) y la pantalla muestra un
código corto que se puede enviar a soporte. En producción el `redirect_uri` es
el dominio canónico (`BASE_URL`), que es el que se registra en Google Console.

## SCOPE

- `src/routes/auth.js`: `googleRedirectUri` (BASE_URL en PROD), log de
  credenciales ausentes, código de Google en el error de token, `oauthDetalle`
  en cada `throw`, y `detalle` en las redirecciones de fallo.
- `public/app.js`: leer `detalle` y mostrarlo en el aviso de `google_error`.

## OUT OF SCOPE

- La doble puerta (`already_registered` / `not_registered`), que ya funciona y
  avisa en qué pestaña está el botón correcto.
- Flujo de contraseña (en producción responde 403 a propósito).
- Configurar las variables en el host: es una acción del dueño en el panel.

## CONTRACT

Post: ningún fallo de Google termina en silencio; el log trae el motivo y el
`redirect_uri`, y la URL de vuelta trae `detalle` con el código.

## INVARIANTS

```yaml
invariants:
  - guard:sin-secretos-en-el-codigo
  - "los logs no incluyen email, tokens ni secretos"
  - "test/qa/oauth-google.test.js sigue en verde (mismos destinos)"
  - "en PROD el redirect_uri es BASE_URL + /api/auth/google/callback"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
  - npm run robots:rapido
```

## ROLLBACK

`git revert`.

## Change Surface

```yaml
change_surface:
  allowed: [src/routes/auth.js, public/app.js]
  prohibited: [db.js, lib/, schema.sql]
```

## Blast Radius

```yaml
blast_radius:
  direct: [registro y acceso con Google]
  indirect: [logs del servidor, mensajes de la pantalla de acceso]
  must_not_affect: [sesiones, aislamiento por taller, resto de rutas de auth]
```

## Traceability

- Requirement: "no quiere registrar e iniciar sesion con google, y verifica sus logicas, limitantes, avisos"
- Commit: add/FT-0022-google-diagnostico
- Deployment: requiere `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` en el host y
  la URI `https://<dominio>/api/auth/google/callback` autorizada en Google Console

## Definition of Done

- [x] Objective satisfied · [x] Invariants preserved · [x] Verification passed
