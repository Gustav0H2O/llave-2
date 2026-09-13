'use strict';
/* ============================================================================
   lib/portada.js — la portada «/» escrita sin JavaScript.

   El panel de inicio lo pinta React. Para quien lo ejecuta eso está bien; para
   el rastreador que NO lo ejecuta, «/» eran CUATRO palabras: sin <h1>, sin
   titulares, sin párrafos y con un único enlace interno, el «saltar al
   contenido». Auditoría Seobility del 26-08-2026: contenido 4 palabras,
   estructura de página sin encabezados, estructura de enlaces 0 %.

   Este módulo devuelve esa misma portada en HTML plano: el mismo <h1> que
   enseña el panel —«Todo lo que necesitas, en una sola llave.»—, los mismos
   titulares, prosa real y los enlaces internos del sitio. Se sirve DEBAJO del
   esqueleto de carga y React la borra al montar, igual que borra el esqueleto —
   la persona no la ve porque queda fuera del pliegue y dura lo que tarda el
   arranque. No es contenido distinto del que ve el usuario: es el mismo panel de
   inicio, sin JavaScript.

   La portada es la de la PLATAFORMA, no la del catálogo de combustible: el
   catálogo es una de sus herramientas. Antes el <h1> hablaba solo de presión de
   riel, y la página de entrada parecía la ficha de un producto en vez del menú
   de todo el taller.

   Vive en lib/ por las dos razones de lib/ruta.js: es una función pura de
   (datos) → HTML, así que se prueba sin levantar servidor (test/unit/portada.test.js),
   y server-pg.js no tiene líneas que gastar en un renderizador de páginas.

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
   2.38: la tipografía es `Inter`, la misma que carga public/index.html. Antes
   esta plantilla pedía la fuente anterior, que ya no está en el sitio: el SSR
   y la aplicación se pintaban con dos familias distintas. */
