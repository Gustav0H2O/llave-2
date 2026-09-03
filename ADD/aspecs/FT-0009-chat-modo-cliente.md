# A.SPEC FT-0009 â€” Modo cliente en el asistente de IA

## WHY

Informe de nicho C1: las bÃºsquedas mÃ¡s voluminosas son de clientes ("sÃ­ntomas",
"cuÃ¡nto cuesta") pero el chat habla en jerga tÃ©cnica (PSI, STFT). El dueÃ±o del auto
necesita respuesta en lenguaje humano con gravedad y siguiente paso.

## WHAT

`POST /api/chat` acepta `modo:'cliente'` y usa una instrucciÃ³n de sistema distinta:
lenguaje llano, estructura fija (quÃ© pasa Â· gravedad Â· siguiente paso), mismo alcance
restringido al sistema de combustible y misma advertencia de manual. El modo
mecÃ¡nico queda EXACTAMENTE igual por defecto.

## SCOPE

- `server-pg.js`: selecciÃ³n de sysPrompt por `req.body.modo`.
- `public/app.js`: interruptor Â«Soy dueÃ±o del autoÂ» en ChatBot que envÃ­a el campo.

## OUT OF SCOPE

- LÃ­mites, rate limiting, historial, modelo Gemini (todo igual).
- Voz, imÃ¡genes, memoria entre sesiones.

## CONTRACT

Pre: /api/chat probado en contract.test.js (validaciÃ³n y lÃ­mites).
Post: con modo ausente o 'mecanico', el prompt es el actual; con 'cliente', el
prompt exigido contiene Â«lenguaje sencilloÂ». Cualquier otro valor cae a mecÃ¡nico.

## INVARIANTS

```yaml
invariants:
  - "CHAT_DAILY_LIMIT y respuestas limitReached idÃ©nticas"
  - "sanitizado de message/history intacto"
  - "sin clave GEMINI â†’ 503 igual que hoy"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
  - npm run robots:rapido   # toca el chat de IA â†’ obligatorio
```

Nota honesta: sin GEMINI_API_KEY las pruebas solo cubren validaciÃ³n/lÃ­mites;
la rama del prompt se verifica por inspecciÃ³n + robots (no 502/500).

## ROLLBACK

git revert (rama de prompt + toggle).

## Change Surface

```yaml
change_surface:
  allowed: [server-pg.js, public/app.js]
  prohibited: [lib/, budgets.json]
```

## Blast Radius

```yaml
blast_radius:
  direct: [/api/chat, ChatBot UI]
  indirect: [consumo de cuota diario]
  must_not_affect: [lÃ­mites, fichas, sesiÃ³n]
```

## Traceability

- Requirement: Informe Nicho 2026 Â§9 mejora 2 (C1)
- Commit: add/FT-0009-chat-modo-cliente
- Deployment: sin cambios

## Definition of Done

- [x] Objective satisfied Â· [x] Invariants preserved Â· [ ] Verification passed

