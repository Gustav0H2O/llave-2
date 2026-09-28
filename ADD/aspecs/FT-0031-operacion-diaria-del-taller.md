# A.SPEC FT-0031 — Operación diaria del taller: agenda, personal, checklist, alertas y cortes

## WHY

El taller tiene tres pantallas que prometen más de lo que dan y seis huecos que
el mecánico tapa con papel o con la memoria (los seis primeros salieron del
mapeo del taller y de comparar con seis sistemas de referencia: torqvoice,
carcareco, automotive-repair-management-system, GarageBuddy, taller_mecanico y
OCA/repair+fleet):

1. **La agenda vivía en el navegador.** `AppointmentsApp` guardaba las citas en
   `localStorage`: el celular de recepción y el del dueño tenían agendas
   distintas y no había forma de saber quién viene mañana desde otra máquina.
2. **La inspección de recepción no se guardaba.** Era una libreta que se copiaba
   a mano a la orden; en la entrega nadie podía probar qué se revisó.
3. **`work_orders.assigned_mechanic` era texto libre.** No se podía filtrar por
   persona ni saber la carga de cada uno, y el mismo mecánico aparecía escrito
   de tres formas.
4. **La existencia baja solo se pintaba en la pantalla.** Sin aviso que
   quedara: si nadie abría el inventario, la pieza se agotaba.
5. **La caja no tenía corte.** Se veían los movimientos del día, pero no había
   arqueo congelado: contar el efectivo y compararlo contra el sistema.
6. **Los documentos no conservaban la foto del cliente.** Si el cliente cambiaba
   el teléfono o vendía el carro, la reimpresión de una nota de entrega mostraba
   datos que no eran los que se entregaron.

Además el inventario se descuadraba de dos formas concretas: una partida no se
podía corregir sin borrarla y volver a crearla (perdiendo la referencia del
repuesto), y las compras no quedaban ligadas a la cartera de proveedores
(`suppliers` existía sin usarse en los movimientos).

## WHAT

Backend (`src/routes/`), con aislamiento por `workshop_id` en toda consulta:

- **`appointments.js`**: GET/POST/PUT/DELETE `/api/appointments`. La agenda deja
  de ser del navegador. Valida `AAAA-MM-DD` y `HH:MM`, y completa nombre del
  cliente y referencia del vehículo desde los ids.
- **`mechanics.js`**: GET/POST/PUT/DELETE `/api/mechanics`, con la carga
  (`open_orders`) calculada en el servidor. `work_orders.mechanic_id` (FK,
  ON DELETE SET NULL) sustituye al texto libre, que se conserva como etiqueta
  para imprimir.
- **`inspections.js`**: GET `/api/inspections?order_id=`, POST, PUT de la
  inspección completa y PUT de un punto. Plantilla servida por el servidor
  (entrada y salida) para que web, móvil y PDF midan lo mismo. El estado
  (`completa`/`incompleta`) se deriva SIEMPRE de los puntos, nunca a mano.
- **Puerta de entrega** (`orders.js`): una orden que entró con checklist de
  entrada no pasa a `Entregado` sin la inspección de salida completa; si nunca
  hubo entrada (órdenes viejas o flujos ligeros) no se bloquea.
- **Orden cerrada** (`orders.js`): una orden `Entregado` no acepta partidas
  nuevas, ni borrarlas, ni editarse (409). Se reabre desde el estado y entonces
  sí. Antes se podía borrar una partida de una orden entregada y el stock no
  volvía: el kardex mentía sobre una pieza que salió del taller.
- **Partida editable** (`PUT /api/orders/:id/items/:iid`): corrige cantidad,
  precio, tipo y repuesto recalculando el consumo de stock (devuelve el anterior
  y consume el nuevo) y el total de la orden.
- **Alertas de stock** (`src/services/stock.js` + `GET /api/inventory/alerts`):
  bandera `inventory_items.low_stock_alerted` + notificación del taller. Se
  emite UNA vez por episodio y se rearma al reponer, para no avisar cinco veces
  de la misma pieza.
- **Compras con proveedor**: `inventory_moves.supplier_id` (validado contra la
  cartera del taller).
- **Cortes de caja** (`cash.js`): GET/POST `/api/cash/closings`. Calcula el día
  (ingresos, egresos, saldo, por método y efectivo), guarda el arqueo congelado
  y la diferencia contra el conteo.
- **Vehículo editable y expediente** (`clients.js`):
  `PUT /api/clients/:id/vehicles/:vid` y
  `GET /api/clients/vehicles/:vid/history` (órdenes, documentos y facturado).
- **Foto congelada del documento** (`documents.js`): `client_snapshot` y
  `vehicle_snapshot` al emitir; la impresión prefiere la foto.

