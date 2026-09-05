# Informe de robots — FuelTech Master

> Generado por `npm run robots:informe`. **No lo edites a mano.**

**2026-09-05 17:17** · 4775 comprobaciones · 0 fallidas · 71s

## Resumen

| Robot | Comprobaciones | Fallidas | Tiempo | Qué cubre |
| --- | ---: | ---: | ---: | --- |
| ✅ `registro` | 1334 | — | 52.9s | Alta de cuenta, validación, limitador, altas masivas y sesiones |
| ✅ `aislamiento` | 139 | — | 3s | Fugas de datos entre talleres |
| ✅ `fuzz` | 3029 | — | 8s | Entradas hostiles contra toda la API |
| ✅ `carga` | 33 | — | 3.9s | Volumen, escalado, listados y concurrencia |
| ✅ `recorrido` | 240 | — | 1.7s | Todas las páginas del sitio, SEO, enlaces y 404 |
| ✅ `jornada` | 0 | — | 0.6s | Alta por formulario y las 38 herramientas, con navegador |
| ✅ `interfaz` | 0 | — | 0.6s | Contraste, desbordes y objetivos táctiles en 2 temas × 3 anchos |

## Hallazgos

Ninguno. Todos los robots en verde.

## Mediciones

### `registro`

```
de 30 intentos: 20 creadas, 10 frenadas con 429
300 creadas · 0 frenadas por el limitador · 0 anómalas
latencia del alta: p50 1061.1ms · p95 1993.6ms · p99 2126.2ms · máx 2127.8ms
retraso del bucle en reposo:       p50 24.7ms · p95 65.5ms · máx 65.5ms
retraso del bucle con 8 altas:     p50 17.3ms · p95 46.9ms · máx 65.4ms
consulta de catálogo mientras hay altas: p50 14.6ms · p95 93ms · máx 372.4ms
```

### `aislamiento`

```
ids de B: cliente=1 vehiculo=1 pieza=1 orden=1 partida=1 foto=1 documento=1 nota=1 caja=1 diagnostico=1
```

### `carga`

```
clientes      10 filas p50   13.3ms → 800 filas p50   41.6ms  (×3.1)
inventario    10 filas p50     11ms → 800 filas p50   10.9ms  (×1)
órdenes       10 filas p50    7.3ms → 800 filas p50   17.1ms  (×2.3)
notas         10 filas p50    8.4ms → 800 filas p50    5.7ms  (×0.7)
caja          10 filas p50    5.3ms → 800 filas p50    7.9ms  (×1.5)
movimientos   10 filas p50    8.3ms → 800 filas p50    2.9ms  (×0.3)
documentos    10 filas p50    4.2ms → 800 filas p50    2.8ms  (×0.7)
clientes      devuelve 500 de 800 filas  → tope en 500
inventario    devuelve 500 de 800 filas  → tope en 500
órdenes       devuelve 500 de 800 filas  → tope en 500
notas         devuelve 200 de 800 filas  → tope en 200
caja          devuelve 500 de 800 filas  → tope en 500
movimientos   devuelve 0 de 800 filas  → tope en 0
documentos    devuelve 0 de 800 filas  → tope en 0
/api/meta                    p50    3.3ms · p95   28.6ms  (tope 60ms)
/api/vehicles                p50    4.9ms · p95    8.9ms  (tope 80ms)
/api/vehicles?q=nissan       p50    8.4ms · p95   22.2ms  (tope 80ms)
/api/vehicles?limit=100      p50    7.1ms · p95   13.3ms  (tope 100ms)
/api/pumps                   p50    4.8ms · p95    5.7ms  (tope 60ms)
/api/modules                 p50      7ms · p95   20.2ms  (tope 80ms)
en serie p50 9.4ms · con 20 en paralelo p50 167.4ms · p95 263.3ms · máx 268.2ms
60 peticiones: 0 con error, 0 frenadas por el limitador
90 notas creadas (0 frenadas) · p50 2.9ms · p95 4.3ms
primeras 20: p50 3.1ms · últimas 20: p50 2.7ms
```

### `recorrido`

```
el sitemap declara 23 URLs
latencia de página: p50 77.6ms · p95 131.4ms · máx 131.8ms
46 bloques JSON-LD · 0 páginas sin meta descripción · 0 sin canónica
sin puppeteer: no se puede comprobar
la API de administración responde 503 (sin ADMIN_PASSWORD: panel deshabilitado)
```

### `jornada`

```
puppeteer no está instalado; se omite
```

### `interfaz`

```
puppeteer no está instalado; se omite el robot de interfaz
```

## Cómo se reproduce

```bash
npm run robots              # los siete
npm run robots:rapido       # tandas cortas, sin navegador
npm run robots:informe      # los siete + regenera este fichero
npm run robots -- --solo=aislamiento,fuzz
```

Las bases son siempre en memoria. `test/robots/comun.js` vacía `TURSO_URL`,
`TURSO_AUTH_TOKEN` y `DATABASE_URL` **antes** de cargar nada, porque `db.js`
lee el `.env` del repo —que apunta a producción— al importarse.
