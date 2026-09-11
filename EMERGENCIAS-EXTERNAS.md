# EMERGENCIAS EXTERNAS — E1 / Repo público con `llave.db` expuesta

> **MATRIZ ID 1.1 · Ref E1/R · Severidad: CRÍTICA · Solo ejecuta el DUEÑO**
> Fuente: `auditoria-fueltech-2026-09-10/00-SINTESIS-EJECUTIVA.md` (sección E1)
> y `02-seguridad-repo.md` (sección 4 + plan pasos 1-3).
> Este archivo es checklist manual. La IA que lo creó **no ejecutó nada externo**.

## Alcance confirmado (por qué esto es emergencia)

- Remoto real: `github.com/Gustav0H2O/llave.git` — **público** (HTTP 200 anónimo).
- Blob expuesto: `/raw/10c1752/llave.db` (commit `10c1752`, "borrado" en `e66fda9`
  **sin reescribir historial**). Blob `2389119`
  (`238911907b3172d840fa4d52f809465110b566ac`), ~450 KB, descargable hoy.
- Contenido del blob: **13 `workshops.pass_hash` (scrypt) + 11 `sessions.token_hash`
  + 2 `connect_profiles`** (email / teléfono / posible GPS lat-lng).
- Misma cadena que producción Turso (`TURSO_URL` + `TURSO_AUTH_TOKEN` del `.env` local).
- Backup previo ya existe en
  `C:\Users\EQUIPO\Downloads\bombas de gasolina-COPIA-SEGURIDAD-2026-09-11`.
  **No lo recrees. No clones de nuevo sin necesidad.**

## ⚠️ AVISO QUE NO SE NEGOCIA

> **La ROTACIÓN (pasos 1-4) NO es opcional aunque se purgue el historial.**
> El blob pudo ya descargarse (no hay log de quién lo bajó). Purgar el repo
> quita el acceso futuro, **no invalida** lo ya copiado: hashes atacables
> offline + sesiones reutilizables. Rotar corta el hilo de confianza.
> Purgar sin rotar = emergencia sin cerrar.

## Reglas para el ejecutor (dueño)

- Ejecuta **en orden 1 → 6**. No saltes al paso 5 antes del 1-4.
- **No pegues valores reales de secrets** en tickets, chats ni commits.
  Aquí solo se citan **nombres de variables** y **URLs de consolas**.
- No commitees `.env`, `*.db`, `*.db-shm`, `*.db-wal` en ningún paso.
- Si algo falla, detente y repite ese paso. No sigas "para avanzar".

---

## Paso 0 — Preparación (2 min, sin tocar nada sensible)

- [ ] Confirma que existe el backup:
  `bombas de gasolina-COPIA-SEGURIDAD-2026-09-11` (carpeta + `.git` incluido).
- [ ] Trabaja desde una red de confianza. Cierra sesiones compartidas.
- [ ] Ten a mano los accesos: Turso, Render, Groq, OpenRouter, Google Cloud, GitHub.

## Paso 1 — Rotar `TURSO_AUTH_TOKEN` (primero, HOY)

- [ ] Entra a `https://console.turso.tech` → tu base de producción → Tokens
  → **Create token** (o Rotate). Revoca el anterior.
- [ ] Actualiza el panel de Render (`https://dashboard.render.com` → servicio
  `llave` / `fueltech-master` → Environment):
  variable `TURSO_AUTH_TOKEN` = token nuevo. **No cambies `TURSO_URL`.**
  Guarda y **Redeploy**.
- [ ] Actualiza tu `.env` local: variable `TURSO_AUTH_TOKEN` = token nuevo.
  No toques ninguna otra línea. No commitees el `.env`.
- [ ] Verificación: la app en Render arranca y lee catálogo; una petición
  autenticada con el token viejo falla (token revocado).

Variables implicadas (solo nombres): `TURSO_URL`, `TURSO_AUTH_TOKEN`.

## Paso 2 — Invalidar TODAS las sesiones en Turso

Los 11 `token_hash` expuestos permiten robo de sesión si se revierten offline.

- [ ] Conéctate a la base Turso de producción (Dashboard → Shell, o Turso CLI
  contra `<tu-base-turso>` con el **token nuevo** del paso 1).
- [ ] Ejecuta el borrado exacto:

```sql
DELETE FROM sessions;
```

- [ ] Verificación exacta (debe devolver `0`):

```sql
SELECT COUNT(*) FROM sessions;
```

- [ ] Verificación funcional: intenta reusar una sesión vieja → debe pedir
  login de nuevo. Todos los talleres quedan deslogueados (esperado).

## Paso 3 — Forzar reset de `pass_hash` de talleres

Los 13 `pass_hash` (scrypt con sal) expuestos son atacables por diccionario
offline. Asume que ya están en manos de terceros.

- [ ] Vía preferida: dispara el flujo de **recuperación por email** para cada
  taller afectado y obliga cambio de contraseña en el próximo login.
- [ ] Vía de última instancia (si no hay flujo de recuperación operativo),
  fuerza re-registro invalidando hashes en Turso:

```sql
-- Auditoría previa: cuántos quedan por rotar (debe tender a 0 tras el reset).
SELECT COUNT(*) FROM workshops WHERE pass_hash IS NOT NULL;
-- Solo si decides invalidación dura (fuerza re-registro / recovery):
-- UPDATE workshops SET pass_hash = NULL;
```

- [ ] Verificación: ningún taller entra con su contraseña vieja; el login con
  credencial nueva funciona; `SELECT COUNT(*)` del paso anterior baja según
  lo que rotaste.
