'use strict';
/* ============================================================================
   src/services/chat.js — 4.4: el chat de IA completo.

   Aquí vive todo lo del asistente: la configuración de proveedores
   (`proveedorChat`), el contexto que se le manda al modelo, los límites diarios
   sobre la tabla `chat_limits`, el limitador de ráfaga y la ruta
   `POST /api/chat`.

   POR QUÉ AQUÍ Y NO EN lib/
   `lib/` tiene que seguir siendo puro (nada de express, base de datos ni
   entorno: AGENTS.md §3). Esto es una ruta HTTP con consultas a la base y
   configuración del entorno, así que va en `src/`.

   CÓMO SE MONTA
   server-pg.js llama una sola vez:
     await montarChat(app, { db, statsDb, config, hashToken });
   El comportamiento es el de siempre, con dos arreglos que se explican donde
   tocan: 2.39 (el prompt ya no vuelca el catálogo entero) y 2.41 (tope de
   tiempo en las llamadas a los proveedores).
   ========================================================================= */
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { toInt, extraerToken } = require('../../lib/pure');

/* Hash del token de sesión: se inyecta desde server-pg.js para que el algoritmo
   tenga una sola definición en el servidor. El default existe para poder montar
   el chat solo, en sus pruebas. */
const hashSesionPorDefecto = (t) => crypto.createHash('sha256').update(t).digest('hex');

/* 4.4 — Prioridad de proveedores: Groq (14 400 peticiones/día gratis) →
   NVIDIA NIM → OpenRouter (modelos :free). Gemini va aparte, como último
   recurso, cuando no hay ninguna clave de los anteriores. */
function proveedorChat(config) {
  if (config.GROQ_API_KEY) return {
    nombre: 'Groq', base: config.GROQ_BASE, clave: config.GROQ_API_KEY, modelos: config.GROQ_MODELS, cabeceras: {}
  };
  if (config.NVIDIA_API_KEY) return {
    nombre: 'NVIDIA NIM', base: config.NVIDIA_BASE,
    clave: config.NVIDIA_API_KEY, modelos: config.NVIDIA_MODELS, cabeceras: {}
  };
  if (config.OPENROUTER_API_KEY) return {
    nombre: 'OpenRouter', base: config.OPENROUTER_BASE, clave: config.OPENROUTER_API_KEY,
    modelos: config.OPENROUTER_MODELS, cabeceras: { 'HTTP-Referer': config.BASE_URL, 'X-Title': 'llave' }
  };
  return null;
}

/* 2.41 — Ninguna llamada a un proveedor de IA puede dejar la petición colgada.
   `fetch` no tiene tope por sí solo: si el proveedor acepta la conexión y nunca
   contesta, el mecánico se queda mirando el chat (y la plaza de rate limit,
   ocupada). Se corta con AbortController y el corte se traduce a un error
   accionable, no a un "algo falló". */
const enSegundos = (ms) => (ms % 1000 === 0 ? String(ms / 1000) : (ms / 1000).toFixed(1));
const errorDeEspera = (ms) => Object.assign(
  new Error(`la IA no respondió en ${enSegundos(ms)} s`), { timeout: true });

async function fetchConTope(url, opciones, ms) {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), ms);
  try {
    return await fetch(url, { ...opciones, signal: control.signal });
  } catch (e) {
    if (e?.name === 'AbortError' || control.signal.aborted) throw errorDeEspera(ms);
    throw e; // error de red: lo trata el catch de la ruta (502)
  } finally {
    clearTimeout(temporizador);
  }
}

/* El SDK de Gemini no acepta AbortSignal en esta versión, así que el mismo tope
   se aplica con una carrera contra un temporizador. */
function conTope(promesa, ms) {
  promesa.catch(() => {}); // el perdedor de la carrera no puede quedar sin dueño
  let temporizador;
  const tope = new Promise((_, rechazar) => { temporizador = setTimeout(() => rechazar(errorDeEspera(ms)), ms); });
  return Promise.race([promesa, tope]).finally(() => clearTimeout(temporizador));
}

