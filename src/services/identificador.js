'use strict';
/* ============================================================================
   src/services/identificador.js — 2.24: POST /api/aid/identify.

   QUÉ ES
   La herramienta 38 de la app (public/microapps.js, "Identificador con IA")
   manda una descripción de una pieza —forma, tamaño, dónde va montada, qué
   letras o números lleva— y recibe hasta 3 candidatos ordenados por
   probabilidad, el motivo de cada uno y la prueba que confirma cuál es. El
   contrato lo fijó el cliente y no cambia: `{ candidates: [{ nombre,
   confianza, por_que }], siguiente_prueba }`.

   POR QUÉ REUTILIZA EL CHAT (src/services/chat.js)
   El proveedor (`proveedorChat`), el tope de 30 s (`fetchConTope`/`conTope` con
   `CHAT_TIMEOUT_MS`) y la cadena de modelos con su manejo de errores
   (`completarProveedor`) son los mismos que usa el asistente. Este archivo no
   los vuelve a escribir: elegir el proveedor en dos sitios es garantizar que un
   día digan cosas distintas.

   POR QUÉ AQUÍ Y NO EN lib/
   `lib/` es puro (AGENTS.md §3). Esto lee el entorno y habla por HTTP.

   SIN CLAVE NO HAY FUNCIÓN, Y SE DICE
   Sin ninguna clave de proveedor la ruta responde 503 con un mensaje que nombra
   las variables que faltan y `noKey: true`, igual que el chat: la microapp
   enseña ese texto en pantalla en vez de quedarse "Analizando…" para siempre.
   ========================================================================= */
const rateLimit = require('express-rate-limit');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { validar } = require('../../lib/validar');
const { proveedorChat, completarProveedor, conTope, enSegundos } = require('./chat');

/* La entrada: la misma descripción que teclea el mecánico. El mínimo de 6 sale
   del propio cliente (public/microapps.js no deja enviar menos) y el tope de
   600 evita que una carga hostil meta 20 KB de texto en el prompt. */
const ESQUEMA = { description: { tipo: 'str', requerido: true, minLen: 6, max: 600 } };

const MAX_CANDIDATOS = 3;

const SISTEMA = `Eres el identificador de piezas de llave, un catálogo técnico de módulos y bombas de gasolina.
El mecánico te describe una pieza (forma, tamaño, material, dónde va montada, letras o números) y tú propones qué pieza es.

Reglas:
- Entre 1 y 3 candidatos, el más probable primero.
- "confianza" es un número entre 0 y 1. Baja si la descripción es vaga; no infles el número.
- "por_que" explica en una frase qué de la descripción apoya ese candidato.
- "siguiente_prueba" es la prueba más rápida y barata que el mecánico puede hacer para confirmarlo.
- Si la descripción no alcanza para identificar la pieza, devuelve candidatos con confianza baja y una "siguiente_prueba" que pida el dato que falta.
- No inventes números de parte que no conozcas.

Responde SOLO con este JSON, sin texto alrededor ni bloques de código:
{"candidates":[{"nombre":"...","confianza":0.0,"por_que":"..."}],"siguiente_prueba":"..."}`;

/* Lectura defensiva de la respuesta del modelo. Los modelos gratuitos envuelven
   el JSON en ``` o lo preceden de una frase: se busca el objeto y se sanea
   campo por campo. Devolver null cuando no hay nada usable es a propósito: el
   llamador responde 502 y el mecánico reintenta, en vez de ver una lista vacía
   que parece "no se me ocurre nada". */
