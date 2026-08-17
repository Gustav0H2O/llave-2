#!/usr/bin/env node
'use strict';
/* ============================================================================
   scripts/guard-hook.js — puente entre el motor de restricciones y el editor.

   Lo invoca el hook PostToolUse de .claude/settings.json después de cada
   edición. Corre las reglas rápidas y, si hay violaciones, sale con código 2:
   así el editor devuelve el detalle al asistente en el momento, en vez de que
   se entere media hora después al correr `npm run verify`.

   Diseño deliberado:
     · Solo reglas rápidas (análisis estático puro, < 1 s). Un hook lento
       vuelve insoportable trabajar y se acaba desactivando.
     · Solo bloquea con gravedad 'error'. Los avisos se imprimen y ya.
     · Si el propio guard revienta, NO bloquea: una herramienta de calidad rota
       no puede impedir que se trabaje.
   ========================================================================= */

let ejecutar;
try {
  ({ ejecutar } = require('./guard'));
} catch (e) {
  console.error(`(guard-hook: no se pudo cargar el motor de reglas: ${e.message})`);
  process.exit(0);
}

let resultados;
try {
  resultados = ejecutar({ rapido: true });
} catch (e) {
  console.error(`(guard-hook: el motor de reglas falló: ${e.message})`);
  process.exit(0);
}

const errores = resultados.filter(r => r.gravedad === 'error' && r.hallazgos.length);
const avisos = resultados.filter(r => r.gravedad === 'aviso' && r.hallazgos.length);

if (!errores.length) {
  for (const a of avisos) {
    for (const h of a.hallazgos) console.error(`⚠️  ${h.archivo}${h.linea ? ':' + h.linea : ''} — ${h.mensaje}`);
  }
  process.exit(0);
}

const partes = ['⛔ Restricciones del proyecto violadas (ver AGENTS.md):', ''];
for (const r of errores) {
  partes.push(`• ${r.id}`);
  partes.push(`  ${r.porque}`);
  for (const h of r.hallazgos.slice(0, 8)) {
    partes.push(`  → ${h.archivo}${h.linea ? ':' + h.linea : ''}  ${h.mensaje}`);
  }
  if (r.hallazgos.length > 8) partes.push(`  → …y ${r.hallazgos.length - 8} más`);
  partes.push('');
}
partes.push('Arregla el código. Borrar la regla no es una opción: cada una documenta un daño real que ya ocurrió.');

console.error(partes.join('\n'));
process.exit(2); // 2 = bloquea y devuelve stderr al asistente
