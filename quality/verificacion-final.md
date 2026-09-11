# Verificación final — segunda pasada (matriz de correcciones)

**Fecha:** 2026-09-11 · **Fuente:** `auditoria-fueltech-2026-09-10/MATRIZ-CORRECCIONES.md` (Olas 1-5)
**Método:** 3 re-auditorías de solo lectura en paralelo (seguridad · datos/arquitectura · SEO/a11y)
contrastando la matriz contra el código, más inspección directa de los huecos encontrados.

---

## Verificación ejecutable (estado al cerrar)

| Comando | Resultado |
|---|---|
| `npm test` | **753/753**, 0 fallos |
| `npm run guard` | **20 reglas, 0 violaciones** |
| `npm run metrics` | cobertura `lib/` **100 %** · 103 rutas (100 % probadas) · sin retrocesos |
| `npm run verify` | **TODO EN VERDE** |
| `npm audit --omit=dev` | **0 vulnerabilidades** |

---

## Estado por ola

| Ola | Alcance | Estado |
|---|---|---|
| 1 | Higiene de repo, deps, db.js, og-gen/migrate, NODE_ENV, admin.html, index.html, frontend | **Cerrada** (aplicada en la primera pasada) |
| 2a | Seguridad core (XSS, auth, logs, rate limits, MIME, scrypt) | **Cerrada** |
| 2b | Bugs de negocio y validación (2.14-2.21, 2.23, 2.28) | **Cerrada** |
| 2c | Admin/CSRF/CSP/SEO/config/health/aid-identify (2.24-2.41) | **Cerrada** |
| 3 | Contrato de API congelado (103 rutas + regla de guard) | **Cerrada** |
| 4.1-4.6 | lib/guias, lib/paginas, lib/sitemap, src/config, src/services/chat, identificador, anuncios, migraciones versionadas, import sin N+1, deduplicación | **Cerrada** |
| 4.7-4.9 | `src/routes/` por dominio, `src/middleware/`, `src/views/`, `src/services/`, migraciones; `server-pg.js` como ensamblador | **Cerrada** |

---

## Huecos reales detectados en la segunda pasada (y su resolución)

| # | Hueco | Severidad | Acción |
|---|---|---|---|
| 1 | `POST /api/orders/:id/items` no acotaba `unit_price` (un valor absurdo envenenaba el total) | Media | **Corregido** — tope 0..1e8 + 400, con prueba |
| 2 | `POST /api/backup/import` no validaba el MIME de `work_order_photos.photo` (un respaldo editado a mano podía meter un `data:image/svg+xml`) | Baja | **Corregido** — allowlist MIME en `sanear` + la fila inválida se descarta, con prueba |
| 3 | `scripts/metrics.js` corría la suite sin `--test-concurrency=1` → un test de timing fallaba de forma intermitente | Media (fiabilidad del gate) | **Corregido** — medición reproducible |
| 4 | `.gitignore` no cubría el comodín `*.db-*` | Baja | **Corregido** |
| 5 | `AGENTS.md` decía "18 reglas" y una tabla de estado obsoleta | Baja (doc) | **Corregido** — 20 reglas; 755 pruebas, 103 rutas |

### Hallazgos de la 2ª pasada que NO se tocaron (fuera de la matriz o de bajo impacto)

- `DESIGN.md` aún menciona GSAP ScrollTrigger y `public/fx.js` (ya eliminados): **doc drift**.
- `styleSrc` conserva `'unsafe-inline'` (necesario para estilos en línea; `scriptSrc` ya está cerrado).
- Registro/login devuelven oráculos distintos (`email_taken`, `use_google`): enumeración de cuentas, fuera del alcance de esta matriz.
- `enviarCorreo` devuelve `motivo: e.message` en un fallo de red de correo (no es error de driver).
- Cliente: no hay rama específica de estado para 412/413 (se cubren por el `throw` genérico de `api()`); el 413 sí está tratado en servidor.
- No hay prueba automática del runner de migraciones (`src/db/migrations.js`).

---

## Arquitectura final (Ola 4.7-4.9 ejecutada)

`server-pg.js`: **3898 → 438 líneas** (25 KB de 40 KB de presupuesto), ahora un **ensamblador**
que monta middlewares y routers. La API y el SSR viven en módulos:

- `src/routes/` — un `montar<Dominio>(app, deps)` por dominio: `catalog`, `orders`, `documents`,
  `connect`, `notifications`, `workshops`, `donations`, `inventory`, `clients`, `diagnostics`,
  `notes`, `cash`, `backup`, `admin`, `auth`, `paginas` (SSR) y `misc` (catch-alls).
- `src/middleware/` — CSP/nonce, CSRF, body-parser por ruta, redirects, estáticos, morgan.
- `src/services/` — `chat`, `identificador`, `anuncios`, `auth` (primitivas), `caches`.
- `src/views/shell.js` — la maqueta del SSR; `src/db/` — migraciones versionadas.

El contrato de API (103 rutas) sigue idéntico y la suite + los 6 robots están en verde.

### Deuda de escalado — resuelta

- Los **rate limiters** (express-rate-limit) ya no usan el MemoryStore: un `StoreBD`
  (`src/services/rate-limit-store.js`) guarda los contadores en la tabla `rate_limits`
  (migración `003-estado-escalado`). El cupo lo comparten todas las instancias y sobrevive
  a un reinicio; el incremento es un UPSERT atómico.
- El **lockout de login** (`failedLoginAttempts`) pasó del `Map` de proceso a la tabla
  `login_attempts`, con la misma clave `email|IP`, el mismo backoff (1,2,4,8,15 min) y el
  mismo bloqueo duro a 8.
- Queda como caché de proceso (aceptable, no es corrección): `metaCache`/`pumpsCache` y
  `visitSalt`. `VISIT_SALT` ya es obligatorio en producción.
- `src/repositories/` (sacar el SQL de los handlers) no se hizo: el SQL quedó junto a su ruta
  dentro de cada módulo de `src/routes/`, que ya es una capa suficiente para el tamaño actual.

---

## Acciones que dependen del dueño (no ejecutadas por la IA)

- `EMERGENCIAS-EXTERNAS.md`: rotar `TURSO_AUTH_TOKEN`, `DELETE FROM sessions;`, reset de
  contraseñas, regenerar Groq/OpenRouter/Google, y decidir la purga del historial
  (`git filter-repo` + `--force` o repo privado + ticket). **La IA no está autorizada a
  reescribir historial ni a hacer force push.**
- Commit único final y push: pendientes de orden explícita.
- `npm run robots` (fuera de `verify`): no se ejecutó la tanda completa de robots.

---

_Generado por la segunda pasada de la matriz de correcciones. Reglas del proyecto: `AGENTS.md`._
