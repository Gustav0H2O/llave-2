# A.SPEC FT-0019 — Mejorar las diez micro apps de Consulta Rápida

## WHY

Las diez herramientas de la categoría «Consulta Rápida» son el núcleo del
producto, y varias tenían huecos concretos de uso:

- `torque` y `spark` eran tablas de solo lectura sin buscador: encontrar un
  componente entre decenas obligaba a recorrerlas con el dedo.
- `cross` hacía `fetch('/api/pumps').catch(() => {})`: si el endpoint fallaba,
  el desplegable quedaba vacío y no había forma de saber que había fallado ni
  de reintentar.
- `dtc` guardaba los códigos propios del taller solo en el navegador, sin forma
  de exportarlos ni de borrarlos en bloque.
- `vin` no validaba el dígito verificador (posición 9) ni explicaba por qué
  podría no cuadrar.
- `maintenance` volvía a listar servicios ya hechos porque nunca recordaba
  cuándo se hizo el último.
- `convert` olvidaba la magnitud entre visitas y perdía las pestañas al hacer
  scroll; `fuses` no tenía intro ni contador; `tires` solo daba el error del
  velocímetro en un sentido; y el catálogo (`search`) dejaba atrás el vehículo
  elegido al bajar la ficha.

## WHAT

Las diez de Consulta Rápida ganan el buscador o el estado que les faltaba:
torques y bujías filtran en vivo; Cross-Reference distingue carga, error y
reintento; DTC exporta y borra los códigos propios; VIN valida el dígito
verificador; mantenimiento recuerda el último servicio hecho; el conversor
recuerda la magnitud y mantiene sus pestañas visibles; todas llevan su párrafo
de entrada; y en el catálogo móvil la franja de resultados queda pegada arriba.

## SCOPE

- `public/microapps.js`: `DtcApp`, `TorqueApp`, `SparkApp`, `CrossApp`,
  `ConverterApp`, `VinApp`, `FusesApp`, `TireApp`, `MaintenanceApp`.
- `public/index.html`: reglas del catálogo móvil, `.dtc-barra` y `.conv-modes`.
- `public/app.js`: `MARK_ICONS` (WifiOff, RefreshCw) y el esqueleto del home.

## OUT OF SCOPE

- Las micro apps de otras categorías y las de gestión.
- API, base de datos, `lib/` y `src/`.
- Contenido de referencia nuevo inventado.

## CONTRACT

Post: cada una de las diez herramientas pinta su intro, resuelve su estado
vacío con salida, y la mejora declarada existe. `CrossApp` nunca falla en
silencio; `VinApp` calcula el dígito verificador (ISO 3779, módulo 11);
`MaintenanceApp` calcula el próximo servicio desde el último «Hecho» guardado.

## INVARIANTS

```yaml
invariants:
  - guard:tamano-de-archivos (budgets.json respetado)
  - guard:convenciones-de-htm-react (htmlFor, maxLength)
  - "movil-pwa: todo CatIc nuevo está en MARK_ICONS"
  - "robot interfaz: contraste, desbordes, scroll anidado y objetivos táctiles no empeoran"
```

## VERIFICATION

```yaml
verification:
  - npm run verify
  - npm run robots:rapido
  - npm run robots   # interfaz + jornada abren las 38 herramientas
```

## ROLLBACK

`git revert` del commit.

## Change Surface

```yaml
change_surface:
  allowed: [public/microapps.js, public/index.html, public/app.js, quality/budgets.json]
  prohibited: [server-pg.js, src/, lib/, db.js]
```

## Blast Radius

```yaml
blast_radius:
  direct: [10 micro apps de Consulta Rápida, catálogo móvil]
  indirect: [robot interfaz, robot jornada]
  must_not_affect: [API, sesiones, aislamiento por taller, CSP]
```

## Traceability

- Requirement: "mejores la ui y sus funcionamiento … en la seccion de consultas"
- Commit: add/FT-0019-consulta-rapida
- Deployment: assets de public/ → subir CACHE del service worker

## Definition of Done

- [x] Objective satisfied
- [x] Scope respected
- [x] Invariants preserved
- [ ] Verification passed
