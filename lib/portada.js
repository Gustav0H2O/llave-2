'use strict';
/* ============================================================================
   lib/portada.js — la portada «/» escrita sin JavaScript.

   El panel de inicio lo pinta React. Para quien lo ejecuta eso está bien; para
   el rastreador que NO lo ejecuta, «/» eran CUATRO palabras: sin <h1>, sin
   titulares, sin párrafos y con un único enlace interno, el «saltar al
   contenido». Auditoría Seobility del 26-08-2026: contenido 4 palabras,
   estructura de página sin encabezados, estructura de enlaces 0 %.

   Este módulo devuelve esa misma portada en HTML plano: el mismo <h1> que
   enseña el panel, los mismos titulares, prosa real y los enlaces internos del
   sitio. Se sirve DEBAJO del esqueleto de carga y React la borra al montar,
   igual que borra el esqueleto — la persona no la ve porque queda fuera del
   pliegue y dura lo que tarda el arranque. No es contenido distinto del que ve
   el usuario: es el mismo panel de inicio, sin JavaScript.

   Vive en lib/ por las dos razones de lib/ruta.js: es una función pura de
   (datos) → HTML, así que se prueba sin levantar servidor (test/unit/
   portada.test.js), y server-pg.js no tiene líneas que gastar en un
   renderizador de páginas.

   Sin cifras de presión a propósito: las reglas del taller viven SOLO en
   lib/domain.js (AGENTS.md §2) y hay una regla del guard que lo vigila. Esta
   prosa nombra los sistemas de inyección, nunca sus números.
   ========================================================================= */

const { esc, vehicleSlug } = require('./pure');

const enlace = (href, texto) => `<a href="${href}" style="color:var(--accent)">${texto}</a>`;
const lista = (items) => `<ul style="margin:10px 0 0 18px;line-height:2">${items.join('')}</ul>`;
const h2 = (t) => `<h2 style="font-size:20px;margin:30px 0 8px">${t}</h2>`;
const h3 = (t) => `<h3 style="font-size:15px;margin:16px 0 4px">${t}</h3>`;

/* @param vehiculos  muestra de filas {id, brand, model, year_from, year_to}.
   @param guias      las guías de la ruta {slug, label}.
   @param lockup     el logotipo ya renderizado (lo arma server-pg.js).

   Sin conteos. La prosa decía "N vehículos de M marcas" y "las N guías": salían
   de la base, así que nunca mintieron, pero comprometen a la portada con una
   cifra que sube y baja cada vez que el dueño da de alta un vehículo. Se
   describe lo que hay, no cuánto hay. (`totalVeh` y `totalMar` se siguen
   aceptando y se ignoran: quitarlos del sitio de llamada es otra edición.) */
function paginaPortada({ vehiculos = [], guias = [], lockup = '' } = {}) {
  const itemsGuias = guias.map(g => `<li>${enlace('/guia/' + esc(g.slug), esc(g.label))}</li>`);
  const itemsVeh = vehiculos.map(v =>
    `<li>${enlace('/vehiculo/' + vehicleSlug(v), `${esc(v.brand)} ${esc(v.model)} ${v.year_from}-${v.year_to}`)}</li>`);

  return `<main style="max-width:820px;margin:0 auto;padding:40px 22px 0;color:var(--text);font-family:Montserrat,system-ui,sans-serif;line-height:1.7">
      ${lockup}
      <h1 style="font-size:28px;margin:10px 0 14px">Presión de riel, módulos y pilas de gasolina al instante</h1>
      <p>llave es la consulta técnica que un mecánico abre en el celular, con el
         carro en la rampa, para decidir si una pila (bomba) de gasolina sirve o se devuelve.
         Reúne los vehículos que circulan en Latinoamérica con su presión de
         riel en PSI y bar, la ubicación del módulo, si hay que bajar el tanque y qué pilas
         OEM y alternativas le entran.</p>

      ${h2('¿Qué es llave?')}
      <p>Una plataforma web para mecánicos, refaccionarias y talleres. Empezó por un dato
         concreto —la presión de riel de un vehículo latinoamericano, que suele estar
         enterrada en un foro o en un PDF suelto— y hoy cubre también el diagnóstico y la
         gestión del negocio. Abre en el navegador del celular o de la computadora del
         taller, se instala como aplicación si quieres, y lo esencial no pide cuenta ni
         cobra nada.</p>
      <p>Lo que <strong>no</strong> es: no reemplaza al manual de servicio ni al escáner. Es
         la referencia rápida que evita adivinar mientras el carro está en la rampa, y todo
         dato sin confirmar sale marcado como estimado dentro de la ficha.</p>

      ${h2('Cómo funciona')}
      ${h3('1. Identifica el vehículo')}
      <p>Marca, modelo, año y motor — o pega el VIN y deja que el decodificador saque el año
         y el fabricante.</p>
      ${h3('2. Consulta la especificación')}
      <p>Presión de riel en PSI y bar, dónde está el módulo, si hay que bajar el tanque y qué
         pilas OEM y alternativas son compatibles.</p>
      ${h3('3. Compara y decide')}
      <p>Metes tu medición de la flauta y recibes un veredicto BIEN/MAL con las causas
         probables y las pruebas que siguen.</p>

      ${h2('Sistemas de inyección que cubre')}
      <p>TBI, inyección multipunto (MFI), Vortec/CSFI e inyección directa (GDI). Cada sistema
         tiene su propia especificación y su propio catálogo de pilas: una pila de alta en un
         TBI satura el regulador y ahoga el motor, y un Vortec por debajo de su presión no
         abre los poppets y el motor no enciende. La ficha de cada vehículo trae el valor que
         le corresponde, y la prueba de banco —la pila sola, sin regulador— se distingue
         siempre de la medición en el riel con el vehículo armado.</p>

      ${h2('Ruta de diagnóstico')}
      <p>Guías en orden, del síntoma a la pila puesta. Cada una termina donde
         empieza la siguiente y todas acaban en el mismo sitio: una medición contra la
         especificación de tu vehículo. Sin cuenta y sin costo.</p>
      ${lista(itemsGuias)}
      <p style="margin-top:10px">${enlace('/guias', 'Ver la ruta de diagnóstico completa →')}</p>

      ${h2('Catálogo de presión por vehículo')}
      <p>Cada vehículo tiene su propia página con la presión de riel, la ubicación del módulo
         y las pilas compatibles. Una muestra del catálogo:</p>
      ${lista(itemsVeh)}
      <p style="margin-top:10px">${enlace('/vehiculos', 'Ver el catálogo completo de vehículos →')}</p>

      ${h2('¿Para quién es?')}
      <p>Mecánicos que consultan especificaciones al instante y gestionan su taller;
         refaccionarias que buscan compatibilidades de pilas y módulos; conductores que
         quieren entender qué le pasa a su auto; y aprendices que estudian las guías, el
         glosario del taller y las marcas de sincronización a su ritmo.</p>
    </main>`;
}

module.exports = { paginaPortada };
