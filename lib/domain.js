'use strict';
/* ============================================================================
   lib/domain.js — REGLAS DEL TALLER (lógica pura, sin base de datos ni red).

   Estas reglas las dictó el dueño del taller a partir de su banco de pruebas.
   NO son adornos: cambiar un número aquí cambia el diagnóstico que un mecánico
   usa para decidir si una bomba sirve o no. Toda función de este archivo está
   cubierta por test/unit/domain.test.js — si cambias una regla, la prueba
   debe cambiar en el mismo commit y con una razón escrita.

   Regla de PSI en banco (pila sola, sin regulador, "deadhead"):
     · TBI puro .............. 60–70 PSI   (en riel, regulado por el cuerpo TBI: 9–13)
     · Full inyección (MFI) ... > 90 PSI
     · Vortec / CSFI ......... 90 PSI exacto
   Regla de PSI en riel (vehículo armado, llave ON / acelerado):
     · MFI genérico .......... 50 / 60 PSI
     · MFI familia Yaris ..... 38 / 44 PSI (Toyota 1NZ/2NZ/1ZZ/2ZR-FE)
     · TBI, Vortec, GDI ...... valor propio de cada sistema (no se toca)
   Regla del módulo con regulador integrado:
     · 60 PSI, o 75 PSI si el motor es V8 (rango de taller 60–80).
   ========================================================================= */

const {
  BRAND_GROUPS, GROUP_CONNECTOR, GROUP_MOUNT,
  BODY_KEYWORDS, YARIS_FAMILY, CLASS_PUMPS,
} = require('./catalog');

/* ---------- Tipo de carrocería (para el modelo 3D) ---------- */
function bodyType(model) {
  for (const [type, words] of Object.entries(BODY_KEYWORDS))
    if (words.some(w => model.includes(w))) return type;
  return 'sedan';
}

/* ---------- Familia de fabricante ---------- */
const brandGroup = (brand) => Object.keys(BRAND_GROUPS).find(g => BRAND_GROUPS[g].includes(brand)) || 'ASIA';

/* ---------- Perfil realista del módulo ----------
   Los ensambles NO son iguales entre sí: cambia el tipo (bomba externa, colgante,
   módulo integrado, Vortec, GDI de baja), el flotador según la época, el conector
   y la sujeción según el fabricante, y las líneas según el sistema. */
function moduleProfile({ brand, model, y1, y2, inj, ret, zone, isV8, disp, psiMax }) {
  const grp = brandGroup(brand);
  const assembly =
    zone === 'frame_rail'   ? 'external' :
    inj === 'TBI'           ? 'hanger_tbi' :
    inj === 'VORTEC_CSFI'   ? 'vortec' :
    inj === 'GDI'           ? 'gdi_low' :
    ret                     ? 'hanger_return' : 'module_returnless';

  // Flotador según la época (la electrónica del aforador cambió ~2004)
  const floatType = assembly === 'external'
    ? 'Aforador independiente dentro del tanque (unidad separada de la bomba externa)'
    : y1 >= 2004
      ? 'Brazo con tarjeta cerámica de película gruesa (señal estable; sensible a golpes en banco)'
      : 'Brazo con resistencia de alambre devanado (verificar barrido completo con óhmetro)';

  const P = {
    external: {
      namePrefix: 'Bomba externa',
      regulator: 'En el riel/sistema con línea de retorno al tanque (la bomba externa no regula)',
      strainer:  'Filtro-cedazo en línea ANTES de la bomba — crítico: la bomba externa no tolera sedimento del tanque',
      lines:     'Manguera de baja permeabilidad con abrazaderas; respetar el sentido de flujo marcado en la carcasa',
      connector: 'Bomba con 2 terminales (+/−) a la vista; el aforador del tanque lleva conector propio',
      mount:     'Abrazadera o soporte de lámina al chasis con gomas antivibración (las gomas duras hacen que la bomba "cante")',
      flow:      (f) => f,
      diagram:   'module_external',
    },
    hanger_tbi: {
      namePrefix: 'Colgante TBI',
      regulator: 'En el cuerpo TBI (9–13 PSI de trabajo); el colgante NO regula, solo porta la pila de baja',
      strainer:  'Cedazo de tela sobre la entrada de la pila, al fondo del colgante',
      lines:     'Alimentación 3/8" y retorno 5/16" soldadas a la placa + venteo EVAP; unión con abrazadera',
      connector: GROUP_CONNECTOR[grp],
      mount:     GROUP_MOUNT[grp],
      flow:      () => 90,
      diagram:   'module_hanger',
    },
    hanger_return: {
      namePrefix: 'Colgante',
      regulator: 'En riel/motor con línea de retorno al tanque (el colgante no trae regulador)',
      strainer:  'Cedazo de tela en la entrada de la pila; filtro externo en línea bajo el chasis o vano',
      lines:     'Alimentación y retorno en la placa + venteo al canister; unión con abrazadera u O-ring según el año',
      connector: GROUP_CONNECTOR[grp],
      mount:     GROUP_MOUNT[grp],
      flow:      (f) => f,
      diagram:   'module_hanger',
    },
    module_returnless: {
      namePrefix: 'Módulo',
      regulator: 'Integrado al vaso del módulo (sistema sin retorno)',
      strainer:  'Cedazo en la entrada del vaso + filtro de vida útil integrado al módulo (muchos años ya no llevan filtro externo)',
      lines:     'Una sola línea de alimentación con conexión rápida (quick-connect); venteo EVAP aparte',
      connector: GROUP_CONNECTOR[grp],
      mount:     GROUP_MOUNT[grp],
      flow:      (f) => f,
      diagram:   'module_intank_returnless',
    },
    vortec: {
      namePrefix: 'Módulo',
      regulator: 'En la unidad CSFI ("araña") dentro del pleno de admisión, con retorno al tanque',
      strainer:  'Cedazo de tela en la entrada de la pila; filtro externo en línea sobre el chasis',
      lines:     'Alimentación y retorno con conexión rápida metálica en la placa + venteo EVAP',
      connector: GROUP_CONNECTOR.GM,
      mount:     GROUP_MOUNT.GM,
      flow:      (f) => Math.max(f, 140),
      diagram:   'module_intank_return',
    },
    gdi_low: {
      namePrefix: 'Módulo GDI (baja)',
      regulator: 'Regulador de baja integrado al módulo; la presión de alta la genera la bomba mecánica en el motor',
      strainer:  'Cedazo en la entrada del vaso y del jet-pump (venturi que mantiene lleno el vaso)',
      lines:     'Una línea de baja presión con conexión rápida hacia la bomba de alta del motor',
      connector: GROUP_CONNECTOR[grp],
      mount:     GROUP_MOUNT[grp],
      flow:      (f) => f + 15,
      diagram:   'module_gdi',
    },
  }[assembly];

  return { assembly, floatType, ...P };
}

