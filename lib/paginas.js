'use strict';
/* ============================================================================
   lib/paginas.js — las CUATRO páginas institucionales y legales.

   AdSense exige que privacidad, contacto, términos y "acerca de" estén a un
   clic desde cualquier pantalla; su contenido es prosa estable que no depende
   del taller ni de la base. Vivía dentro de server-pg.js y ahí gastaba líneas
   que hacen falta para el enrutado, así que se movió aquí.

   Por qué una FÁBRICA y no un array exportado: el texto interpola el dueño del
   sitio, el correo de contacto, la fecha legal y la URL base, y esos valores
   salen de las variables de entorno — algo que lib/ NO puede leer (regla de
   pureza de scripts/guard.js). Se los inyecta server-pg.js al llamar a
   paginasDe().

   `esc` también entra por parámetro para que la propia prueba compruebe que
   cada dato interpolado pasa por el escape: si algún día alguien borra una
   llamada a esc(), test/unit/paginas.test.js lo ve. Por defecto usa el esc()
   único de lib/pure.js, para no tener dos escapes que se separen.

   El HTML se movió VERBATIM: mismo orden, mismos textos y la misma indentación
   de los literales, para que las páginas servidas y sus hashes no cambien.
   Forma de cada página: { slug, label, title, description, h1, html }.
   ========================================================================= */

const { esc: escPorDefecto } = require('./pure');