/* ---------------------------------------------------------------------------
   2.39 — CONTEXTO BAJO DEMANDA, no el catálogo entero.

   Antes, el arranque traía TODOS los vehículos (`dbDump`) y el prompt los
   volcaba en cada consulta: con 208 vehículos son decenas de KB de texto
   enviados una y otra vez. Eso cuesta tokens en cada mensaje, quema la cuota
   gratuita del proveedor y encima distrae al modelo.

   Ahora se manda un resumen compacto (cuántos vehículos, cuántas marcas, rango
   de años, conteo por sistema y por marca) y, solo cuando el usuario nombra
   algo, las pocas filas del catálogo que coinciden con lo que preguntó. El
   vehículo que el usuario tiene abierto en la app sigue yendo completo.
   ------------------------------------------------------------------------ */

/* El catálogo cambia poco (lo toca el panel de admin): el resumen se mide una
   vez por servidor montado y se guarda en el objeto `cache` que le pasa
   montarChat. Un error de base NO se cachea, o un fallo pasajero dejaría al
   chat sin contexto hasta el siguiente reinicio. */
const PALABRAS_IGNORADAS = new Set(['para', 'como', 'cual', 'cuales', 'donde', 'cuando', 'porque',
  'sobre', 'tiene', 'tengo', 'este', 'esta', 'esto', 'esos', 'esas', 'sirve', 'puedo', 'debo',
  'hace', 'hacer', 'mucho', 'poco', 'mas', 'muy', 'www', 'http', 'https']);

/* Palabras con las que vale la pena buscar en el catálogo. */
function palabrasDeBusqueda(mensaje) {
  return [...new Set(String(mensaje || '').toLowerCase().replace(/[^a-z0-9áéíóúñü\s]/g, ' ').split(/\s+/))]
    .filter(p => p.length >= 4 && !PALABRAS_IGNORADAS.has(p))
    .slice(0, 3);
}

async function resumenCatalogo(db, cache = { valor: null }) {
  if (cache.valor !== null) return cache.valor;
  try {
    const total = await db.get('SELECT COUNT(*) AS n, MIN(year_from) AS desde, MAX(year_to) AS hasta FROM vehicles') || {};
    const marcas = await db.all(`SELECT b.name AS marca, COUNT(*) AS n FROM vehicles v
      JOIN brands b ON b.id = v.brand_id GROUP BY b.name ORDER BY n DESC, b.name`);
    const sistemas = await db.all(`SELECT it.name AS sistema, COUNT(*) AS n FROM vehicles v
      JOIN injection_types it ON it.id = v.injection_type_id GROUP BY it.name ORDER BY it.name`);
    const partes = [
      `Catálogo de FuelTech Master: ${total.n || 0} vehículos de ${marcas.length} marcas`,
      (total.desde && total.hasta) ? `años ${total.desde}-${total.hasta}` : '',
    ].filter(Boolean).join(', ');
    const porSistema = sistemas.length
      ? ' Sistemas de inyección: ' + sistemas.map(s => `${s.sistema} ${s.n}`).join(', ') + '.'
      : '';
    const porMarca = marcas.length
      ? ' Vehículos por marca: ' + marcas.map(m => `${m.marca} ${m.n}`).join(', ') + '.'
      : '';
    cache.valor = `${partes}.${porSistema}${porMarca} La lista completa de modelos no se envía:
      si el usuario pregunta por un vehículo concreto se consulta el catálogo en ese momento.`;
  } catch (e) {
    /* Igual que hacía el volcado antiguo: sin catálogo el chat sigue, pero se
       deja dicho en el log por qué el asistente responde más genericamente. */
    console.error('❌ Chat: no se pudo resumir el catálogo (¿base vacía o sin inicializar?):', e?.message || e);
    return 'El resumen del catálogo no está disponible en este arranque.';
  }
  return cache.valor;
}

