# Informe de robots — FuelTech Master

> Generado por `npm run robots:informe`. **No lo edites a mano.**

**2026-08-12 18:00** · 5050 comprobaciones · 33 fallidas · 321s

## Resumen

| Robot | Comprobaciones | Fallidas | Tiempo | Qué cubre |
| --- | ---: | ---: | ---: | --- |
| ❌ `registro` | 1334 | 1 | 40.7s | Alta de cuenta, validación, limitador, altas masivas y sesiones |
| ✅ `aislamiento` | 139 | — | 1.2s | Fugas de datos entre talleres |
| ✅ `fuzz` | 2916 | — | 5s | Entradas hostiles contra toda la API |
| ❌ `carga` | 33 | 2 | 4.1s | Volumen, escalado, listados y concurrencia |
| ❌ `recorrido` | 248 | 27 | 32.5s | Todas las páginas del sitio, SEO, enlaces y 404 |
| ❌ `jornada` | 166 | 3 | 179.6s | Alta por formulario y las 38 herramientas, con navegador |
| ✅ `interfaz` | 214 | — | 57.5s | Contraste, desbordes y objetivos táctiles en 2 temas × 3 anchos |

## Hallazgos

Agrupados por clase: una misma causa produce muchas líneas iguales, y lo que
importa es cuántos problemas distintos hay, no cuántas veces se repiten.

### `registro` — 1 clase(s) de fallo

- **un alta no deja el bucle de eventos parado más de 120ms**
  - Evidencia: se paró 818.5ms de golpe (en reposo: 13ms) — crypto.scryptSync es SÍNCRONO y congela el proceso entero; crypto.scrypt() asíncrono hace el mismo trabajo sin bloquear

### `carga` — 2 clase(s) de fallo

- **clientes: el listado tiene tope**
  - Dónde: `clientes`
  - Evidencia: devolvió las 800 filas existentes — sin LIMIT ni paginación (o con un tope superior a 800)
- **inventario: el listado tiene tope**
  - Dónde: `inventario`
  - Evidencia: devolvió las 800 filas existentes — sin LIMIT ni paginación (o con un tope superior a 800)

### `recorrido` — 3 clase(s) de fallo

- **el título no se corta en el buscador** — afecta a 15
  - Dónde: `/`, `/guia/sintomas-bomba-de-gasolina-fallando`, `/guia/como-medir-la-presion-de-combustible`, `/guia/presion-de-combustible-baja`, `/guia/presion-de-combustible-alta`, `/guia/regulador-de-presion-de-combustible`, `/guia/voltaje-circuito-bomba-de-gasolina`, `/guia/inyeccion-gdi-vs-mfi-presion …`
  - Evidencia: 72 caracteres: «FuelTech Master — Presión de riel (PSI/Bar), módulos y pilas de gasolina»
- **el N lleva la marca y una salida** — afecta a 5
  - Dónde: `/vehiculo/no-existe-jamas`, `/guia/inventada`, `/vehiculo/`, `/vehiculo/<script>alert(1)</script>`, `/pagina-que-no-existe`
  - Evidencia: sale el 404 por defecto de Express, en inglés y sin navegación: <!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-8"> <title>Error</title> </head
- **el contenido servido sigue visible tras montar React** — afecta a 7
  - Dónde: `/guia/presion-de-combustible-baja`, `/acerca-de`, `/contacto`, `/privacidad`, `/terminos`, `/vehiculos`, `/taller/taller-el-recorrido`
  - Evidencia: desapareció «Presión de combustible baja: causas y diagnós» y en su lugar se pintó el panel de inicio — el título sigue diciendo «Presión de combustible baja: causas y cómo di»

### `jornada` — 3 clase(s) de fallo

- **«…» abre alguna pantalla**
  - Dónde: `Guías de Diagnóstico`
  - Evidencia: no se montó ni la app ni el alta: pantalla en blanco
- **«…» pinta contenido o explica que hace falta cuenta**
  - Dónde: `Guías de Diagnóstico`
  - Evidencia: cuerpo con 39 caracteres y sin aviso — fallo mudo
- **«…» pinta su contenido con sesión abierta**
  - Dónde: `Guías de Diagnóstico`
  - Evidencia: cuerpo completamente vacío

## Mediciones

### `registro`

```
de 30 intentos: 20 creadas, 10 frenadas con 429
300 creadas · 0 frenadas por el limitador · 0 anómalas
latencia del alta: p50 1579.9ms · p95 1718ms · p99 1727.3ms · máx 1727.8ms
retraso del bucle en reposo:       p50 11.1ms · p95 11.8ms · máx 13ms
retraso del bucle con 8 altas:     p50 10.8ms · p95 12ms · máx 818.5ms
cada alta cuesta ~115ms de CPU con el hilo bloqueado (crypto.scryptSync, N=16384)
consulta de catálogo mientras hay altas: p50 5.8ms · p95 10.6ms · máx 668.6ms
```

### `aislamiento`

```
ids de B: cliente=1 vehiculo=1 pieza=1 orden=1 partida=1 foto=1 documento=1 nota=1 caja=1 diagnostico=1
```

### `carga`

```
clientes      10 filas p50   22.3ms → 800 filas p50   44.8ms  (×2)
inventario    10 filas p50   18.7ms → 800 filas p50   26.3ms  (×1.4)
órdenes       10 filas p50      7ms → 800 filas p50   23.2ms  (×3.3)
notas         10 filas p50    7.5ms → 800 filas p50    5.6ms  (×0.7)
caja          10 filas p50    7.2ms → 800 filas p50    7.6ms  (×1.1)
movimientos   10 filas p50    7.6ms → 800 filas p50    2.7ms  (×0.4)
documentos    10 filas p50    4.9ms → 800 filas p50    2.6ms  (×0.5)
clientes      devuelve 800 de 800 filas  → SIN TOPE detectado
inventario    devuelve 800 de 800 filas  → SIN TOPE detectado
órdenes       devuelve 500 de 800 filas  → tope en 500
notas         devuelve 200 de 800 filas  → tope en 200
caja          devuelve 500 de 800 filas  → tope en 500
movimientos   devuelve 0 de 800 filas  → tope en 0
documentos    devuelve 0 de 800 filas  → tope en 0
/api/meta                    p50    2.6ms · p95    6.9ms  (tope 60ms)
/api/vehicles                p50    4.1ms · p95    5.4ms  (tope 80ms)
/api/vehicles?q=nissan       p50    4.1ms · p95    6.3ms  (tope 80ms)
/api/vehicles?limit=100      p50    4.2ms · p95    5.6ms  (tope 100ms)
/api/pumps                   p50    3.1ms · p95    4.2ms  (tope 60ms)
/api/modules                 p50    5.2ms · p95   12.6ms  (tope 80ms)
en serie p50 9.3ms · con 20 en paralelo p50 134.8ms · p95 249.4ms · máx 249.7ms
60 peticiones: 0 con error, 0 frenadas por el limitador
90 notas creadas (0 frenadas) · p50 2.7ms · p95 4.4ms
primeras 20: p50 3ms · últimas 20: p50 2.6ms
```

### `recorrido`

```
el sitemap declara 23 URLs
latencia de página: p50 69ms · p95 108.8ms · máx 114.3ms
46 bloques JSON-LD · 0 páginas sin meta descripción · 0 sin canónica
la API de administración responde 503 (sin ADMIN_PASSWORD: panel deshabilitado)
```

### `jornada`

```
apertura de herramienta: p50 510ms · p95 536ms · máx 540ms
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