/* ---------- Reglas derivadas del catálogo ----------
   Cada una era código suelto dentro del bucle de siembra de seed.js. Vive aquí
   para que exista UNA sola definición de cada regla y se pueda probar sola. */

/* ¿Este vehículo pertenece a la familia Toyota de motor pequeño? */
const esFamiliaYaris = (brand, model) => brand === 'Toyota' && YARIS_FAMILY.has(model);

/* Presión de riel definitiva. Los MFI se normalizan a la regla de taller; el
   resto de sistemas conserva el valor declarado en el catálogo. */
function railPressure({ brand, model, inj, psiMin, psiMax }) {
  if (inj !== 'MFI') return { min: psiMin, max: psiMax };
  if (esFamiliaYaris(brand, model)) return { min: 38, max: 44 };
  return { min: 50, max: 60 };
}

/* Clase de pila (llave de CLASS_PUMPS) según el sistema de inyección.
   OJO: ya NO se decide por umbral de PSI — se decide por tipo de inyección. */
function pumpClass({ brand, model, inj }) {
  if (inj === 'GDI') return 'GDI';
  if (inj === 'TBI') return 'TBI';
  if (inj === 'VORTEC_CSFI') return 'VORTEC';
  return esFamiliaYaris(brand, model) ? 'MFI_ECO' : 'MFI_STD';
}

/* Cilindrada declarada en el texto del motor ("1.6L L4" -> 1.6). 2.0 por defecto. */
const displacement = (engine) => parseFloat((String(engine).match(/(\d+\.\d+)L/) || [])[1] || 2.0);

/* ¿El motor es V8? Decide el flujo base y la presión regulada del módulo. */
const isV8Engine = (engine) => /V8/.test(String(engine));

/* Flujo base estimado del módulo, en litros por hora. */
function baseFlow(engine) {
  const disp = displacement(engine);
  if (isV8Engine(engine)) return 150;
  if (/V6|L6|L5/.test(String(engine))) return 130;
  return disp <= 1.6 ? 95 : 110;
}

/* Presión regulada del módulo en banco. Solo el MFI sigue la regla de taller;
   TBI/Vortec/GDI conservan la presión de riel de su propio sistema. */
function moduleRegulatedPsi({ inj, engine, psiMax }) {
  if (inj !== 'MFI') return psiMax;
  return isV8Engine(engine) ? 75 : 60;
}

/* Código de módulo: FTM-<3 letras de la marca>-<secuencia de 3 dígitos>. */
const moduleCode = (brand, seq) =>
  `FTM-${String(brand).slice(0, 3).toUpperCase()}-${String(seq).padStart(3, '0')}`;

/* Nota del vehículo. Los datos no verificados SIEMPRE salen marcados: un
   mecánico no puede distinguir a simple vista un dato estimado de uno de manual. */
function vehicleNote({ verified, note }) {
  const isVerified = verified === undefined ? 1 : verified;
  return isVerified
    ? (note || null)
    : `⚠ ESTIMADO — verificar contra manual antes de reparar. ${note || ''}`.trim();
}

/* Pilas compatibles de una clase. Lanza si la clase no existe: un typo en la
   clase dejaría al vehículo sin ninguna pila y nadie se enteraría. */
function pumpsForClass(cls) {
  const list = CLASS_PUMPS[cls];
  if (!list) throw new Error(`Clase de pila desconocida: ${cls}`);
  return list;
}

module.exports = {
  bodyType, brandGroup, moduleProfile,
  esFamiliaYaris, railPressure, pumpClass,
  displacement, isV8Engine, baseFlow,
  moduleRegulatedPsi, moduleCode, vehicleNote, pumpsForClass,
};