/* Coincidencias puntuales: solo las filas que se parecen a lo que preguntó. */
async function contextoRelevante(db, mensaje) {
  const claves = palabrasDeBusqueda(mensaje);
  if (!claves.length) return '';
  const condiciones = claves.map(() => '(b.name LIKE ? OR v.model LIKE ?)').join(' OR ');
  const parametros = claves.flatMap(c => [`%${c}%`, `%${c}%`]);
  try {
    const filas = await db.all(`SELECT b.name AS brand, v.model, v.year_from, v.year_to, v.engine,
        v.rail_pressure_psi_min, v.rail_pressure_psi_max
      FROM vehicles v JOIN brands b ON b.id = v.brand_id
      WHERE ${condiciones} ORDER BY b.name, v.model LIMIT 6`, parametros);
    if (!filas.length) return '';
    return 'Coincidencias del catálogo para esta consulta: '
      + filas.map(r => `${r.brand} ${r.model} ${r.year_from}-${r.year_to} ${r.engine} PSI:${r.rail_pressure_psi_min}-${r.rail_pressure_psi_max}`).join('; ');
  } catch (e) {
    return ''; // sin coincidencias el chat responde igual, solo con menos detalle
  }
}

/* ---------------------------------------------------------------------------
   4.4 / 2.24 — La llamada al proveedor compatible con OpenAI, en un solo sitio.

   El chat y el identificador de piezas (`POST /api/aid/identify`, en
   src/services/identificador.js) comparten CADA decisión de esta cadena: el
   tope de tiempo (2.41), el paso al siguiente modelo cuando el primario está
   saturado (429) o ya no existe (404/410 — AGENTS.md §4.10, un id retirado
   apagaba el asistente en silencio), y el 502 cuando ninguno contesta. Dos
   copias serían dos sitios donde arreglarlo el día que un proveedor cambie.

   Devuelve `{ ok: true, texto }` o `{ ok: false, motivo }` con motivo
   'comunicacion' (el proveedor respondió con error), 'saturado' (todos los
   modelos dieron 429) o 'vacio' (contestó sin texto). El corte por tiempo NO se
   captura aquí: `errorDeEspera` sube al llamador, que responde 504.
   ------------------------------------------------------------------------ */
async function completarProveedor(proveedor, mensajes, { timeoutMs, maxTokens = 700 } = {}) {
  let saturado = false;
  for (const modelo of proveedor.modelos) {
    /* 2.41: cada intento va con AbortController y tope de tiempo. */
    const orRes = await fetchConTope(`${proveedor.base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${proveedor.clave}`,
        'Content-Type': 'application/json',
        ...proveedor.cabeceras
      },
      body: JSON.stringify({
        model: modelo, messages: mensajes,
        max_tokens: maxTokens, temperature: 0.3
      })
    }, timeoutMs);
    if (orRes.status === 429) { saturado = true; continue; }
    /* 404/410: ese modelo ya no existe (NVIDIA retira ids por "end of life" con
       preaviso, y un id mal escrito da lo mismo). Se pasa al siguiente de la
       cadena en vez de tumbar el chat: la alternativa es que el asistente muera
       en silencio el día que caduque un modelo, que es exactamente lo que avisa
       AGENTS.md §4.10. El log deja dicho cuál hay que cambiar en NVIDIA_MODELS. */
    if (orRes.status === 404 || orRes.status === 410) {
      const detalle = await orRes.text().catch(() => '');
      console.error(`${proveedor.nombre}: el modelo "${modelo}" ya no existe (${orRes.status}) — quítalo de la configuración.`, detalle.slice(0, 160));
      continue;
    }
    if (!orRes.ok) {
      const detalle = await orRes.text().catch(() => '');
      console.error(`${proveedor.nombre} error:`, orRes.status, modelo, detalle.slice(0, 200));
      return { ok: false, motivo: 'comunicacion' };
    }
    const orData = await orRes.json();
    const texto = String(orData.choices?.[0]?.message?.content || '')
      .replace(/<think>[\s\S]*?<\/think>/g, '')   // por si un modelo gratuito filtra su razonamiento
      .trim().slice(0, 3000);
    if (!texto) break;
    return { ok: true, texto };
  }
  return { ok: false, motivo: saturado ? 'saturado' : 'vacio' };
}

