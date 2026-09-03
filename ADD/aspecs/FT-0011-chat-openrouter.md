# A.SPEC FT-0011 â€” Chat de IA vÃ­a OpenRouter (modelo gratis) con lÃ­mites

## WHY

El chat dependÃ­a exclusivamente de GEMINI_API_KEY (nunca configurada en local â†’
503 permanente para quien prueba). OpenRouter ofrece modelos `:free` sin costo;
la cuenta gratuita tiene tope por cuenta y dÃ­a, asÃ­ que hay que poner lÃ­mites
que estiren ese margen.

## WHAT

Si OPENROUTER_API_KEY estÃ¡ presente (secreto del host o variable de shell, NUNCA
en el repo), `/api/chat` usa OpenRouter vÃ­a fetch nativo con el modelo
`google/gemma-4-26b-a4b-it:free` (probado en vivo: responde en espaÃ±ol, sin
ruido de razonamiento). Gemini queda de respaldo; sin ninguna clave sigue el
503 `noKey`. LÃ­mites nuevos: techo GLOBAL diario del sitio (150/dÃ­a por defecto)
ademÃ¡s de los existentes por dispositivo (3) y por IP (30); respuesta limitada a
700 tokens; 429 del proveedor avisa al usuario SIN quemar su cuota diaria.

## SCOPE

- `server-pg.js`: consts OPENROUTER_*, lÃ­mites env-configurables
  (CHAT_DAILY_LIMIT / CHAT_IP_CEILING / CHAT_GLOBAL_CEILING), rama de proveedor,
  contador global bajo la clave fija `global:todos` en chat_limits.
- `.env.example`: documentaciÃ³n de las tres variables + modelo por defecto.
- Sin dependencias nuevas (fetch nativo de Node).

## OUT OF SCOPE

- Streaming, voz, historial persistente, cambio de UI del chat (eso es FT-0012).
- Guardar la clave real en `.env` (convenciÃ³n del proyecto: secretos fuera del repo).

## CONTRACT

Pre: sin GEMINI_API_KEY el chat respondÃ­a 503 noKey; validaciÃ³n y lÃ­mites por
dispositivo/IP probados.
Post: prioridad de proveedor = OpenRouter â†’ Gemini â†’ 503. El techo global usa la
misma tabla chat_limits. Los contadores se incrementan SOLO tras respuesta
exitosa del proveedor.

## INVARIANTS

```yaml
invariants:
  - "validaciÃ³n de message/history/deviceId intacta"
  - "chatLimiter (10/min) intacto"
  - "modo cliente/mecÃ¡nico (FT-0009) funciona en ambos proveedores: el sysPrompt
     se construye antes de elegir proveedor"
  - "guard variables-de-entorno-documentadas en verde: toda process.env.X nueva
     aparece en .env.example"
  - "guard sin-secretos-en-el-codigo en verde: ningÃºn valor de clave en fuentes"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
  - npm run robots:rapido   # toca el chat de IA â†’ obligatorio
```

Prueba manual en vivo: servidor local con OPENROUTER_API_KEY inyectada por
variable de shell â†’ pregunta tÃ©cnica en espaÃ±ol recibe respuesta del modelo :free.

## ROLLBACK

git revert; los contadores globales en chat_limits son filas mÃ¡s de una tabla
existente (no requieren migraciÃ³n inversa).

## Change Surface

```yaml
change_surface:
  allowed: [server-pg.js, .env.example]
  prohibited: [lib/, public/, quality/budgets.json]
```

## Blast Radius

```yaml
blast_radius:
  direct: [/api/chat]
  indirect: [cuota gratuita de la cuenta OpenRouter]
  must_not_affect: [resto de rutas, tests sin red, catÃ¡logo]
```

## Traceability

- Requirement: peticiÃ³n del dueÃ±o (2026-08-22) â€” IA gratis con mÃ¡rgenes controlados
- Commit: add/FT-0011-chat-openrouter
- Deployment: configurar OPENROUTER_API_KEY como secreto en Render

## Definition of Done

- [x] Objective satisfied Â· [x] Invariants preserved Â· [ ] Verification passed