const h2 = (t) => `<h2 style="font-size:17px;color:var(--accent);margin-top:26px;margin-bottom:8px">${t}</h2>`;
const p = (t) => `<p style="color:var(--text-alt);margin-bottom:10px">${t}</p>`;
const ul = (items) => `<ul style="color:var(--text-alt);padding-left:20px;margin-bottom:10px;line-height:1.7">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;

/* @param esc          escape de HTML (el de lib/pure.js por defecto).
   @param siteOwner    dueño del sitio, SITE_OWNER en server-pg.js.
   @param contactEmail correo de contacto público.
   @param legalUpdated fecha de "última actualización" de los textos legales.
   @param baseUrl      URL base del sitio, sin barra final. */
function paginasDe({ esc = escPorDefecto, siteOwner, contactEmail, legalUpdated, baseUrl } = {}) {
  return [
    {
      slug: 'acerca-de',
      label: 'Acerca de',
      title: 'Quiénes somos y cómo verificamos los datos | llave',
      description: 'Quién está detrás de llave, por qué existe este catálogo técnico de presión de combustible y cómo se obtienen y verifican los datos publicados.',
      h1: 'Acerca de llave',
      html: `${p('llave es un catálogo técnico independiente de consulta gratuita, enfocado en el sistema de combustible de vehículos que circulan en Latinoamérica: presión de riel (PSI/Bar), ubicación y especificación de módulos de gasolina, y equivalencias de pilas (bombas) OEM y alternativas.')}
        ${h2('Por qué existe')}
        ${p('En el taller, encontrar la presión de riel correcta de un modelo concreto suele significar buscar entre manuales de servicio dispersos, foros y catálogos de refaccionaria que no siempre coinciden. Este proyecto reúne esa información en fichas consultables desde el celular, junto al valor de referencia y los números de parte compatibles, para que el diagnóstico parta de un dato y no de una suposición.')}
        ${h2('Quién lo publica')}
        ${p(`El sitio es desarrollado y mantenido de forma independiente por ${esc(siteOwner)}. No pertenece a ningún fabricante de vehículos ni de autopartes, y no está afiliado, patrocinado ni respaldado por las marcas mencionadas: sus nombres y números de parte se citan únicamente con fines de identificación e intercambiabilidad técnica.`)}
        ${h2('De dónde salen los datos')}
        ${ul([
          'Manuales de servicio y boletines técnicos del fabricante.',
          'Catálogos y fichas de especificación de fabricantes de bombas y módulos de combustible.',
          'Mediciones y correcciones aportadas por mecánicos que usan la plataforma, revisadas antes de publicarse.'
        ])}
        ${p('Cada ficha indica el rango de presión esperado, no un valor absoluto: la lectura real varía con el estado del vehículo, la altitud y las condiciones de la prueba. Las fichas se revisan y corrigen de forma continua; si detectas un dato equivocado, <a href="/contacto" style="color:var(--accent)">escríbenos</a> y lo verificamos.')}
        ${h2('Cómo se sostiene el sitio')}
        ${p('La consulta es gratuita. El sitio se financia con publicidad de terceros, que se muestra claramente separada del contenido técnico. Los anuncios no influyen en los datos publicados ni en las recomendaciones de diagnóstico. Puedes ver el detalle del tratamiento de datos en la <a href="/privacidad" style="color:var(--accent)">política de privacidad</a>.')}`
    },
    {
      slug: 'contacto',
      label: 'Contacto',
      title: 'Contacto | llave',
      description: 'Escríbenos para reportar un dato incorrecto, solicitar que agreguemos un vehículo al catálogo, consultas de publicidad o ejercer tus derechos de privacidad.',
      h1: 'Contacto',
      html: `${p('Este es un proyecto atendido por una persona, no por un equipo de soporte: respondemos en cuanto podemos, normalmente dentro de unos días hábiles.')}
        ${h2('Correo electrónico')}
        ${p(`<a href="mailto:${esc(contactEmail)}" style="color:var(--accent);font-weight:700;font-size:16px">${esc(contactEmail)}</a>`)}
        ${h2('Escríbenos si quieres')}
        ${ul([
          '<strong>Reportar un dato incorrecto.</strong> Indica marca, modelo, año y motor, y el valor que mediste. Es la forma más útil de ayudar al resto de mecánicos.',
          '<strong>Pedir que agreguemos un vehículo.</strong> Si buscaste un modelo y no estaba, dinos cuál.',
          '<strong>Consultas de publicidad</strong> o colaboración.',
          '<strong>Privacidad.</strong> Solicitudes de acceso, corrección o eliminación de datos, según la <a href="/privacidad" style="color:var(--accent)">política de privacidad</a>.',
          '<strong>Contenido de terceros.</strong> Reclamos sobre comentarios publicados por usuarios o sobre derechos de autor.'
        ])}
        ${h2('Antes de escribir')}
        ${p('Si tu duda es de diagnóstico, revisa primero las <a href="/guia/como-medir-la-presion-de-combustible" style="color:var(--accent)">guías técnicas</a>: cubren cómo medir la presión, qué significa una lectura baja y cómo distinguir una bomba muerta de un problema eléctrico. No realizamos diagnósticos a distancia de vehículos concretos.')}`
    },
    {
      slug: 'privacidad',
      label: 'Privacidad',
      title: 'Política de privacidad y cookies | llave',
      description: 'Qué datos recopila llave, qué cookies usamos, cómo trabajan los anuncios de Google y terceros, y cómo puedes controlar o eliminar tu información.',
      h1: 'Política de privacidad y cookies',
      html: `${p(`<em style="color:var(--muted)">Última actualización: ${legalUpdated}</em>`)}
        ${p(`Esta política explica qué datos trata llave (“el sitio”), operado por ${esc(siteOwner)}, cuando visitas ${esc(baseUrl)}. Para cualquier consulta sobre este documento, escribe a <a href="mailto:${esc(contactEmail)}" style="color:var(--accent)">${esc(contactEmail)}</a>.`)}

        ${h2('1. Qué datos recopilamos')}
        ${ul([
          '<strong>Datos de uso anónimos.</strong> Para contar visitantes únicos por día generamos un identificador irreversible a partir de tu dirección IP combinada con un valor secreto que rota. No almacenamos tu dirección IP ni podemos reconstruirla a partir de ese identificador. Respetamos la señal Do-Not-Track de tu navegador: si está activada, no registramos la visita.',
          '<strong>Búsquedas sin resultado.</strong> Si buscas un vehículo que no está en el catálogo, guardamos el texto de la búsqueda (sin asociarlo a ti) para saber qué modelos agregar.',
          '<strong>Preguntas al asistente de IA.</strong> El texto que escribes en el chat se envía a la API de Google (Gemini) para generar la respuesta. No lo vinculamos a tu identidad. No escribas datos personales, placas, números de cliente ni información confidencial en el chat.',
          '<strong>Comentarios.</strong> Si publicas un comentario en una ficha, se almacena junto con el nombre que elijas mostrar. Es contenido público: no incluyas datos personales.',
          '<strong>Preferencias locales.</strong> Tu “garage” de vehículos guardados y la aceptación de este aviso se guardan en el almacenamiento local de tu navegador, en tu dispositivo. No viajan a nuestros servidores y puedes borrarlos limpiando los datos del sitio.'
        ])}
        ${p('No solicitamos ni almacenamos nombre, dirección, teléfono ni datos de pago. El sitio no requiere registro de usuario.')}

        ${h2('2. Cookies y tecnologías similares')}
        ${p('Usamos cookies y almacenamiento local propios para el funcionamiento del sitio y para recordar tus preferencias. Además, terceros pueden colocar cookies en tu navegador, como se detalla a continuación.')}
        ${ul([
          '<strong>Cookies necesarias.</strong> Mantienen el funcionamiento básico y recuerdan que aceptaste este aviso.',
          '<strong>Cookies analíticas.</strong> Usamos Google Analytics 4 para entender de forma agregada qué páginas se consultan más. La información se procesa de forma anónima.',
          '<strong>Cookies publicitarias.</strong> Usadas por Google y sus socios para mostrar y medir anuncios, según se explica en la sección 3.'
        ])}
        ${p('Puedes bloquear o eliminar cookies desde la configuración de tu navegador. Si las bloqueas, el sitio seguirá funcionando, aunque algunas preferencias no se recordarán.')}

        ${h2('3. Publicidad de terceros (Google AdSense)')}
        ${ul([
          'Proveedores externos, incluido Google, utilizan cookies para publicar anuncios basados en visitas anteriores del usuario a este u otros sitios web.',
          'El uso por parte de Google de cookies publicitarias le permite a él y a sus socios publicar anuncios basados en tus visitas a este y otros sitios.',
          `Puedes inhabilitar la publicidad personalizada en la <a href="https://www.google.com/settings/ads" rel="noopener nofollow" target="_blank" style="color:var(--accent)">Configuración de anuncios de Google</a>. También puedes desactivar el uso de cookies de otros proveedores en <a href="https://www.aboutads.info/choices/" rel="noopener nofollow" target="_blank" style="color:var(--accent)">aboutads.info</a> o <a href="https://www.youronlinechoices.com/" rel="noopener nofollow" target="_blank" style="color:var(--accent)">youronlinechoices.com</a>.`,
          'Los terceros que muestran anuncios en este sitio pueden recopilar tu dirección IP, identificadores de dispositivo y datos de navegación conforme a sus propias políticas. Consulta cómo <a href="https://policies.google.com/technologies/partner-sites" rel="noopener nofollow" target="_blank" style="color:var(--accent)">Google utiliza la información de los sitios que usan sus servicios</a>.'
        ])}
        ${p('Si te encuentras en el Espacio Económico Europeo, Reino Unido o Suiza, los anuncios personalizados y las cookies no esenciales solo se activan si das tu consentimiento mediante el aviso que aparece al entrar, y puedes retirarlo en cualquier momento borrando los datos del sitio en tu navegador.')}

        ${h2('4. Con quién compartimos datos')}
        ${p('No vendemos ni cedemos tus datos. Los proveedores que procesan información por cuenta nuestra son: Google (Analytics, AdSense y la API de Gemini para el chat) y nuestro proveedor de alojamiento, que registra peticiones para seguridad y operación del servicio. Podemos divulgar información si la ley lo exige.')}

        ${h2('5. Cuánto tiempo conservamos los datos')}
        ${p('Los conteos de visita agregados y las búsquedas sin resultado se conservan mientras sean útiles para mejorar el catálogo. Los comentarios permanecen publicados hasta que se solicite su eliminación o los retiremos por incumplir las normas de uso.')}

        ${h2('6. Tus derechos')}
        ${p(`Puedes solicitar acceso, corrección o eliminación de la información que te concierna, así como la retirada de un comentario, escribiendo a <a href="mailto:${esc(contactEmail)}" style="color:var(--accent)">${esc(contactEmail)}</a>. Ten en cuenta que gran parte de los datos que tratamos son anónimos y puede que no seamos capaces de vincularlos a ti.`)}

        ${h2('7. Menores de edad')}
        ${p('El sitio está dirigido a profesionales y aficionados a la mecánica automotriz. No está dirigido a menores de 13 años y no recopilamos conscientemente información de ellos.')}

        ${h2('8. Cambios en esta política')}
        ${p('Si modificamos esta política, actualizaremos la fecha del encabezado. Los cambios sustanciales se anunciarán en el propio sitio.')}`
    },
    {
      slug: 'terminos',
      label: 'Términos y aviso técnico',
      title: 'Términos de uso y aviso técnico | llave',
      description: 'Condiciones de uso de llave, límites de responsabilidad sobre los datos técnicos publicados, normas para comentarios y propiedad intelectual.',
      h1: 'Términos de uso y aviso técnico',
      html: `${p(`<em style="color:var(--muted)">Última actualización: ${legalUpdated}</em>`)}
        ${p('Al usar llave aceptas estas condiciones. Si no estás de acuerdo con ellas, no utilices el sitio.')}

        ${h2('1. Aviso técnico importante')}
        ${p('La información publicada —presión de riel, flujos, amperajes, ubicaciones y números de parte— es de carácter <strong>orientativo y de referencia</strong>. No sustituye al manual de servicio del fabricante, a las especificaciones del proveedor de la refacción ni al criterio de un técnico calificado.')}
        ${ul([
          'Verifica siempre los valores contra el manual de servicio del vehículo antes de intervenir o reemplazar componentes.',
          'Trabajar con el sistema de combustible implica riesgo de incendio y lesiones: alivia la presión, desconecta la batería y trabaja en área ventilada.',
          'Las equivalencias de refacciones son sugerencias de compatibilidad; confirma la aplicación con el catálogo del fabricante antes de comprar o instalar.'
        ])}
        ${p('No asumimos responsabilidad por daños a vehículos, pérdidas económicas o lesiones derivadas del uso de esta información. La usas bajo tu propio criterio y responsabilidad.')}

        ${h2('2. Servicio “tal cual”')}
        ${p('El sitio se ofrece sin garantías de exactitud, disponibilidad o continuidad. Nos esforzamos por mantener los datos correctos y actualizados, pero pueden contener errores u omisiones. Podemos modificar, suspender o retirar cualquier parte del servicio en cualquier momento.')}

        ${h2('3. Asistente de inteligencia artificial')}
        ${p('El chat genera respuestas de forma automática y puede equivocarse o producir información incompleta. Trátalo como una ayuda de orientación, nunca como un dictamen técnico. Verifica siempre sus respuestas contra la ficha del vehículo y el manual de servicio.')}

        ${h2('4. Comentarios de usuarios')}
        ${p('Los comentarios reflejan la opinión de quien los publica, no la nuestra. Al publicar, garantizas que el contenido es tuyo y nos concedes permiso para mostrarlo en el sitio. Está prohibido publicar:')}
        ${ul([
          'Datos personales propios o de terceros.',
          'Spam, publicidad no solicitada o enlaces de afiliación.',
          'Contenido ofensivo, ilegal, o que infrinja derechos de terceros.'
        ])}
        ${p(`Moderamos y podemos eliminar cualquier comentario sin previo aviso. Para reportar uno, escribe a <a href="mailto:${esc(contactEmail)}" style="color:var(--accent)">${esc(contactEmail)}</a>.`)}

        ${h2('5. Propiedad intelectual y marcas')}
        ${p('El diseño, los textos y la organización del catálogo son propiedad de sus autores. Puedes consultar y compartir enlaces libremente; no está permitida la reproducción masiva ni el raspado automatizado del contenido. Las marcas de vehículos y de autopartes citadas pertenecen a sus respectivos titulares y se mencionan solo con fines de identificación técnica; el sitio no está afiliado a ellas.')}

        ${h2('6. Publicidad')}
        ${p('El sitio muestra anuncios de terceros para sostener su operación. No controlamos el contenido de esos anuncios ni respaldamos los productos anunciados, y no somos responsables de las transacciones que realices con los anunciantes. El tratamiento de datos publicitarios se describe en la <a href="/privacidad" style="color:var(--accent)">política de privacidad</a>.')}

        ${h2('7. Enlaces externos')}
        ${p('Podemos enlazar a sitios de terceros por conveniencia. No controlamos su contenido ni sus prácticas de privacidad.')}`
    }
  ];
}

module.exports = { paginasDe, h2, p, ul };
