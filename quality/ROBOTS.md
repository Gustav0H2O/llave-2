# Informe de robots — FuelTech Master

> Generado por `npm run robots:informe`. **No lo edites a mano.**

**2026-08-22 13:43** · 5008 comprobaciones · 0 fallidas · 305s

## Resumen

| Robot | Comprobaciones | Fallidas | Tiempo | Qué cubre |
| --- | ---: | ---: | ---: | --- |
| ✅ `registro` | 1334 | — | 25.5s | Alta de cuenta, validación, limitador, altas masivas y sesiones |
| ✅ `aislamiento` | 139 | — | 1.4s | Fugas de datos entre talleres |
| ✅ `fuzz` | 2874 | — | 5.3s | Entradas hostiles contra toda la API |
| ✅ `carga` | 33 | — | 3.1s | Volumen, escalado, listados y concurrencia |
| ✅ `recorrido` | 248 | — | 31s | Todas las páginas del sitio, SEO, enlaces y 404 |
| ✅ `jornada` | 166 | — | 181.9s | Alta por formulario y las 38 herramientas, con navegador |
| ✅ `interfaz` | 214 | — | 57.2s | Contraste, desbordes y objetivos táctiles en 2 temas × 3 anchos |

## Hallazgos

Ninguno. Todos los robots en verde.

## Mediciones

### `registro`

```
de 30 intentos: 20 creadas, 10 frenadas con 429
300 creadas · 0 frenadas por el limitador · 0 anómalas
latencia del alta: p50 479.1ms · p95 803.1ms · p99 952.1ms · máx 980.1ms
retraso del bucle en reposo:       p50 11.3ms · p95 11.6ms · máx 13.6ms
retraso del bucle con 8 altas:     p50 11.3ms · p95 25.3ms · máx 43ms
consulta de catálogo mientras hay altas: p50 6.4ms · p95 14.4ms · máx 215.5ms
```

### `aislamiento`

```
ids de B: cliente=1 vehiculo=1 pieza=1 orden=1 partida=1 foto=1 documento=1 nota=1 caja=1 diagnostico=1
```

### `carga`

```
clientes      10 filas p50   10.8ms → 800 filas p50   30.5ms  (×2.8)
inventario    10 filas p50    6.9ms → 800 filas p50   12.3ms  (×1.8)
órdenes       10 filas p50    4.5ms → 800 filas p50   17.9ms  (×4)
notas         10 filas p50    6.2ms → 800 filas p50    6.5ms  (×1)
caja          10 filas p50    4.7ms → 800 filas p50    8.2ms  (×1.7)
movimientos   10 filas p50    4.1ms → 800 filas p50    3.3ms  (×0.8)
documentos    10 filas p50      3ms → 800 filas p50      3ms  (×1)
clientes      devuelve 500 de 800 filas  → tope en 500
inventario    devuelve 500 de 800 filas  → tope en 500
órdenes       devuelve 500 de 800 filas  → tope en 500
notas         devuelve 200 de 800 filas  → tope en 200
caja          devuelve 500 de 800 filas  → tope en 500
movimientos   devuelve 0 de 800 filas  → tope en 0
documentos    devuelve 0 de 800 filas  → tope en 0
/api/meta                    p50    3.8ms · p95      9ms  (tope 60ms)
/api/vehicles                p50    5.1ms · p95    6.5ms  (tope 80ms)
/api/vehicles?q=nissan       p50    4.3ms · p95    7.7ms  (tope 80ms)
/api/vehicles?limit=100      p50    4.6ms · p95      6ms  (tope 100ms)
/api/pumps                   p50    2.6ms · p95    3.1ms  (tope 60ms)
/api/modules                 p50    5.8ms · p95    6.7ms  (tope 80ms)
en serie p50 10.3ms · con 20 en paralelo p50 176.9ms · p95 272.8ms · máx 276.6ms
60 peticiones: 0 con error, 0 frenadas por el limitador
90 notas creadas (0 frenadas) · p50 3.1ms · p95 4.7ms
primeras 20: p50 3.6ms · últimas 20: p50 3ms
```

### `recorrido`

```
el sitemap declara 23 URLs
latencia de página: p50 78.7ms · p95 100.9ms · máx 101.7ms
46 bloques JSON-LD · 0 páginas sin meta descripción · 0 sin canónica
la API de administración responde 503 (sin ADMIN_PASSWORD: panel deshabilitado)
```

### `jornada`

```
apertura de herramienta: p50 518ms · p95 554ms · máx 555ms
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