function paginaPortada({ vehiculos = [], guias = [], lockup = '' } = {}) {
  const itemsGuias = guias.map(g => `<li>${enlace('/guia/' + esc(g.slug), esc(g.label))}</li>`);
  const itemsVeh = vehiculos.map(v =>
    `<li>${enlace('/vehiculo/' + vehicleSlug(v), `${esc(v.brand)} ${esc(v.model)} ${v.year_from}-${v.year_to}`)}</li>`);

  return `<main style="max-width:820px;margin:0 auto;padding:40px 22px 0;color:var(--text);font-family:Inter,system-ui,sans-serif;line-height:1.7">
      ${lockup}
      <h1 style="font-size:30px;margin:10px 0 14px">Todo lo que necesitas, en una sola llave.</h1>
      <p>La plataforma integral con herramientas, repuestos y conocimiento para el taller moderno y sus
         clientes. Abre en el navegador del celular, con el carro en la rampa: consulta la especificación de un
         vehículo, mide, diagnostica y deja el trabajo documentado, todo en el mismo sitio y sin instalar nada.</p>

      ${h2('¿Qué es llave?')}
      <p>Una plataforma web y aplicación progresiva (PWA) para mecánicos, refaccionarias y talleres. Empezó por un
         dato concreto —la presión de riel de un vehículo latinoamericano, enterrada en foros técnicos o en manuales
         difíciles de conseguir— y hoy cubre también el diagnóstico electrónico, las tablas de apriete, la compresión
         de cilindros, la equivalencia de repuestos y la administración del negocio.</p>
      <p>Lo que <strong>no</strong> es: no reemplaza al manual de servicio ni al escáner. Es la referencia rápida
         y precisa que evita adivinar mientras el auto está en servicio, respaldada por especificaciones técnicas
         contrastadas y guías de procedimiento paso a paso.</p>

      ${h2('Consulta rápida, sin cuenta')}
      <p>El catálogo de combustible reúne los vehículos que circulan en Latinoamérica con su presión de riel en PSI
         y bar, la ubicación del módulo, si hay que bajar el tanque y qué pilas OEM y alternativas le entran.
         Alrededor viven las demás consultas del día: códigos de falla OBD-II, torques de apriete, calibración de
         bujías, cross-reference de pilas, conversor de unidades, decodificador de VIN, fusibles y relés, medidas de
         llanta y plan de mantenimiento.</p>
      <p>Todo eso se abre sin registrarse, pesa poco y está pensado para leerse de un vistazo a 390 píxeles de ancho,
         que es la pantalla que hay sobre el guardabarros.</p>

      ${h2('Diagnóstico guiado')}
      <p>Del síntoma al veredicto: el árbol de «mi carro no enciende», la prueba de batería y sistema de carga, el
         diagnóstico rápido de presión comparando tu medición contra la especificación, el árbol por síntomas, la
         prueba del regulador, los ajustes de combustible STFT/LTFT, la prueba de compresión por cilindro y los
         pinouts para saber dónde clavar la punta del multímetro.</p>
      <p>Para las fallas que no se dejan leer, hay calculadoras técnicas (caudal, presión, eléctrico), un identificador
         de piezas con IA y un registro de presión con historial por vehículo en tu cuenta.</p>

      ${h2('Gestión del taller')}
      <p>Lo que sostiene el negocio: inventario con alertas de mínimo, órdenes de trabajo con evidencia, cartera de
         clientes, notas de entrega y presupuestos listos para imprimir o mandar por WhatsApp, notas del mecánico y
         cierre de caja. Vive en la nube —cifrado y con respaldo exportable— y por eso pide cuenta; lo que es del
         momento (inspección de recepción, cotizador, agenda y mantenimiento) funciona sin ella.</p>

      ${h2('Comunidad y aprendizaje')}
      <p>Un foro técnico para las dudas que ningún manual contesta, un directorio que conecta clientes con mecánicos
         de su zona y un mercado de autos. Y la parte que hace crecer el oficio: la ruta de diagnóstico en nueve
         guías ordenadas, el glosario del taller y las marcas de sincronización por motor.</p>

      ${h2('Cómo funciona')}
      ${h3('1. Identifica el vehículo')}
      <p>Selecciona marca, modelo, año y motor — o pega el código VIN para obtener el fabricante y la especificación
         exacta.</p>
      ${h3('2. Consulta la especificación')}
      <p>Presión de riel en PSI y bar, dónde está el módulo de combustible, si requiere bajar el tanque y qué pilas
         OEM y alternativas son intercambiables.</p>
      ${h3('3. Mide y decide')}
      <p>Ingresas la lectura del manómetro conectado a la flauta o riel y recibes un veredicto técnico con causas
         probables y pruebas eléctricas o de vacío sugeridas, más el equivalente de repuesto y la mano de obra
         estimada para cotizarlo.</p>

      ${h2('Sistemas de inyección que cubre')}
      <p>Inyección monopunto (TBI), inyección multipunto secuencial (MFI / MPFI), sistemas Vortec / CSFI con inyectores
         poppet e inyección directa de alta presión (GDI / FSI). Cada sistema demanda un comportamiento de combustible
         particular: una pila de alta presión en un sistema TBI sobrecarga el regulador, mientras que un sistema Vortec
         con baja entrega no logra accionar los inyectores y provoca fallo de arranque. La plataforma diferencia la
         prueba de bomba en banco (caudal libre sin restricción) de la medición en riel con carga real.</p>

      ${h2('Ruta de diagnóstico del sistema de combustible')}
      <p>Guías técnicas ordenadas paso a paso, desde los primeros síntomas en carretera hasta el montaje final de la
         pila. Cada artículo técnico se enlaza con el siguiente para guiar al mecánico en el descarte de fallas:</p>
      ${lista(itemsGuias)}
      <p style="margin-top:10px">${enlace('/guias', 'Ver la ruta de diagnóstico completa →')}</p>

      ${h2('Marcas y vehículos cubiertos')}
      <p>Catálogo exhaustivo de autos, camionetas y utilitarios presentes en el parque automotor latinoamericano:
         modelos populares de Chevrolet (Aveo, Optra, Corsa, Spark, Cruze, Silverado, Astra), Ford (Fiesta, Focus, Ka,
         Ranger, Explorer, EcoSport), Toyota (Corolla, Yaris, Hilux, Fortuner, 4Runner), Nissan (Sentra, Tiida, Versa,
         Frontier, X-Trail), Hyundai (Accent, Elantra, Tucson, Getz), Kia (Rio, Picanto, Sportage), Volkswagen (Gol,
         Polo, Fox, Jetta), Renault (Clio, Logan, Sandero, Duster, Megane), Fiat, Chery, Jeep, Dodge y Mitsubishi.</p>
      <p>Una muestra de las fichas disponibles en el catálogo técnico:</p>
      ${lista(itemsVeh)}
      <p style="margin-top:10px">${enlace('/vehiculos', 'Ver el catálogo completo de vehículos →')}</p>

      ${h2('Para talleres mecánicos, refaccionarias y clientes')}
      <p>Diseñado para los distintos protagonistas del ecosistema automotriz:</p>
      <p><strong>Mecánicos y técnicos automotrices:</strong> diagnóstico rápido a pie de rampa, tablas de referencia
         inmediatas y gestión ordenada de órdenes de servicio y clientes.</p>
      <p><strong>Refaccionarias y tiendas de repuestos:</strong> comprobación cruzada de códigos de piezas, alternativas
         de bombas de gasolina universales vs específicas y especificaciones de flujo y amperaje para no errar la venta.</p>
      <p><strong>Directorio de talleres públicos:</strong> conexión entre clientes que necesitan servicio automotriz y
         talleres verificados con especialidades en inyección, frenos, motor y electricidad en Venezuela, Colombia,
         México y toda la región.</p>
    </main>`;
}

module.exports = { paginaPortada };
