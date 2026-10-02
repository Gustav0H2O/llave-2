# Auditoría FuelTech Master — 2026-10-02

Evaluación completa del sistema para decidir si está listo para mandarse a
otros talleres y promocionarlo. Complementa a `DECISIONES.md` (el diario de
decisiones) y a `quality/REPORT.md` (métricas y deuda de datos).

Todo lo que aquí se afirma se verificó contra el código real, línea por línea,
no contra memoria. Las rutas y tallas se midieron con `npm run verify`
(restringe 20 reglas, corre 895 pruebas y chequea presupuestos).

## ✅ Funciona hoy (verificado en el código)

- **Órdenes abren**: el error `Cannot access 'orders'` (pantalla en blanco)
  está arreglado — `useApi` va antes de `useVerMas`
  (`public/microapps-taller.js:33-34`).
- **Formulario de documentos** ya no tapa los botones +/−: la columna de
  precio tiene ancho propio `.tw-line-price` (`public/taller.css:468`) en vez
  de la clase fantasma `w-24` que no existía en ningún CSS.
- **Cantidad editable** (`.tw-step-in`, `taller.css:415`): se teclea, ya no
  es un `<span>` de solo lectura.
- **Teléfono con código de país**: selector de país + `telInternacional`
  (`microapps-taller.js:6,510`).
- **Clientes**: paginación (`useVerMas`), país, búsqueda y exportación. El
  **Km del vehículo ahora sí se guarda** — antes el campo "Km actual" escribía
  en `notes` en vez de `mileage` (`microapps-taller.js:497,501,583,650`);
  el backend sí espera `mileage` (`src/routes/clients.js:89`).
- **Exportación real**: Excel `.xlsx` (ZIP con firma "PK"), PDF (con
  `%PDF-`/`%%EOF`/`startxref`) y CSV (punto y coma + BOM UTF-8) vía
  `src/services/exportar.js` — para documentos, inventario **y clientes**.
- **Agenda completa** (`public/microapps-agenda.js`): rejilla horaria, vista de
  mes 6×7, horario configurable del taller, duración de cita, asignación por
  mecánico, catálogo de servicios con color y detección de solapes.
- **Checklist**: el scroll infinito se resolvió con secciones plegables
  (`microapps-taller-2.js:155-161`).
- **Taller en segundo lugar** en el nav, **ErrorBoundary** en `app.js`,
  **vehículos a elegir de lista** en órdenes.
- **Aislamiento por taller**: toda consulta filtra por `workshop_id`; hay
  pruebas de que un taller no ve ni edita datos de otro.
- **Login Google OAuth**; la suite levanta el servidor real en `127.0.0.1:0`
  con SQLite en memoria (nunca toca la base de producción).

## 🔧 Arreglado en esta pasada (2026-10-02)

1. **Km del vehículo no se guardaba** — ver arriba.
2. **Exportar la cartera de clientes**: nueva `GET /api/clients/export`
   (`src/routes/clients.js:159`, CSV/XLSX/PDF), con botón Excel/PDF/CSV en la
   UI y pruebas 29c–29f (`test/qa/business-flows.test.js`), incluyendo aislamiento
   entre talleres.
3. **Buscar clientes** en la cartera por nombre/documento/teléfono/ciudad/correo
   (`microapps-taller.js:551`).
4. Se regeneró el snapshot de rutas (`test/contract/rutas.json`) para la ruta nueva.

## ⏳ Pendiente (lo que falta antes de promocionar)

- **Documentos fiscales** (`src/routes/documents.js`): el desglose
  subtotal/descuento/IVA ya existe (migración 012) y se imprime en el PDF.
  **Lo que sigue faltando:** RUC/NIT del taller, validez, condiciones, y la
  posibilidad de **corregir un documento ya emitido** — hoy solo existe
  `PUT /api/documents/:id/status`, no un `PUT /api/documents/:id` de contenido,
  ni **previsualizar antes de emitir**. Ver el apartado de estado de abajo.
- **Checklist**: la plantilla es ahora del taller y editable
  (`checklist_template`). Las inspecciones ya creadas no cambian.
- **Tiempos / mano de obra**: el catálogo es ahora `labor_catalog`, por taller,
  con su API (`/api/labor`).
- **Inventario**: cada artículo se clasifica como repuesto, servicio o consumible
  (`item_tipo`). Sigue sin haber catálogo para enviar a clientes ni forma de
  compartir entre talleres.

## Veredicto

**Condicionalmente listo.** El núcleo —clientes, vehículos, órdenes,
documentos, inventario, agenda, caja, inspecciones— es estable, con aislamiento
por taller probado y exportación real a Excel/PDF/CSV. Se puede mostrar y empezar
a usar en talleres de confianza ya.

## Estado al 2026-10-02 (cierre de los puntos 1 a 3)

Los tres puntos que la auditoría pedía antes de promocionar están cerrados, con
pruebas y en verde (`npm run verify`: 607 pruebas, 20/20 reglas):

| Punto | Estado | Donde |
| --- | --- | --- |
| Desglose fiscal de documentos | **Hecho** (subtotal, descuento, IVA sobre la base descontada, impreso en el PDF) | `documents.subtotal/descuento/iva_pct/iva`, migración 012 |
| CRUD de checklist | **Hecho** (plantilla por taller, editable) | `checklist_template`, migración 011, `/api/inspections/template` |
| CRUD de mano de obra | **Hecho** (catálogo por taller) | `labor_catalog`, migración 010, `/api/labor` |
| Servicios en el inventario | **Hecho a medias** (tipo repuesto/servicio/consumible + filtro) | `inventory_items.item_tipo`, migración 013 |

**Lo que sigue abierto, y por qué no se hizo:**

- **Vista previa antes de emitir** y **editar un documento ya emitido**
  (`PUT /api/documents/:id` de contenido): se decidió no tocarlos. Corregir un
  documento emitido tiene una consecuencia que no existe hoy — el folio ya está
  impreso y entregado, y la foto congelada del cliente es justamente lo que
  impide que el papel cambie. Sin una regla explícita de "emitido es inmutable",
  un PUT libre dejaría el histórico mal, que es peor que no poder corregir.
  **Esto es una decisión de negocio, no una limitación técnica.**
- **RUC/NIT fiscal, validez y condiciones**: es un trámite por país. Adivinar un
  supuesto (Venezuela, RUC; Bolivia, NIT) sin saber a qué mercado va el taller
  sería inventar el formato del documento.
- **Catálogo compartible entre talleres**: es un modelo de datos nuevo
  (publicar un catálogo, suscribirse, versionarlo), no un campo más.

**Sobre la venta a otros talleres:** esto ya no es un presupuesto interno. El
documento tiene subtotal, descuento, IVA y dice de dónde sale el total. Lo que
**no** tiene es el formato fiscal de un país concreto; si un taller necesita
factura oficial, falta el último tramo.

Los 5 problemas de datos del catálogo de autos (ver `quality/REPORT.md`, deuda
conocida pendiente) siguen sin resolverse — requieren decisión del dueño; no
bloquean el envío, pero conviene atenderlos.