- [ ] No borres la tabla `workshops` ni sus emails: los necesitas para el
  paso 6 (notificación).

## Paso 4 — Regenerar Groq / OpenRouter / Google OAuth

No se filtraron por Git (verificado en 71 commits), pero conviven en el mismo
`.env`/disco que la cadena expuesta: se rota por duda razonable.

- [ ] `GROQ_API_KEY`: `https://console.groq.com` → API Keys → Revoke + Create.
  Actualiza `.env` local + variable del panel Render. Redeploy.
- [ ] `OPENROUTER_API_KEY`: `https://openrouter.ai` → Keys → Revoke + Create.
  Actualiza `.env` local + panel Render. Redeploy.
- [ ] Google OAuth: `https://console.cloud.google.com/apis/credentials` →
  tu Client ID → **Regenerate secret**. Actualiza `GOOGLE_CLIENT_ID` y
  `GOOGLE_CLIENT_SECRET` en `.env` local + panel Render. Redeploy.
- [ ] Verificación: chat IA responde (Groq/OpenRouter vivos) y Google Sign-In
  completa un login de prueba. Las claves viejas devuelven 401.

Variables implicadas (solo nombres): `GROQ_API_KEY`, `OPENROUTER_API_KEY`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

## Paso 5 — Decidir purga del historial (DESPUÉS de rotar, nunca antes)

Elige **A o B**. No hagas las dos a la vez sin entender el costo.

### Opción A — Reescribir historial + force push (elimina el blob)

- [ ] Avisa a colaboradores: el force push **rompe clones**. Todos deberán
  re-clonar tras el push.
- [ ] Desde un clon limpio con backup hecho (paso 0), purga los 3 archivos
  de **todos** los commits:

```bash
git filter-repo --invert-paths --path llave.db --path llave.db-shm --path llave.db-wal
```

Alternativa equivalente: BFG Repo-Cleaner borrando `llave.db*`.

- [ ] Force push de todo:

```bash
git push --force --all
git push --force --tags
```

- [ ] Verificación (la única que vale): en navegación privada / sin sesión,
  esta URL debe pasar de HTTP 200 a **HTTP 404**:

```bash
curl -I https://github.com/Gustav0H2O/llave/raw/10c1752/llave.db
```

  Repite a las 24 h: GitHub cachea blobs/forks un tiempo. Si sigue 200,
  pasa a la opción B (ticket) sin discutir.
- [ ] Nota: los emails de commits (`newpersonal98@gmail.com`) solo se borran
  si además reescribes autores. Decide si te compensa; no bloquea la emergencia.

### Opción B — Repo privado + ticket a GitHub Support (si no reescribes)

- [ ] GitHub → repo `Gustav0H2O/llave` → Settings → Danger Zone →
  **Change visibility → Make private**. Esto corta el acceso anónimo ya.
- [ ] Abre ticket a GitHub Support pidiendo purga del blob `2389119`
  (SHA completo `238911907b3172d840fa4d52f809465110b566ac`, commit `10c1752`,
  ruta `llave.db` + `llave.db-shm` + `llave.db-wal`) y de su caché.
  **No pegues secrets ni hashes de usuarios en el ticket**, solo IDs de blob/commit.
- [ ] Verificación: misma prueba que en A — `curl -I …/raw/10c1752/llave.db`
  debe dar **HTTP 404** (o 404/privado tras el cambio a privado).

## Paso 6 — Notificar a 13 talleres + 2 `connect_profiles`

Obligación de transparencia: emails / hashes / sesiones / posible GPS quedaron
expuestos públicamente. Consulta tu normativa local de protección de datos.

- [ ] Extrae **solo** la lista de contacto desde Turso (no exportes hashes):

```sql
SELECT email FROM workshops;
SELECT email, name, phone FROM connect_profiles;
```

- [ ] Envía aviso a los **13 talleres** (`workshops`) + **2 perfiles**
  (`connect_profiles`): qué se expuso (email + hash de contraseña + sesión,
  y en 2 casos teléfono/dirección/posible GPS), qué ya rotaste (token Turso,
  sesiones invalidadas), y qué deben hacer (cambiar contraseña, cerrar
  sesiones en otros equipos, revisar actividad).
- [ ] Registra fecha/hora de cada notificación (tabla simple fuera del repo).
- [ ] Verificación: 13 + 2 = **15 notificaciones** con acuse o intento
  documentado. Sin valores de hashes en los mensajes.

---

## Verificación final (todo verde = emergencia cerrada)

| # | Prueba | Esperado |
|---|---|---|
| 1 | Token Turso viejo contra la base | Falla (revocado) |
| 2 | `SELECT COUNT(*) FROM sessions;` en Turso | `0` tras el borrado |
| 3 | Login con contraseña vieja de taller | Falla; con nueva pasa |
| 4 | Groq/OpenRouter/Google con clave vieja | 401; con nueva funciona |
| 5 | `curl -I …/raw/10c1752/llave.db` anónimo | **HTTP 404** (tras purga + fin de caché) |
| 6 | Notificaciones 13 + 2 | 15 intentos documentados |

## Autorización (requerida por el plan de auditoría)

El dueño autoriza, **al final de este checklist y solo después de los pasos
1-4**, la ejecución del paso 5 opción A (`git filter-repo` + `git push
--force --all --tags`) o, en su defecto, la opción B (privatizar repo +
ticket a GitHub Support para purgar el blob `2389119`). La IA no está
autorizada a ejecutar ni la purga ni el force push.

---
*Sin valores reales de secrets en este archivo, solo nombres de variables y
URLs de consolas. No commitear `.env` ni `*.db` en ningún paso.*
