'use strict';
/* ============================================================================
   lib/errores.js — las pantallas de error del sitio.

   Antes solo existía el 404 (FT-0005) y era texto sobre fondo: un titular, una
   línea y tres enlaces. El resto de códigos ni siquiera llegaban a tener
   página — un 500 salía como `{"error":"Error interno"}` en JSON crudo aunque
   quien lo hubiera pedido fuese un navegador, y 401/403/503 no existían.

   Ahora los cinco comparten una sola plantilla con la ilustración de marca que
   les corresponde, el mismo tono, la salida que tiene sentido para cada caso y
   una vía de contacto. Cada código dice DOS cosas distintas a propósito:
     · el titular, en el lenguaje del taller (es lo que se lee de un vistazo);
     · la explicación, en llano (es lo que dice qué hacer).

   Vive en lib/ por las razones de siempre: es una función pura de (datos) →
   HTML, así que se prueba sin levantar servidor (test/unit/errores.test.js), y
   server-pg.js no gasta líneas en un renderizador de páginas. Sin entorno, sin
   base de datos y sin registro por consola: la regla `pureza-de-lib` del guard
   lo vigila buscando esos nombres en el texto del archivo, así que ni siquiera
   se escriben aquí — nombrarlos en un comentario ya la hace saltar.
   ========================================================================= */

const { esc } = require('./pure');

/* El catálogo. `imagen` apunta al recorte de la lámina de marca; `alt` la
   describe para quien no la ve. Las acciones son [href, texto, principal]. */
const ERRORES = {
  401: {
    titulo: 'Acceso no autorizado',
    lema: '¡Falta de credenciales!',
    detalle: 'Esta zona es privada: hay que iniciar sesión para entrar.',
    ayuda: 'Si ya tienes cuenta y aun así llegas aquí, es que la sesión caducó. Vuelve a entrar y sigue donde estabas.',
    imagen: '/media/error-401.webp',
    alt: 'El personaje de llave, con cara seria y un escudo con cerradura, delante de una puerta cerrada con cadena.',
    acciones: [['/?app=perfil', 'Iniciar sesión', true], ['/', 'Volver al inicio', false]],
  },
  403: {
    titulo: 'Prohibido',
    lema: '¡Permiso denegado!',
    detalle: 'Tu nivel de acceso no alcanza para esta zona.',
    ayuda: 'Los datos de cada taller son privados: ni siquiera con la sesión abierta se puede entrar a los de otro. Si crees que esto es tuyo y aun así te frena, escríbenos.',
    imagen: '/media/error-403.webp',
    alt: 'El personaje de llave señalando un cartel de "No Entrada" detrás de un cordón de seguridad.',
    acciones: [['/', 'Volver al inicio', true], ['/contacto', 'Contacto', false]],
  },
  404: {
    titulo: 'Página no encontrada',
    lema: '¡Ruta equivocada!',
    detalle: 'Este repuesto no existe: la dirección se movió, se escribió mal o nunca estuvo ahí.',
    ayuda: 'Si llegaste desde un enlace nuestro que ya no funciona, avísanos y lo arreglamos.',
    imagen: '/media/error-404.webp',
    alt: 'El personaje de llave, pensativo, mirando el motor de un carro con el capó abierto.',
    acciones: [['/', 'Ir al buscador', true], ['/vehiculos', 'Catálogo de vehículos', false], ['/guias', 'Guías de diagnóstico', false]],
  },
  500: {
    titulo: 'Error interno del servidor',
    lema: '¡Falla de motor!',
    detalle: 'Estamos en una parada de pits inesperada. No es culpa tuya.',
    ayuda: 'El fallo quedó registrado de nuestro lado. Vuelve a intentarlo en un momento; si se repite, mándanos el código de abajo y lo miramos.',
    imagen: '/media/error-500.webp',
    alt: 'El personaje de llave, preocupado, junto a un motor humeante con engranajes alrededor.',
    acciones: [[':reintentar', 'Reintentar', true], ['/', 'Volver al inicio', false]],
  },
  503: {
    titulo: 'En mantenimiento',
    lema: '¡Estamos en el taller!',
    detalle: 'Servicio no disponible por un momento. Volveremos pronto.',
    ayuda: 'Estamos aplicando una actualización. No hace falta que hagas nada: en unos minutos vuelve solo.',
    imagen: '/media/error-503.webp',
    alt: 'El personaje de llave con una llave inglesa, reparando un carro bajo una lámpara junto a un cartel de "Mantenimiento".',
    acciones: [[':reintentar', 'Reintentar', true], ['/', 'Volver al inicio', false]],
  },
};