function parsearRespuesta(texto) {
  const bruto = String(texto || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  const inicio = bruto.indexOf('{');
  const fin = bruto.lastIndexOf('}');
  if (inicio === -1 || fin <= inicio) return null;
  let dato;
  try { dato = JSON.parse(bruto.slice(inicio, fin + 1)); } catch (e) { return null; }

  const lista = Array.isArray(dato?.candidates) ? dato.candidates : [];
  const candidates = lista.slice(0, MAX_CANDIDATOS).map((c) => ({
    nombre: String(c?.nombre ?? '').trim().slice(0, 80),
    confianza: Math.max(0, Math.min(1, Number(c?.confianza) || 0)),
    por_que: String(c?.por_que ?? '').trim().slice(0, 240),
  })).filter((c) => c.nombre);

  if (!candidates.length) return null;
  return { candidates, siguiente_prueba: String(dato?.siguiente_prueba ?? '').trim().slice(0, 240) };
}

async function montarIdentificador(app, { config }) {
  const genAI = config.GEMINI_API_KEY ? new GoogleGenerativeAI(config.GEMINI_API_KEY) : null;
  /* Mismo criterio que el chat: 10 envíos por minuto y por red. La cuota
     gratuita del proveedor es compartida, así que una ráfaga aquí apaga también
     al asistente. */
  const limiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

  app.post('/api/aid/identify', limiter, async (req, res) => {
    const proveedor = proveedorChat(config);
    if (!proveedor && !genAI) {
      return res.status(503).json({
        error: 'El identificador con IA no está disponible: falta configurar una clave de IA en el servidor (GROQ_API_KEY, NVIDIA_API_KEY, OPENROUTER_API_KEY o GEMINI_API_KEY).',
        noKey: true,
      });
    }

    /* 2.13: validación declarativa (lib/validar.js), con el mismo saneo de
       siempre. Se valida ANTES de gastar una llamada al proveedor. */
    const { valores, errores } = validar(req.body, ESQUEMA);
    if (Object.keys(errores).length) {
      return res.status(400).json({
        error: 'Describe la pieza con al menos 6 caracteres: forma, tamaño, dónde va montada y qué letras o números tiene.',
      });
    }
    const descripcion = valores.description;

    try {
      let salida;
      if (proveedor) {
        const r = await completarProveedor(proveedor, [
          { role: 'system', content: SISTEMA },
          { role: 'user', content: descripcion },
        ], { timeoutMs: config.CHAT_TIMEOUT_MS, maxTokens: 900 });
        if (!r.ok) {
          if (r.motivo === 'comunicacion') {
            return res.status(502).json({ error: 'Error al comunicar con la IA. Intenta de nuevo.' });
          }
          if (r.motivo === 'saturado') {
            return res.status(503).json({ error: 'El asistente está saturado ahora mismo. Espera un momento e intenta otra vez.' });
          }
          return res.status(502).json({ error: 'La IA no devolvió respuesta. Intenta de nuevo.' });
        }
        salida = r.texto;
      } else {
        /* Gemini va aparte, como último recurso, igual que en el chat: su SDK
           no acepta AbortSignal en esta versión, así que el tope de 30 s se
           aplica con una carrera contra un temporizador (2.41). */
        const model = genAI.getGenerativeModel({
          model: config.GEMINI_MODEL,
          systemInstruction: SISTEMA,
          generationConfig: { maxOutputTokens: 900, temperature: 0.2 },
        });
        const result = await conTope(model.generateContent(descripcion), config.CHAT_TIMEOUT_MS);
        salida = result.response.text();
      }

      const datos = parsearRespuesta(salida);
      if (!datos) {
        return res.status(502).json({
          error: 'La IA no devolvió la lista de candidatos en el formato esperado. Intenta otra vez, con más detalle de la pieza.',
        });
      }
      /* La respuesta se genera para esta petición: no se guarda en ninguna caché
         intermedia (el mecánico puede describir la misma pieza dos veces y
         esperar dos lecturas distintas). */
      res.set('Cache-Control', 'no-store');
      res.json(datos);
    } catch (err) {
      /* 2.41: un corte por tiempo no es "error al comunicar": decirlo así empuja
         al mecánico a reintentar a ciegas. */
      if (err?.timeout) {
        console.error(`Identificador: ${err.message} (tope ${enSegundos(config.CHAT_TIMEOUT_MS)} s)`);
        return res.status(504).json({ error: `La IA tardó más de ${enSegundos(config.CHAT_TIMEOUT_MS)} s en responder. Intenta de nuevo.` });
      }
      console.error('Identificador de piezas: error del proveedor de IA:', err?.message || err);
      return res.status(502).json({ error: 'Error al comunicar con la IA. Intenta de nuevo.' });
    }
  });
}

module.exports = { montarIdentificador, parsearRespuesta, ESQUEMA, SISTEMA };
