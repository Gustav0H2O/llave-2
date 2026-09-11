'use strict';
/* ============================================================================
   lib/guias.js — las NUEVE guías técnicas del sistema de combustible.

   Es data editorial 100 % pura: el temario que va del síntoma a la pila puesta
   (qué buscar, cómo medirlo y qué descartar antes de bajar el tanque). No tiene
   lógica, no toca express, la base ni el entorno; por eso vive en lib/ y se
   prueba sola en test/unit/guias.test.js.

   Salieron de server-pg.js para que ese archivo no gastara su margen de líneas
   en contenido: allí queda el enrutado y aquí el texto, que es lo que más crece
   con el tiempo. Lo consumen lib/ruta.js (paginaRuta, paginaGuia, jsonLdRuta),
   lib/portada.js y el sitemap.xml.

   Forma de cada guía: { slug, label, title, description, h1, html, faq }.
   El `html` es de autor y se sirve SIN escapar; los campos slug, label, title,
   description, h1 y faq sí se escapan al montar la página. `faq` es una lista de
   { q, a }: alimenta la FAQPage del JSON-LD y la sección de la propia guía.

   El bloque se movió VERBATIM desde server-pg.js —mismo orden, mismos textos y
   la misma indentación de los literales— para que el HTML servido y sus hashes
   no cambien. Por eso la indentación interna conserva la del archivo original.
   ========================================================================= */