/* ---------------------------------------------------------------------------
   Montaje de la ruta
   ------------------------------------------------------------------------ */
async function montarChat(app, { db, statsDb, config, hashToken = hashSesionPorDefecto }) {
  const CHAT_DAILY_LIMIT = config.CHAT_DAILY_LIMIT;
  const CHAT_IP_CEILING = config.CHAT_IP_CEILING;
  const CHAT_GLOBAL_CEILING = config.CHAT_GLOBAL_CEILING;
  const CHAT_TIMEOUT_MS = config.CHAT_TIMEOUT_MS;
  /* 2.39: el resumen del catálogo se mide una vez por servidor montado. */
  const cacheCatalogo = { valor: null };

  /* El techo GLOBAL cuenta todo el sitio en la misma tabla, bajo una clave
     fija: aunque llegue tráfico anómalo, el cupo diario de la cuenta del
     proveedor no se quema en una hora. */
  await statsDb.exec(`
    CREATE TABLE IF NOT EXISTS chat_limits (
      day        TEXT NOT NULL,
      device_id  TEXT NOT NULL,
      count      INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, device_id)
    )
  `);
  const getChatCount = { get: async (day, device_id) => statsDb.get(`SELECT count FROM chat_limits WHERE day = ? AND device_id = ?`, [day, device_id]) };
  const bumpChatCount = { run: async (day, device_id) => statsDb.run(`
    INSERT INTO chat_limits (day, device_id, count) VALUES (?, ?, 1)
    ON CONFLICT(day, device_id) DO UPDATE SET count = count + 1
  `, [day, device_id]) };

  const chatLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
  const genAI = config.GEMINI_API_KEY ? new GoogleGenerativeAI(config.GEMINI_API_KEY) : null;

  app.post('/api/chat', chatLimiter, async (req, res) => {
    const proveedor = proveedorChat(config);
    if (!proveedor && !genAI) {
      return res.status(503).json({ error: 'API de IA no configurada', noKey: true });
    }

    // Validar parámetros
    const { message, history, vehicleId, deviceId } = req.body || {};

    // Validar mensaje
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Mensaje vacío' });
    }
    const cleanMsg = message.trim().slice(0, 500);
    /* 2.22 (B19/B34/V-A8): history debe ser array (un objeto/string hacía
       .slice/.map reventar en 500) y modo explícito cliente|tecnico. */
    if (history !== undefined && !Array.isArray(history)) {
      return res.status(400).json({ error: 'Historial inválido' });
    }
    const modoCrudo = req.body?.modo;
    if (modoCrudo !== undefined && modoCrudo !== 'cliente' && modoCrudo !== 'tecnico' && modoCrudo !== 'mecanico') {
      return res.status(400).json({ error: 'Modo inválido (cliente|tecnico)' });
    }
    const hist = Array.isArray(history) ? history.slice(-4).filter(m => m && typeof m.content === 'string') : [];

    try {
      const day = new Date().toISOString().slice(0, 10);

      // Detectar si hay sesión de usuario (cuenta registrada)
      let workshopId = null;
      /* 4.6: el token se extrae con el mismo helper que requireWorkshop
         (Bearer o cookie ftm_session), sin repetir el regex aquí. */
      const token = extraerToken(req, 'ftm_session');
      if (token) {
        const tokenHash = hashToken(token);
        const sess = await db.get('SELECT workshop_id FROM sessions WHERE token_hash = ? AND expires_at > ?', [tokenHash, new Date().toISOString()]);
        if (sess) workshopId = sess.workshop_id;
      }

      // Límite por IP como red de seguridad
      const ipHash = crypto.createHash('sha256').update(req.ip).digest('hex');
      const ipCapKey = `ipcap:${ipHash}`;
      if (((await getChatCount.get(day, ipCapKey))?.count || 0) >= CHAT_IP_CEILING) {
        return res.json({
          response: '', remaining: 0, limitReached: true,
          message: 'Se alcanzó el límite diario de consultas desde esta red. Vuelve mañana o explora el catálogo directamente.'
        });
      }

      // Techo GLOBAL del sitio
      if (((await getChatCount.get(day, 'global:todos'))?.count || 0) >= CHAT_GLOBAL_CEILING) {
        return res.json({
          response: '', remaining: 0, limitReached: true,
          message: 'El asistente alcanzó su cupo global del día. Vuelve mañana: el resto del sitio sigue funcionando igual.'
        });
      }

      // Determinar clave de límite: por cuenta si está logueado, por dispositivo si no
      let limitKey;
      if (workshopId) {
        limitKey = `ws:${workshopId}`;
      } else {
        const validDevice = typeof deviceId === 'string' && /^[a-f0-9]{16,64}$/.test(deviceId);
        limitKey = validDevice ? `d:${deviceId}` : `ip:${ipHash}`;
      }

      const row = await getChatCount.get(day, limitKey);
      const used = row ? row.count : 0;
      const remaining = Math.max(0, CHAT_DAILY_LIMIT - used);

      if (used >= CHAT_DAILY_LIMIT) {
        const msg = workshopId
          ? 'Tu cuenta alcanzó el límite de consultas por día. Vuelve mañana o explora el catálogo directamente.'
          : 'Has alcanzado el límite de consultas por día. Vuelve mañana o explora el catálogo directamente.';
        return res.json({ response: '', remaining: 0, limitReached: true, message: msg });
      }

      let dbContext = '';
      if (vehicleId) {
        const vId = toInt(vehicleId, 1, 1e9);
        if (vId) {
          const v = await db.get(`SELECT v.model, b.name AS brand, v.year_from, v.year_to, v.engine, it.name AS injection, v.rail_pressure_psi_min, v.rail_pressure_psi_max FROM vehicles v JOIN brands b ON b.id = v.brand_id JOIN injection_types it ON it.id = v.injection_type_id WHERE v.id = ?`, vId);
          if (v) {
            dbContext = `\nContexto actual del usuario (vehículo seleccionado en la app): ${v.brand} ${v.model} (${v.year_from}-${v.year_to}), Motor ${v.engine}, Inyección ${v.injection}. Presión de riel: ${v.rail_pressure_psi_min}-${v.rail_pressure_psi_max} PSI. Si el usuario pregunta por "este vehículo" o "este carro", se refiere a este.`;
          }
        }
      }

      /* 2.39: resumen del catálogo + coincidencias puntuales, en lugar de volcar
         todos los vehículos en el prompt de cada consulta. */
      const contextoCatalogo = [await resumenCatalogo(db, cacheCatalogo), await contextoRelevante(db, cleanMsg)]
        .filter(Boolean).join('\n');

      /* FT-0009: dos instrucciones de sistema, un mismo alcance restringido.
         'cliente' = dueño de auto sin jerga; cualquier otro valor (o ninguno)
         = el prompt técnico de siempre. */
      const esModoCliente = modoCrudo === 'cliente';

      const ALCANCE_COMUN = `SOLO respondes preguntas sobre:
- Presión de riel (PSI/Bar) de vehículos (inyección MFI, TBI, Vortec, GDI)
- Ubicación de módulos de combustible
- Tipos de bomba y módulo
- Diagnóstico básico de sistema de combustible
- Seguridad al trabajar con gasolina

NUNCA respondas temas fuera de esto.`;

      const sysPrompt = esModoCliente
        ? `Eres el asistente de llave para DUEÑOS DE VEHÍCULO, no para mecánicos.
Habla en español sencillo y cercano, sin siglas ni jerga técnica.

Estructura SIEMPRE tu respuesta en tres partes cortas:
1. Qué puede estar pasando (1-2 frases, en palabras cotidianas).
2. Qué tan urgente es: si puede seguir manejando o mejor no mover el carro.
3. Siguiente paso concreto: qué pedirle al taller, en una línea.

${ALCANCE_COMUN}
Si preguntan otra cosa, di: "Solo puedo ayudarte con problemas de combustible o de arranque."

Nunca des un diagnóstico definitivo a distancia: recomienda medir la presión en un taller de confianza y consultar el manual del fabricante. No inventes precios exactos: habla de que el costo varía por ciudad, vehículo y calidad de la refacción.
${contextoCatalogo}
${dbContext}`
        : `Eres un asistente de llave, un catálogo técnico de módulos y bombas de gasolina.
${ALCANCE_COMUN}
Si te preguntan algo no relacionado, di: "Solo puedo ayudarte con información técnica de sistemas de combustible."

Responde en español. No des consejos de reparación sin incluir "consulta el manual de servicio".

${contextoCatalogo}

${dbContext}`;

      let response;
      if (proveedor) {
        /* Camino único para las APIs compatibles con OpenAI (NVIDIA NIM y
           OpenRouter), compartido con el identificador de piezas (2.24):
           `completarProveedor` lleva el tope de tiempo, la cadena de modelos y
           el manejo de errores. Lo que cambia —URL, clave, cabeceras y cadena
           de modelos— lo trae `proveedorChat()`. */

        /* Respuesta corta y determinista para estirar la cuota gratuita, y los
           contadores solo se incrementan tras éxito. */
        const mensajes = [
          { role: 'system', content: sysPrompt },
          ...hist.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content).slice(0, 300)
          })),
          { role: 'user', content: cleanMsg }
        ];
        const r = await completarProveedor(proveedor, mensajes, { timeoutMs: CHAT_TIMEOUT_MS });
        if (!r.ok) {
          if (r.motivo === 'comunicacion') {
            return res.status(502).json({ error: 'Error al comunicar con la IA. Intenta de nuevo.' });
          }
          if (r.motivo === 'saturado') return res.json({
            response: '', remaining, limitReached: false,
            message: 'El asistente está saturado ahora mismo. Espera un momento e intenta otra vez.'
          });
          return res.status(502).json({ error: 'La IA no devolvió respuesta. Intenta de nuevo.' });
        }
        response = r.texto;
      } else {
        const model = genAI.getGenerativeModel({
          model: config.GEMINI_MODEL,
          systemInstruction: sysPrompt,
          generationConfig: { maxOutputTokens: 1000, temperature: 0.3 }
        });

        const chat = model.startChat({
          history: hist.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(m.content).slice(0, 300) }]
          }))
        });

        /* 2.41: el SDK de Gemini tampoco puede quedarse colgado sin tope. */
        const result = await conTope(chat.sendMessage(cleanMsg), CHAT_TIMEOUT_MS);
        response = result.response.text().slice(0, 3000);
      }

      await bumpChatCount.run(day, limitKey);
      await bumpChatCount.run(day, ipCapKey);
      await bumpChatCount.run(day, 'global:todos');

      /* 2.22: remaining post-consumo (después de descontar esta consulta). */
      res.json({ response, remaining: Math.max(0, remaining - 1) });
    } catch (err) {
      /* 2.41: un corte por tiempo no es "error al comunicar": decir eso empuja
         al mecánico a reintentar a ciegas. Se responde 504 y qué pasó. */
      if (err?.timeout) {
        console.error(`Chat: ${err.message} (tope ${enSegundos(CHAT_TIMEOUT_MS)} s)`);
        return res.status(504).json({ error: `La IA tardó más de ${enSegundos(CHAT_TIMEOUT_MS)} s en responder. Intenta de nuevo.` });
      }
      console.error('Gemini API error:', err.message || err);
      res.status(502).json({ error: 'Error al comunicar con la IA. Intenta de nuevo.' });
    }
  });
}

/* 2.24: además del montaje de la ruta, se exportan las piezas que el
   identificador de piezas (src/services/identificador.js) reutiliza para no
   tener una segunda copia del proveedor ni del tope de 30 s. */
module.exports = {
  montarChat, proveedorChat, resumenCatalogo, contextoRelevante,
  completarProveedor, fetchConTope, conTope, enSegundos, errorDeEspera,
};