const codigosDeError = () => Object.keys(ERRORES).map(Number);

/* Código de incidencia: lo que el usuario nos dicta por teléfono y nosotros
   buscamos en el log. Corto a propósito —ocho caracteres sin vocales, para que
   no salga ninguna palabra y no se confunda al deletrear— y sin ninguna
   información dentro: es una etiqueta, no un dato. Lo genera quien llama
   (server-pg.js con crypto), aquí solo se pinta. */
function paginaError({ codigo = 404, contacto = '', incidencia = '', ruta = '', lockup = '' } = {}) {
  const e = ERRORES[codigo] || ERRORES[404];
  const num = ERRORES[codigo] ? codigo : 404;

  /* `:reintentar` no es una URL, es un marcador: se sustituye por la dirección
     que falló, así el botón la vuelve a pedir de verdad. Con `#reintentar` —lo
     primero que se escribió— el enlace no hacía NADA: saltaba a un ancla
     inexistente de la misma página. Sin ruta que reintentar (una vista previa,
     por ejemplo) el botón se cae y quedan las demás acciones; un botón que no
     hace nada es peor que no tenerlo. Y no puede ser JavaScript en línea: la
     CSP del sitio no admite manejadores inline. */
  const destino = (href) => href === ':reintentar' ? (ruta || '') : href;
  const boton = ([href, texto, principal]) => {
    const url = destino(href);
    if (!url) return '';
    return `<a href="${esc(url)}" class="err-accion${principal ? ' err-accion--principal' : ''}">${esc(texto)}</a>`;
  };

  /* La ruta que falló solo se muestra en el 404: ahí es la pista útil ("ah, me
     comí una letra"). En un 403 sería decirle a quien no debe entrar qué hay
     detrás, y en un 500 no aporta nada que el usuario pueda usar. */
  const rutaPedida = num === 404 && ruta
    ? `<p class="err-ruta">Pediste <code>${esc(ruta)}</code></p>`
    : '';

  const codigoIncidencia = incidencia
    ? `<p class="err-incidencia">Código de incidencia: <code>${esc(incidencia)}</code></p>`
    : '';

  const víaContacto = contacto
    ? `<p class="err-contacto">¿Sigue pasando? Escríbenos a
         <a href="mailto:${esc(contacto)}?subject=${encodeURIComponent(`Error ${num} en llave`)}${incidencia ? encodeURIComponent(' (' + incidencia + ')') : ''}">${esc(contacto)}</a>${incidencia ? ' con el código de arriba' : ''}.</p>`
    : '';

  return `<main class="err-pantalla">
      ${lockup ? `<div class="err-marca">${lockup}</div>` : ''}
      <div class="err-caja">
        <img class="err-ilustracion" src="${esc(e.imagen)}" alt="${esc(e.alt)}" width="760" height="553" decoding="async">
        <div class="err-texto">
          <p class="err-codigo" aria-hidden="true">${num}</p>
          <h1 class="err-titulo">${esc(e.titulo)}</h1>
          <p class="err-lema">${esc(e.lema)}</p>
          <p class="err-detalle">${esc(e.detalle)}</p>
          <p class="err-ayuda">${esc(e.ayuda)}</p>
          ${rutaPedida}
          <div class="err-acciones">${e.acciones.map(boton).join('')}</div>
          ${codigoIncidencia}
          ${víaContacto}
        </div>
      </div>
    </main>`;
}

module.exports = { paginaError, ERRORES, codigosDeError };