const GUIDES = [
    {
      slug: 'sintomas-bomba-de-gasolina-fallando',
      label: 'Síntomas de bomba fallando',
      title: 'Síntomas de una bomba de gasolina fallando | llave',
      description: 'Aprende a reconocer una bomba (pila) de gasolina que se está muriendo: arranque difícil en caliente, jaloneo, pérdida de potencia, zumbido del tanque y más. Guía para mecánicos.',
      h1: '7 síntomas de una bomba de gasolina fallando',
      html: `<p style="color:var(--text-alt)">Una bomba (pila) de gasolina desgastada rara vez muere de golpe: primero da avisos. Reconocerlos a tiempo evita dejar tirado al cliente y apunta el diagnóstico hacia la presión de combustible.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Los 7 síntomas más comunes</h2>
        <ol style="padding-left:20px">
          <li><strong>Arranque difícil en caliente.</strong> Con el motor caliente tarda en encender: la bomba ya no sostiene presión residual.</li>
          <li><strong>Jaloneo y pérdida de potencia en subidas o al acelerar a fondo.</strong> El motor pide más flujo del que la bomba puede dar.</li>
          <li><strong>Tirones a velocidad de crucero constante.</strong> La presión cae de forma intermitente.</li>
          <li><strong>Zumbido o ruido agudo desde el tanque.</strong> Una bomba forzada (o con cedazo tapado) trabaja más ruidosa.</li>
          <li><strong>El motor no arranca.</strong> Sin presión de combustible no hay pulverización en los inyectores.</li>
          <li><strong>Apagones intermitentes</strong> en ralentí o en marcha, con reencendido posterior.</li>
          <li><strong>Mayor consumo o marcha irregular</strong> por presión fuera de especificación.</li>
        </ol>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Cómo confirmarlo (no adivines)</h2>
        <p style="color:var(--text-alt)">Todos estos síntomas también los provoca un filtro tapado, un regulador defectuoso o una caída de voltaje en el circuito. La única forma de confirmar es <a href="/guia/como-medir-la-presion-de-combustible" style="color:var(--accent)">medir la presión de combustible</a> y compararla con la <a href="/vehiculos" style="color:var(--accent)">especificación de tu vehículo</a>. Consulta siempre el manual de servicio antes de reemplazar.</p>`,
      faq: [
        { q: '¿Cuáles son los síntomas de una bomba de gasolina fallando?', a: 'Arranque difícil en caliente, jaloneo y pérdida de potencia al acelerar, tirones a velocidad constante, zumbido desde el tanque, apagones intermitentes y, en el peor caso, que el motor no arranque.' },
        { q: '¿Cómo sé si es la bomba o el filtro?', a: 'Los síntomas son iguales; hay que medir la presión de combustible con manómetro y compararla contra la especificación del vehículo. Un filtro/cedazo tapado también baja la presión.' }
      ]
    },
    {
      slug: 'como-medir-la-presion-de-combustible',
      label: 'Cómo medir la presión',
      title: 'Cómo medir la presión de combustible paso a paso | llave',
      description: 'Guía práctica para medir la presión de riel/combustible con manómetro: alivio de presión, conexión, lectura con llave ON, en ralentí y prueba de retención. Valores esperados por vehículo.',
      h1: 'Cómo medir la presión de combustible (paso a paso)',
      html: `<p style="color:var(--text-alt)">Medir la presión es lo que separa el diagnóstico de la adivinanza. Necesitas un <strong>manómetro de combustible</strong> con los adaptadores adecuados y tomar precauciones: la gasolina está a presión.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Paso a paso</h2>
        <ol style="padding-left:20px">
          <li><strong>Alivia la presión</strong> del sistema antes de abrir nada (fusible de la bomba y arrancar hasta que se apague, o válvula Schrader si existe).</li>
          <li><strong>Conecta el manómetro</strong> en el puerto de prueba (Schrader) del riel, o en línea con adaptador en T si no hay puerto.</li>
          <li><strong>Llave en ON (sin arrancar):</strong> la bomba presuriza 2–3 segundos. Anota la lectura pico.</li>
          <li><strong>Arranca y lee en ralentí:</strong> compara con la especificación. En sistemas con retorno, al desconectar el vacío del regulador la presión debe subir.</li>
          <li><strong>Prueba de retención:</strong> apaga y observa cuánto tarda en caer. Una caída rápida indica bomba, check, regulador o inyector con fuga.</li>
        </ol>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">¿Qué presión debe tener?</h2>
        <p style="color:var(--text-alt)">Depende del vehículo y del tipo de inyección (TBI, MFI, Vortec, GDI). Busca el valor exacto de tu auto en el <a href="/vehiculos" style="color:var(--accent)">catálogo</a>. Si estás por debajo del rango, revisa <a href="/guia/presion-de-combustible-baja" style="color:var(--accent)">las causas de presión baja</a>.</p>`,
      faq: [
        { q: '¿Dónde se conecta el manómetro de presión de combustible?', a: 'En el puerto de prueba (válvula Schrader) del riel de inyectores si existe, o en línea con un adaptador en T. Antes hay que aliviar la presión del sistema.' },
        { q: '¿Qué presión de combustible es normal?', a: 'Varía por vehículo y tipo de inyección. Consulta el valor exacto de tu modelo en el catálogo de llave y compáralo con tu lectura.' }
      ]
    },
    {
      slug: 'presion-de-combustible-baja',
      label: 'Presión baja: causas',
      title: 'Presión de combustible baja: causas y diagnóstico | llave',
      description: 'Presión de riel por debajo de especificación: bomba desgastada, cedazo/filtro tapado, regulador, caída de voltaje en el circuito, líneas obstruidas o fugas. Cómo diagnosticar cada causa.',
      h1: 'Presión de combustible baja: causas y diagnóstico',
      html: `<p style="color:var(--text-alt)">Mediste y estás por debajo del rango. Antes de condenar la bomba, descarta en orden estas causas — varias son más baratas y comunes.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Causas más frecuentes</h2>
        <ul style="padding-left:20px">
          <li><strong>Cedazo o filtro de combustible tapado.</strong> Restringe el flujo; es lo primero y más barato a revisar.</li>
          <li><strong>Bomba (pila) desgastada.</strong> Ya no alcanza la presión ni el flujo; se confirma con prueba de flujo y presión muerta (deadhead).</li>
          <li><strong>Regulador de presión defectuoso.</strong> Fuga o no mantiene el valor; en sistemas con retorno se prueba con el vacío.</li>
          <li><strong>Caída de voltaje en el circuito de la bomba.</strong> Un cable/relé/conector con resistencia hace que la bomba gire lento y dé menos presión. Mide voltaje en el conector con la bomba trabajando.</li>
          <li><strong>Líneas obstruidas o aplastadas / fuga.</strong> Restricción o pérdida en el camino al riel.</li>
        </ul>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">El orden correcto</h2>
        <p style="color:var(--text-alt)">Mide voltaje en la bomba antes de cambiarla: muchas bombas "malas" en realidad reciben voltaje bajo. Luego descarta cedazo/filtro y regulador. Compara siempre contra la <a href="/vehiculos" style="color:var(--accent)">especificación de tu vehículo</a> y consulta el manual de servicio.</p>`,
      faq: [
        { q: '¿Por qué la presión de combustible está baja?', a: 'Las causas más comunes son: cedazo/filtro tapado, bomba desgastada, regulador defectuoso, caída de voltaje en el circuito de la bomba, y líneas obstruidas o con fuga.' },
        { q: '¿Cómo saber si es la bomba o un problema eléctrico?', a: 'Mide el voltaje en el conector de la bomba mientras trabaja. Si el voltaje es bajo, el problema es del circuito (cable, relé, conector), no de la bomba.' }
      ]
    },
    {
      slug: 'presion-de-combustible-alta',
      label: 'Presión alta: causas',
      title: 'Presión de combustible alta: causas y diagnóstico | llave',
      description: 'Presión de riel por encima de especificación: retorno obstruido, regulador trabado, vacío desconectado o bomba sin control. Síntomas de mezcla rica y cómo diagnosticar cada causa.',
      h1: 'Presión de combustible alta: causas y diagnóstico',
      html: `<p style="color:var(--text-alt)">Se habla mucho de presión baja y casi nada de presión alta, pero es igual de dañina: con exceso de presión los inyectores entregan más combustible del que la computadora calcula, y el motor trabaja rico sin que aparezca una falla evidente al principio.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Cómo se manifiesta</h2>
        <ul style="padding-left:20px">
          <li><strong>Consumo elevado</strong> sin causa aparente y olor a gasolina en el escape.</li>
          <li><strong>Humo negro</strong> y códigos de mezcla rica (P0172 / P0175) o de banda de combustible negativa.</li>
          <li><strong>Marcha irregular en frío</strong>, tirones y, con el tiempo, bujías carbonizadas y catalizador dañado.</li>
          <li><strong>Arranque difícil en caliente</strong> por exceso de combustible en el múltiple.</li>
        </ul>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Causas más frecuentes</h2>
        <ul style="padding-left:20px">
          <li><strong>Línea de retorno obstruida o aplastada.</strong> En sistemas con retorno, si el combustible no puede volver al tanque la presión sube. Es la causa número uno.</li>
          <li><strong>Regulador de presión trabado en cerrado.</strong> No permite el desahogo; se confirma comparando la lectura con y sin vacío.</li>
          <li><strong>Manguera de vacío del regulador desconectada, rota o tapada.</strong> Sin la señal de vacío el regulador mantiene la presión más alta de lo debido en ralentí. Es una revisión de treinta segundos y se pasa por alto constantemente.</li>
          <li><strong>Filtro instalado al revés</strong> o de aplicación incorrecta, restringiendo el retorno.</li>
          <li><strong>Módulo o bomba de repuesto con regulación distinta a la original.</strong> Muy común al montar una pila genérica: entrega más presión de la que el sistema espera.</li>
        </ul>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">El orden de diagnóstico</h2>
        <p style="color:var(--text-alt)">Con el manómetro conectado y el motor en ralentí, desconecta la manguera de vacío del regulador: la presión debe subir unos 5–10 PSI. Si no cambia nada, el regulador o su señal de vacío están en falla. Después pincha o desconecta con cuidado la línea de retorno para ver si la presión reacciona; si no baja, la restricción está en el retorno. Contrasta siempre la lectura con el <a href="/vehiculos" style="color:var(--accent)">valor de tu vehículo</a>: “alta” significa por encima del rango de ese modelo, no de un número general.</p>
        <p style="color:var(--text-alt)">En motores de <a href="/guia/inyeccion-gdi-vs-mfi-presion" style="color:var(--accent)">inyección directa (GDI)</a> el diagnóstico es distinto: la presión la controla la ECU y una lectura alta suele ser un problema de sensor o de mando, no mecánico.</p>`,
      faq: [
        { q: '¿Qué pasa si la presión de combustible es muy alta?', a: 'Los inyectores entregan más combustible del calculado y el motor trabaja rico: aumenta el consumo, aparece humo negro, códigos P0172/P0175, bujías carbonizadas y a la larga se daña el catalizador.' },
        { q: '¿Por qué sube la presión de combustible?', a: 'Las causas más comunes son línea de retorno obstruida, regulador de presión trabado en cerrado, manguera de vacío del regulador desconectada o rota, filtro mal instalado y bombas o módulos de repuesto con regulación distinta a la original.' }
      ]
    },
    {
      slug: 'regulador-de-presion-de-combustible',
      label: 'Regulador: cómo probarlo',
      title: 'Regulador de presión: cómo funciona y probarlo | llave',
      description: 'Qué hace el regulador de presión, diferencias entre sistemas con y sin retorno, y tres pruebas para saber si está fallando antes de cambiarlo.',
      h1: 'Regulador de presión de combustible: cómo probarlo',
      html: `<p style="color:var(--text-alt)">El regulador es el componente que decide a qué presión llega el combustible a los inyectores. La bomba siempre empuja de más; el regulador desahoga el sobrante para mantener el valor correcto. Cuando falla, la presión se va por arriba o por abajo y el diagnóstico se confunde fácilmente con una bomba muerta.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Con retorno y sin retorno</h2>
        <ul style="padding-left:20px">
          <li><strong>Con retorno (sistemas más antiguos).</strong> El regulador va en el riel y devuelve el sobrante al tanque por una segunda línea. Suele tener una manguera de vacío del múltiple: al acelerar cae el vacío y la presión sube, compensando la carga del motor.</li>
          <li><strong>Sin retorno (returnless, la mayoría de los modernos).</strong> El regulador está dentro del módulo, en el tanque. No hay línea de retorno ni manguera de vacío, y la presión se mantiene constante. Aquí el regulador casi nunca se vende suelto: viene integrado en el módulo.</li>
        </ul>
        <p style="color:var(--text-alt)">Saber cuál tiene el vehículo cambia por completo la prueba. Consulta la ficha de tu modelo en el <a href="/vehiculos" style="color:var(--accent)">catálogo</a> antes de buscar un regulador que quizá no exista por separado.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Tres pruebas concretas</h2>
        <ol style="padding-left:20px">
          <li><strong>Prueba de vacío (solo con retorno).</strong> Con el motor en ralentí y el manómetro conectado, desconecta la manguera de vacío del regulador. La presión debe subir de inmediato unos 5–10 PSI. Si no se mueve, el regulador está trabado o el diafragma está roto.</li>
          <li><strong>Prueba de gasolina en la manguera de vacío.</strong> Quita la manguera y mírala por dentro. Si tiene combustible o huele a gasolina, el diafragma del regulador está perforado y está mandando combustible al múltiple: cámbialo.</li>
          <li><strong>Prueba de retención.</strong> Apaga el motor y observa el manómetro. Una caída rápida indica fuga por el regulador, por la válvula check de la bomba o por un inyector. Pinza la línea de retorno: si la presión ahora se sostiene, el que fuga es el regulador.</li>
        </ol>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Antes de cambiarlo</h2>
        <p style="color:var(--text-alt)">Un regulador defectuoso y un <a href="/guia/presion-de-combustible-baja" style="color:var(--accent)">cedazo tapado</a> dan lecturas parecidas. Descarta primero filtro y <a href="/guia/voltaje-circuito-bomba-de-gasolina" style="color:var(--accent)">voltaje en el circuito de la bomba</a>, que son más baratos de revisar, y compara siempre contra la especificación del fabricante.</p>`,
      faq: [
        { q: '¿Cómo saber si el regulador de presión de combustible está malo?', a: 'Desconecta su manguera de vacío con el motor en ralentí: la presión debe subir 5–10 PSI. Si no cambia, o si encuentras gasolina dentro de la manguera de vacío, el regulador está fallando.' },
        { q: '¿Dónde está el regulador de presión de combustible?', a: 'En sistemas con retorno va en el riel de inyectores, con una manguera de vacío conectada. En sistemas sin retorno está integrado dentro del módulo, en el tanque, y normalmente se reemplaza junto con el módulo completo.' }
      ]
    },
    {
      slug: 'voltaje-circuito-bomba-de-gasolina',
      label: 'Voltaje de la bomba',
      title: 'Voltaje bajo en el circuito de la bomba | llave',
      description: 'Cómo medir voltaje y caída de tensión en el circuito de la bomba de combustible, por qué una bomba buena entrega poca presión y cómo revisar relé, tierra y conectores.',
      h1: 'Voltaje en el circuito de la bomba: la prueba que evita cambios innecesarios',
      html: `<p style="color:var(--text-alt)">Muchas bombas devueltas como “defectuosas” estaban perfectamente bien: recibían 9 voltios en lugar de 12. Una bomba alimentada con voltaje bajo gira lento, entrega menos presión y menos flujo, y da exactamente los mismos síntomas que una bomba desgastada. Esta prueba toma cinco minutos y evita tirar el dinero.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Medir voltaje en el conector</h2>
        <p style="color:var(--text-alt)">Con el multímetro en voltaje DC, mide entre el positivo y la tierra del conector de la bomba <strong>mientras la bomba está trabajando</strong> (llave en ON los primeros segundos, o con el motor encendido). Una medición con la bomba apagada no sirve de nada: el problema aparece solo bajo carga.</p>
        <ul style="padding-left:20px">
          <li><strong>Menos de 0.5 V de diferencia</strong> respecto al voltaje de batería: circuito sano.</li>
          <li><strong>Entre 0.5 y 1 V de diferencia:</strong> hay resistencia, conviene revisar conectores y tierra.</li>
          <li><strong>Más de 1 V de diferencia:</strong> falla clara en el circuito. No cambies la bomba todavía.</li>
        </ul>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Prueba de caída de tensión</h2>
        <p style="color:var(--text-alt)">Es la forma correcta de localizar dónde se pierde el voltaje. Con el circuito energizado y la bomba trabajando, pon las puntas del multímetro en los dos extremos del tramo que sospechas (por ejemplo, positivo de batería y positivo del conector de la bomba). Lo que marque el multímetro es lo que ese tramo se está “comiendo”. Repite del lado de tierra: entre el negativo de batería y el pin de tierra de la bomba no deberías tener más de 0.2 V.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Dónde suele estar la falla</h2>
        <ul style="padding-left:20px">
          <li><strong>Conector de la bomba quemado o con los pines flojos.</strong> Es el sospechoso más común, sobre todo si el vehículo ya tuvo un cambio de bomba antes.</li>
          <li><strong>Relé de la bomba con contactos picados.</strong> Prueba puenteando o sustituyendo por un relé idéntico del mismo vehículo.</li>
          <li><strong>Tierra oxidada o mal apretada</strong> en el chasis o en el propio módulo.</li>
          <li><strong>Empalmes anteriores mal hechos</strong>, cinta en lugar de soldadura, o cable de calibre menor al original.</li>
          <li><strong>Fusible con corrosión</strong> en el portafusible, que mide continuidad pero cae bajo carga.</li>
        </ul>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">La secuencia que funciona</h2>
        <p style="color:var(--text-alt)">Mide <a href="/guia/como-medir-la-presion-de-combustible" style="color:var(--accent)">presión de combustible</a> primero. Si está baja, mide voltaje en la bomba antes de desarmar el tanque. Si el voltaje es correcto y la presión sigue baja, entonces sí revisa <a href="/guia/presion-de-combustible-baja" style="color:var(--accent)">cedazo, filtro y regulador</a>, y por último la bomba. Cambiar una bomba en un circuito con caída de tensión solo repite la falla: la bomba nueva también trabajará forzada y durará menos.</p>`,
      faq: [
        { q: '¿Cuánto voltaje debe llegar a la bomba de gasolina?', a: 'Prácticamente el mismo que el de la batería. Con la bomba trabajando, la diferencia entre el voltaje de batería y el que llega al conector no debe superar 0.5 V; más de 1 V indica una falla en el circuito.' },
        { q: '¿Por qué una bomba nueva sigue dando presión baja?', a: 'Casi siempre por caída de tensión en el circuito: conector quemado, relé con contactos picados, tierra oxidada o un empalme mal hecho. La bomba gira lento y entrega menos presión aunque esté nueva.' }
      ]
    },
    {
      slug: 'inyeccion-gdi-vs-mfi-presion',
      label: 'GDI vs MFI',
      title: 'GDI vs MFI: la presión no se mide igual | llave',
      description: 'Diferencias entre inyección directa (GDI) e inyección a puerto (MFI/TBI): presiones de trabajo, bomba de baja y de alta, y qué precauciones tomar al diagnosticar cada sistema.',
      h1: 'GDI vs MFI: por qué la presión no se mide igual',
      html: `<p style="color:var(--text-alt)">Conectar un manómetro convencional a un motor de inyección directa es un error que se paga caro. Los sistemas GDI trabajan con presiones cientos de veces mayores y con un circuito completamente distinto. Antes de tocar nada, hay que saber qué sistema tienes enfrente.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Inyección a puerto: TBI y MFI</h2>
        <p style="color:var(--text-alt)">El inyector rocía en el múltiple de admisión, antes de la válvula. Una sola bomba eléctrica en el tanque genera toda la presión del sistema, que se mantiene en un rango bajo y constante: por lo general entre 30 y 60 PSI según el modelo, y menos aún en los TBI antiguos. Es el sistema para el que sirve el manómetro clásico con adaptadores, y el que cubren la mayoría de las fichas del catálogo.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Inyección directa: GDI</h2>
        <p style="color:var(--text-alt)">El inyector rocía dentro de la cámara de combustión, contra la presión de compresión, así que necesita muchísima más fuerza. El circuito tiene <strong>dos etapas</strong>:</p>
        <ul style="padding-left:20px">
          <li><strong>Baja presión.</strong> La bomba eléctrica del tanque —la pila que sí puedes reemplazar— alimenta a la bomba de alta con un valor moderado, típicamente entre 50 y 90 PSI.</li>
          <li><strong>Alta presión.</strong> Una bomba mecánica accionada por el árbol de levas eleva la presión a valores que van de 500 a más de 2 500 PSI, controlados electrónicamente por la ECU según la carga.</li>
        </ul>
        <p style="color:var(--text-alt)">La etapa de alta <strong>no se mide con manómetro convencional</strong>: se lee con escáner, en el PID de presión de riel, comparando el valor deseado contra el valor real. Abrir esa parte del circuito con el motor caliente es peligroso.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Qué significa esto al diagnosticar</h2>
        <ul style="padding-left:20px">
          <li>En GDI, un arranque difícil o una pérdida de potencia puede venir de la bomba del tanque (baja) o de la bomba de alta. Empieza midiendo la baja, que es accesible y barata.</li>
          <li>Si la baja está en especificación y el escáner muestra que la presión real no alcanza la deseada, el problema está en la bomba de alta, su válvula de control o el lóbulo del árbol de levas que la acciona.</li>
          <li>Las pilas de repuesto para GDI deben cumplir el valor de baja presión exacto: una pila genérica de menor entrega deja sin alimentación a la bomba de alta y provoca fallas intermitentes difíciles de rastrear.</li>
          <li>Nunca uses el rango de un motor MFI como referencia para uno GDI, ni al revés. En el <a href="/vehiculos" style="color:var(--accent)">catálogo</a> cada ficha indica el tipo de inyección junto al valor de presión, precisamente por esto.</li>
        </ul>`,
      faq: [
        { q: '¿Cuál es la diferencia entre GDI y MFI?', a: 'En MFI el inyector rocía en el múltiple de admisión y una sola bomba del tanque genera toda la presión (30–60 PSI típicos). En GDI el inyector rocía dentro de la cámara y hay dos etapas: una bomba eléctrica de baja en el tanque y una bomba mecánica de alta accionada por el árbol de levas que llega a cientos o miles de PSI.' },
        { q: '¿Se puede medir la presión de un motor GDI con manómetro?', a: 'Solo la etapa de baja presión. La etapa de alta se lee con escáner en el PID de presión de riel, comparando el valor deseado contra el real; abrirla con manómetro convencional es peligroso.' }
      ]
    },
    {
      slug: 'como-cambiar-la-pila-de-gasolina',
      label: 'Cambiar la pila paso a paso',
      title: 'Cómo cambiar la pila (bomba) de gasolina | llave',
      description: 'Procedimiento seguro para reemplazar una pila o módulo de gasolina: alivio de presión, acceso al tanque, cambio del cedazo, precauciones eléctricas y verificación final.',
      h1: 'Cómo cambiar la pila de gasolina paso a paso',
      html: `<p style="color:var(--text-alt)">Antes de empezar: confirma con el manómetro que la bomba es realmente la culpable. Una <a href="/guia/presion-de-combustible-baja" style="color:var(--accent)">presión baja</a> también la provoca un cedazo tapado, un regulador en falla o una <a href="/guia/voltaje-circuito-bomba-de-gasolina" style="color:var(--accent)">caída de voltaje</a>, y todas son más baratas de resolver.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Seguridad primero</h2>
        <ul style="padding-left:20px">
          <li>Trabaja en área ventilada, sin llamas, chispas ni herramientas eléctricas cerca del tanque abierto.</li>
          <li>Ten un extintor a la mano. No es una formalidad.</li>
          <li>Alivia la presión del sistema antes de desconectar cualquier línea: quita el fusible o el relé de la bomba y deja que el motor se apague solo.</li>
          <li>Desconecta el negativo de la batería antes de manipular el conector del módulo.</li>
          <li>Trabaja con el tanque lo más vacío posible: pesa menos y hay menos vapor.</li>
        </ul>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">El procedimiento</h2>
        <ol style="padding-left:20px">
          <li><strong>Localiza el acceso.</strong> Muchos vehículos tienen una tapa de registro bajo el asiento trasero o en el piso de la cajuela; otros obligan a bajar el tanque. La ficha de tu modelo en el <a href="/vehiculos" style="color:var(--accent)">catálogo</a> indica la ubicación del módulo.</li>
          <li><strong>Limpia alrededor de la tapa</strong> antes de abrirla. La tierra que cae dentro del tanque termina en el cedazo nuevo.</li>
          <li><strong>Desconecta el conector eléctrico y las líneas</strong> de alimentación y retorno. Marca cuál es cuál si no están codificadas.</li>
          <li><strong>Retira el anillo de seguridad</strong> con la herramienta adecuada o golpes suaves y controlados. Saca el módulo con cuidado: el brazo del flotador se dobla con nada.</li>
          <li><strong>Compara la pieza nueva contra la vieja</strong> antes de instalar: altura del módulo, posición de las salidas, tipo de conector y polaridad. Una pila correcta en especificación pero con conector distinto no sirve.</li>
          <li><strong>Cambia el cedazo (filtro previo) siempre.</strong> Es barato y es la causa de que la bomba nueva se esfuerce y muera antes de tiempo.</li>
          <li><strong>Sustituye el empaque o junta del módulo.</strong> Reutilizar el viejo es la fuente habitual de olor a gasolina después del trabajo.</li>
          <li><strong>Monta, conecta y purga.</strong> Antes de arrancar, da varias veces llave a ON durante tres segundos para que la bomba llene el riel.</li>
        </ol>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Verificación final</h2>
        <p style="color:var(--text-alt)">Conecta el manómetro y confirma que la presión coincide con la especificación de tu vehículo, tanto con llave en ON como en ralentí. Haz una <a href="/guia/como-medir-la-presion-de-combustible" style="color:var(--accent)">prueba de retención</a> al apagar y revisa que no haya fugas en la tapa del módulo antes de devolver el vehículo. Consulta el manual de servicio del fabricante para pares de apriete y particularidades del modelo.</p>`,
      faq: [
        { q: '¿Hay que cambiar el cedazo al cambiar la bomba de gasolina?', a: 'Sí, siempre. El cedazo tapado hace que la bomba nueva trabaje forzada, entregue menos presión y dure mucho menos. Es una pieza barata y es parte del trabajo bien hecho.' },
        { q: '¿Cómo se alivia la presión antes de cambiar la bomba?', a: 'Quita el fusible o el relé de la bomba de combustible y arranca el motor hasta que se apague solo. Después desconecta el negativo de la batería antes de manipular el conector del módulo.' }
      ]
    },
    {
      slug: 'que-pila-de-gasolina-le-queda-a-mi-carro',
      label: 'Elegir la pila correcta',
      title: 'Qué pila de gasolina le queda a mi carro | llave',
      description: 'Cómo elegir una pila o bomba de gasolina compatible: presión, flujo LPH, amperaje, medidas físicas, conector y polaridad. Qué mirar antes de comprar una alternativa genérica.',
      h1: 'Qué pila de gasolina le queda a mi carro',
      html: `<p style="color:var(--text-alt)">“¿Esta le queda?” es la pregunta que más se escucha en el mostrador de una refaccionaria. La respuesta corta: no basta con que entre. Una pila compatible tiene que coincidir en cinco cosas, y si falla una sola, el trabajo se devuelve.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Los cinco criterios</h2>
        <ol style="padding-left:20px">
          <li><strong>Presión de trabajo.</strong> La pila debe sostener el rango que pide el vehículo con margen. Una bomba de 45 PSI en un sistema que exige 58 PSI da síntomas de falla desde el primer día.</li>
          <li><strong>Flujo (LPH).</strong> Litros por hora. Un motor más grande o con mayor demanda necesita más caudal aunque la presión sea la misma. Quedarse corto se nota solo bajo carga: en subida o a alta velocidad.</li>
          <li><strong>Amperaje.</strong> Una pila que consume más de lo que el circuito original fue diseñado para entregar calienta el conector y termina quemándolo. Compara el consumo contra el del original.</li>
          <li><strong>Medidas físicas y montaje.</strong> Diámetro, largo del cuerpo, posición de entrada y salida, y altura total dentro del módulo. Una pila más larga no deja cerrar la tapa; una más corta deja el pickup lejos del fondo y el motor se queda sin combustible con el tanque a un cuarto.</li>
          <li><strong>Conector y polaridad.</strong> Invertir la polaridad daña la bomba de inmediato. Si el conector no es el mismo, hay que confirmar cuál pin es positivo antes de improvisar un adaptador.</li>
        </ol>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Original, módulo completo o pila suelta</h2>
        <p style="color:var(--text-alt)">Cambiar solo la pila dentro del módulo es más barato y suele ser suficiente. Pero si el módulo tiene el regulador integrado en falla, la carcasa fisurada, el flotador dañado o el conector quemado, el módulo completo sale mejor a la larga. En sistemas <strong>sin retorno</strong>, donde el regulador vive dentro del módulo, muchas veces no hay alternativa.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Sobre las equivalencias</h2>
        <p style="color:var(--text-alt)">En la ficha de cada vehículo del <a href="/vehiculos" style="color:var(--accent)">catálogo</a> encontrarás el número de parte original y las alternativas compatibles con su presión, flujo y amperaje. Úsalas como punto de partida y confirma la aplicación con el catálogo del fabricante antes de comprar: los proveedores actualizan aplicaciones y a veces un mismo modelo cambió de bomba a mitad de año de producción.</p>
        <p style="color:var(--text-alt)">Y una advertencia práctica: “universal” no significa compatible. Una pila universal puede dar la presión correcta y aun así fallar por medidas, conector o amperaje.</p>`,
      faq: [
        { q: '¿Cómo sé qué bomba de gasolina le queda a mi carro?', a: 'Debe coincidir en presión de trabajo, flujo (LPH), amperaje, medidas físicas de montaje y conector con polaridad correcta. Que entre físicamente no significa que sea compatible.' },
        { q: '¿Es mejor cambiar solo la pila o el módulo completo?', a: 'Cambiar solo la pila es más barato y suele bastar. Conviene el módulo completo si el regulador integrado falla, la carcasa está fisurada, el flotador está dañado o el conector quemado; en sistemas sin retorno a menudo es la única opción.' }
      ]
    }
];

module.exports = { GUIDES };
