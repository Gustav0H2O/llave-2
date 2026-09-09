# Informe de calidad — FuelTech Master

_Generado el 2026-09-09 16:46 por `npm run metrics`. No lo edites a mano._

## ✅ Todos los presupuestos se cumplen

Nada que corregir.

## Resumen

| Métrica | Valor | Estado |
| --- | --- | --- |
| Pruebas que pasan | 529 / 529 | ✅ |
| Duración de la suite | 14.2 s | ✅ |
| Reglas de restricción | 19 reglas, 0 violaciones | ✅ |
| Rutas de API probadas | 100% de 95 | ✅ |
| Deuda conocida aceptada | 5 de 5 | ✅ |
| Razón prueba/código | 0.67x | ✅ |

## Cobertura de las reglas del taller (lib/)

```
✓ lib/catalog.js     ████████████████████████   100%  (mínimo 80%)
✓ lib/domain.js      ████████████████████████   100%  (mínimo 90%)
  lib/errores.js     ████████████████████████   100%
  lib/notificaciones.js ███████████████████████░  95.6%
  lib/portada.js     ████████████████████████   100%
✓ lib/pure.js        ████████████████████████   100%  (mínimo 95%)
  lib/ruta.js        ████████████████████████   100%
```

## Catálogo

- **208** vehículos de **33** marcas, con **10** pilas.
- Por sistema de inyección: MFI 157 · TBI 1 · VORTEC_CSFI 3 · GDI 47.
- **104** vehículos (50%) llevan datos ESTIMADOS y salen marcados en la ficha.

## Tamaño de los archivos que descarga el usuario

```
✓ public/app.js              133.2 KB  de 138 KB
✓ public/microapps.js        197.5 KB  de 198 KB
✓ public/microapps-taller.js    74.5 KB  de 75 KB
✓ public/datos.js             14.6 KB  de 16 KB
✓ public/index.html          185.7 KB  de 186 KB
✓ public/three3d.js           34.9 KB  de 68 KB
✓ public/sw.js                 5.8 KB  de 8 KB
✓ server-pg.js               227.2 KB  de 228 KB
```

## Evolución respecto a la referencia

**Mejoras:**

- pruebas_total: 519 → 529


## Deuda conocida pendiente de decisión

- **Renault|Kwid|2019|2024|MFI** — Dos filas del mismo vehículo con el mismo sistema de inyección y la misma presión (43-51 PSI); solo cambia el texto del motor ('1.0L L4' vs '1.0L L3'). El Kwid es tricilíndrico, así que la fila 'L4' parece un error de captura. Producen módulos distintos (FTM-REN-xxx duplicado) y el buscador devuelve el mismo auto dos veces. _(PENDIENTE — el dueño del taller debe confirmar cuál fila se borra. Detectado el 2026-08-11.)_
- **Renault|Duster|MFI** — Dos filas con años solapados (2012-2019 '2.0L L4' verificada y 2013-2023 '1.6L / 2.0L L4' estimada). Un Duster 2015 devuelve dos fichas. Como ambas son MFI acaban con la misma presión (50-60), así que el daño es duplicado en el buscador, no contradicción. _(PENDIENTE — probablemente hay que recortar la fila estimada a 2020-2023. Detectado el 2026-08-11.)_
- **Mitsubishi|L200|MFI** — GRAVE: 2008-2015 (retorno=0) y 2010-2023 (retorno=1) se solapan en 2010-2015 y SE CONTRADICEN. Al diferir el retorno, generan arquetipos de módulo distintos (module_returnless vs hanger_return): un L200 2012 muestra dos despieces incompatibles y el mecánico no sabe cuál pedir. _(PENDIENTE — hay que confirmar en qué año el L200 pasó a sistema con retorno y cortar los rangos ahí. Detectado el 2026-08-11.)_
- **Chevrolet|Tracker|GDI** — 2021-2024 (58-68 PSI) y 2020-2024 (55-72 PSI) se solapan casi por completo y declaran presiones distintas para el mismo auto. Ambas son estimadas. _(PENDIENTE — fusionar en una sola fila con la presión correcta de manual. Detectado el 2026-08-11.)_
- **AIRTEX E8213 (universal)** — Está definida en PUMPS (100 PSI, 8 A, 125 LPH, turbina de alta) pero ninguna clase de CLASS_PUMPS la referencia, así que nunca se ofrece a ningún vehículo. O se enlaza a MFI_STD como alternativa universal, o se borra de PUMPS. _(PENDIENTE — el dueño del taller decide si la vende. Detectado el 2026-08-11.)_

---

Reglas para modificar este sistema: ver `AGENTS.md`.