Esquema: `schema.sql` y `schema-pg.sql` en paridad (tablas `mechanics`,
`appointments`, `inspections`, `inspection_items`, `cash_closings`; columnas
`work_orders.mechanic_id`, `inventory_items.low_stock_alerted`,
`inventory_moves.supplier_id`, `documents.client_snapshot`,
`documents.vehicle_snapshot`) y migración versionada
`src/db/migrations/007-taller-agenda-operacion.js`.

Frontend sin build step: `public/microapps-taller-2.js` (archivo nuevo) con seis
pantallas —Agenda (servidor), Checklist de la Orden, Mecánicos, Alertas de
Existencia, Cortes de Caja y Expediente del Vehículo— y tres micro apps de
comunidad mudadas desde `microapps-taller.js` (Foro, Conectar, Mercado) más
Notas del Mecánico, que es lo que paga el tope de tamaño del archivo anterior.
`microapps-taller.js` gana además: editar partidas en su sitio, select de
mecánicos y botones hacia Alertas, Cortes y Expediente. Respaldo: las tablas y
columnas nuevas viajan en `/api/backup` (export e import).

## SCOPE

- `src/routes/{appointments,mechanics,inspections}.js` (nuevos),
  `src/services/stock.js` (nuevo), `src/routes/{orders,documents,cash,clients,inventory,backup}.js`,
  `src/db/migrations/007-taller-agenda-operacion.js`, `src/db/migrations/index.js`,
  `server-pg.js` (montaje y deps).
- `schema.sql`, `schema-pg.sql`.
- `scripts/guard.js` y `test/qa/invariants.test.js`: tablas nuevas en las listas
  de aislamiento por taller.
- `public/microapps-taller-2.js` (nuevo), `public/microapps-taller.js`,
  `public/app.js` (ids de las apps nuevas y candado), `public/index.html`
  (script tag), `public/sw.js` (SHELL), `quality/budgets.json`.
- `test/qa/taller-operacion.test.js` (nuevo), `test/qa/business-flows.test.js`,
  `test/contract/rutas.json`.

## OUT OF SCOPE

- No se toca `lib/` (las reglas de presión del taller no cambian).
- No se rediseña `OrdersApp` ni la vista de impresión más allá de las partidas.
- No se añade seguimiento de horas por mecánico (es otra A.SPEC).
- No se siembra ni migra contra Turso.

## CONTRACT

Post: la agenda, la plantilla de mecánicos, los checklists de entrada/salida,
las alertas de existencia, los cortes de caja, el expediente del vehículo y las
fotos del documento viven en la base del taller, filtrados por `workshop_id`;
una orden entregada está cerrada y una orden con checklist de entrada no se
entrega sin el de salida; el consumo de stock se ajusta cuando una partida se
edita. `npm run verify` en verde con la ruta nueva cubierta por prueba.

## INVARIANTS

```yaml
invariants:
  - guard:aislamiento-por-taller
  - guard:rutas-de-negocio-protegidas
  - guard:await-en-base-de-datos
  - guard:parametros-de-consulta-en-array
  - guard:id-validado-antes-de-consultar
  - "el esquema SQLite y el de PostgreSQL siguen en paridad (test/qa/invariants.test.js)"
  - "toda ruta /api aparece en alguna prueba (test/qa/contract.test.js)"
  - "una partida rechazada no mueve el inventario; editar una partida deja el stock y el total cuadrados"
  - guard:tamano-de-archivos
```

## VERIFICATION

```yaml
verification:
  - npm run verify
```

## ROLLBACK

`git revert` (la migración 007 es aditiva; revertirla deja las tablas nuevas sin
usar, sin pérdida de datos).

## Change Surface

```yaml
change_surface:
  allowed: [src/, server-pg.js, schema.sql, schema-pg.sql, public/, test/, scripts/guard.js, quality/, ADD/aspecs/FT-0031-*.md]
  prohibited: [lib/, db.js, .githooks/, ADD/VERIFY.yaml]
```

## Blast Radius

```yaml
blast_radius:
  direct: [API del taller, esquema de negocio, dashboard de micro apps, respaldo]
  indirect: [impresión de documentos (foto congelada), notificaciones del taller]
  must_not_affect: [catálogo de vehículos y pilas, reglas de presión, sesiones, CSP, chat de IA]
```

## Traceability

- Requirement: "implementar… todo para el área de taller, la sección taller y
  todas esas micro apps, con su UI y UX" — mapeo contra seis sistemas de
  referencia (torqvoice, carcareco, automotive-repair-management-system,
  GarageBuddy, taller_mecanico, OCA/repair+fleet).
- Commit: el único commit de la sesión.
- Deployment: la migración 007 corre al arrancar (runner versionado); no
  requiere paso manual.

## Definition of Done

- [x] Objective satisfied — [x] Invariants preserved — [x] Verification passed
