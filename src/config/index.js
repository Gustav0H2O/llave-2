'use strict';
/* ============================================================================
   src/config/index.js — 4.2: la configuración del entorno, en un solo sitio.

   POR QUÉ
   Cada `process.env.X` suelto por el servidor es una decisión que se puede
   tomar dos veces y tomarse distinto (un default aquí, otro allá). Aquí se lee,
   se normaliza y se valida UNA vez; el resto del código recibe `config` ya
   listo, y server-pg.js no vuelve a leer `process.env` para estas claves.

   POR QUÉ NO VA EN lib/
   `lib/` tiene que seguir siendo puro (AGENTS.md §3): nada de express, base de
   datos ni entorno. Leer el entorno es exactamente lo contrario de puro.

   ARRANQUE
   En producción, sin `VISIT_SALT` el proceso NO arranca (ver `validarConfig`):
   con una sal distinta en cada reinicio el mismo visitante se cuenta de nuevo,
   y el contador que el dueño mira deja de significar nada. En local y en
   pruebas se genera una al azar para no estorbar a nadie.
   ========================================================================= */
const crypto = require('crypto');

/* 2.35: el dominio público por defecto es el del sitio real. Un default que
   apunte a un host que ya no existe manda al vacío los enlaces de confirmación
   de correo, el sitemap y las canónicas. */
const BASE_URL_POR_DEFECTO = 'https://fueltech-master.onrender.com';

const texto = (valor, porDefecto = '') => String(valor ?? porDefecto).trim();

/* Cadena separada por comas: sin espacios de sobra ni entradas vacías, que es
   como llegan los `*_MODELS` desde el panel del host. */
const lista = (valor, porDefecto) => texto(valor, porDefecto).split(',').map(s => s.trim()).filter(Boolean);

/* Tope con rango mínimo y máximo. Un valor absurdo (0, negativo, 10^9) no puede
   desactivar el límite ni abrir la puerta a quemar la cuota gratuita del
   proveedor. La expresión es la misma que ya usaba el código: con basura o cero
   se cae al valor por defecto. */
const acotado = (valor, porDefecto, min, max) => Math.min(max, Math.max(min, parseInt(valor, 10) || porDefecto));

/* Construye el objeto de configuración a partir de un entorno. Es una función
   —y no un bloque suelto— para poder probar cada caso (producción sin sal,
   BASE_URL por defecto…) sin tocar el entorno real del proceso. */
function construirConfig(entorno = process.env) {
  const env = entorno || {};
  const saltFija = texto(env.VISIT_SALT);
  return Object.freeze({
    PROD: env.NODE_ENV === 'production',
    BASE_URL: (texto(env.BASE_URL) || BASE_URL_POR_DEFECTO).replace(/\/+$/, ''),
    /* VISIT_SALT: obligatoria en producción (la exige validarConfig). Si no
       viene, se genera una al azar aquí mismo: así una prueba o un arranque
       local no se caen por una variable que solo importa en el despliegue. */
    VISIT_SALT: saltFija || crypto.randomBytes(32).toString('hex'),
    VISIT_SALT_FIJA: !!saltFija,
    SITE_OWNER: texto(env.SITE_OWNER, 'llave'),
    CONTACT_EMAIL: texto(env.CONTACT_EMAIL, 'newpersonal98@gmail.com'),
    LEGAL_UPDATED: '2 de agosto de 2026',
    /* 4.2 — Sesión del taller: 30 días. */
    SESSION_TTL_MS: 30 * 24 * 3600e3,

    /* --- Proveedores del chat (4.4). Prioridad: Groq > NVIDIA > OpenRouter.
       Gemini va aparte, como último recurso. --- */
    GEMINI_API_KEY: texto(env.GEMINI_API_KEY),
    /* AGENTS.md §4.10: el id tiene que existir. `gemini-3.5-flash` no existe y
       hacía que el chat respondiera 502. */
    GEMINI_MODEL: texto(env.GEMINI_MODEL) || 'gemini-1.5-flash',
    GROQ_API_KEY: texto(env.GROQ_API_KEY),
    GROQ_MODELS: lista(env.GROQ_MODELS, 'llama-3.3-70b-versatile,llama-3.1-8b-instant,gemma2-9b-it'),
    GROQ_BASE: 'https://api.groq.com/openai/v1',
    NVIDIA_API_KEY: texto(env.NVIDIA_API_KEY),
    NVIDIA_MODELS: lista(env.NVIDIA_MODELS, 'google/gemma-4-31b-it,mistralai/mistral-large-2-instruct,google/gemma-3-12b-it'),
    NVIDIA_BASE: 'https://integrate.api.nvidia.com/v1',
    OPENROUTER_API_KEY: texto(env.OPENROUTER_API_KEY),
    OPENROUTER_MODELS: lista(env.OPENROUTER_MODELS, 'google/gemma-4-26b-a4b-it:free,google/gemma-4-31b-it:free'),
    OPENROUTER_BASE: 'https://openrouter.ai/api/v1',

    /* --- Límites del chat: protegen la cuota gratuita del proveedor. --- */
    CHAT_DAILY_LIMIT: acotado(env.CHAT_DAILY_LIMIT, 3, 1, 20),
    CHAT_IP_CEILING: acotado(env.CHAT_IP_CEILING, 30, 5, 200),
    CHAT_GLOBAL_CEILING: acotado(env.CHAT_GLOBAL_CEILING, 150, 20, 5000),
    /* 2.41: ningún proveedor puede dejar colgada la petición del mecánico. */
    CHAT_TIMEOUT_MS: acotado(env.CHAT_TIMEOUT_MS, 30000, 1000, 120000),
  });
}

/* Validación de arranque. Lanza (y por tanto tumba el arranque) cuando la
   configuración no se sostiene en el entorno en el que va a correr.
   La llama server-pg.js al arrancar de verdad (`require.main === module`), no
   al importar el módulo: así una prueba o una herramienta que solo lee la
   configuración no se cae por una variable que solo importa en el despliegue,
   y el error sale por el mismo camino que cualquier otro fallo de arranque
   ("❌ Error fatal al arrancar el servidor"), que es donde el operador lo busca. */
function validarConfig(cfg) {
  if (cfg.PROD && !cfg.VISIT_SALT_FIJA) {
    throw new Error(
      'Falta VISIT_SALT y NODE_ENV=production: en producción es OBLIGATORIA. '
      + 'Sin una sal fija, cada reinicio del proceso hashea distinto al mismo visitante '
      + 'y el contador de visitas suma de nuevo a quien ya había venido, así que el dato deja de servir. '
      + 'Genera una con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" '
      + 'y ponla como secreto del host (VISIT_SALT).');
  }
  return cfg;
}

const config = construirConfig();

module.exports = { config, construirConfig, validarConfig, BASE_URL_POR_DEFECTO };
