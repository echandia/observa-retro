import db from './db.js';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { extname } from 'node:path';

export function getTranscriptionConfig() {
  const providerRow = db.prepare('SELECT valor FROM configuraciones WHERE clave = ?').get('transcription_provider');
  const keyRow = db.prepare('SELECT valor FROM configuraciones WHERE clave = ?').get('transcription_api_key');
  
  return {
    provider: (providerRow && providerRow.valor) || process.env.TRANSCRIPTION_PROVIDER || 'gemini',
    apiKey: (keyRow && keyRow.valor) || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || ''
  };
}

export function saveTranscriptionConfig(provider, apiKey) {
  const insert = db.prepare(`
    INSERT INTO configuraciones (clave, valor) VALUES (?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor
  `);
  if (provider) insert.run('transcription_provider', provider);
  if (apiKey !== undefined) insert.run('transcription_api_key', apiKey.trim());
}

let isTranscriptionActive = false;
let activeTranscriptionName = '';

/**
 * Transcribe un archivo de audio utilizando Gemini o Whisper
 */
export async function transcribirAudio(audioFilePath, mimeType) {
  if (isTranscriptionActive) {
    return {
      error_code: 'TRANSCRIPTION_BUSY',
      message: `Ya hay una transcripción de aula en proceso en este momento (${activeTranscriptionName || 'grabación'}). Para cuidar la cuota gratuita por minuto de Google AI Studio, espera unos instantes a que finalice antes de iniciar otra.`,
      lineas: [],
      texto: ''
    };
  }

  isTranscriptionActive = true;
  activeTranscriptionName = audioFilePath ? audioFilePath.split(/[\\/]/).pop() : 'audio';

  try {
    return await ejecutarTranscripcion(audioFilePath, mimeType);
  } finally {
    isTranscriptionActive = false;
    activeTranscriptionName = '';
  }
}

async function ejecutarTranscripcion(audioFilePath, mimeType) {
  const config = getTranscriptionConfig();

  if (config.provider === 'demo') {
    return transcribirModoDemo(audioFilePath);
  }

  if (!config.apiKey) {
    return {
      error_code: 'NO_API_KEY',
      message: 'No hay una clave API configurada para el motor de transcripción. Puedes ingresar tu clave gratuita de Google AI Studio (Gemini) o Groq/OpenAI, o activar el "Modo Demostración".',
      lineas: [],
      texto: ''
    };
  }

  if (!existsSync(audioFilePath)) {
    throw new Error('El archivo de audio no existe en el servidor');
  }

  const stat = statSync(audioFilePath);
  const sizeMB = stat.size / (1024 * 1024);

  // Proveedor: Gemini (Google AI Studio)
  if (config.provider === 'gemini') {
    return await transcribirConGemini(audioFilePath, mimeType, config.apiKey, sizeMB);
  }

  // Proveedor: Groq o OpenAI (Whisper)
  if (config.provider === 'groq' || config.provider === 'whisper_groq' || config.provider === 'openai' || config.provider === 'whisper_openai') {
    const p = config.provider.includes('groq') ? 'groq' : 'openai';
    return await transcribirConWhisper(audioFilePath, p, config.apiKey);
  }

  throw new Error(`Proveedor de transcripción no soportado: ${config.provider}`);
}

function transcribirModoDemo(audioFilePath) {
  const rawText = `[00:00:10] Practicante: Buenos días a todos. Hoy continuaremos con el análisis de la ecuación cuadrática y la interpretación geométrica de sus raíces.
[00:00:25] Practicante: En la pizarra tenemos la expresión f(x) = x^2 - 4x + 3. ¿Qué ocurre cuando f(x) es igual a cero?
[00:00:38] E1: Es cuando la parábola corta al eje X.
[00:00:44] Practicante: Muy bien, son los puntos de intersección con el eje horizontal. ¿Y cómo podemos encontrar algebraicamente esos valores?
[00:00:58] E2: Podemos factorizar buscando dos números que multiplicados den 3 y sumados den -4.
[00:01:10] Practicante: Exacto. ¿Cuáles serían esos dos números?
[00:01:15] E2: -3 y -1.
[00:01:22] Practicante: Perfecto. Entonces (x - 3)(x - 1) = 0. ¿Qué valores toma x?
[00:01:30] E1: x = 3 y x = 1.
[00:01:42] Practicante: Bien. Ahora observen la gráfica: ¿el vértice de la parábola está sobre o bajo el eje X?
[00:01:54] E3: Está bajo el eje X, en y = -1.
[00:02:08] Practicante: Excelente observación. ¿Por qué creen que eso se relaciona con tener dos soluciones reales distintas?`;

  const lineas = parsearTextoATurnos(rawText);
  return {
    ok: true,
    proveedor: 'demo',
    texto: rawText,
    lineas,
    nota: 'Transcripción generada en Modo Demostración de Observa-Retro.'
  };
}

function normalizeAudioMime(filePath, reportedMime) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.mp3') return 'audio/mp3';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.m4a' || ext === '.mp4') return 'audio/mp4';
  if (ext === '.aac') return 'audio/aac';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.flac') return 'audio/flac';
  if (ext === '.webm') return 'audio/webm';
  if (reportedMime && reportedMime.includes('audio/')) return reportedMime;
  return 'audio/mp3';
}

async function uploadAudioViaGeminiFilesApi(audioBytes, mimeType, apiKey) {
  const initUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;
  const initRes = await fetch(initUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(audioBytes.length),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      file: { display_name: `grabacion_aula_${Date.now()}` }
    })
  });

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`Error iniciando subida en Gemini Files API (${initRes.status}): ${errText}`);
  }

  const uploadUrl = initRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    throw new Error('No se recibió la URL de subida de Google Gemini Files API');
  }

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(audioBytes.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize'
    },
    body: audioBytes
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Error transfiriendo audio a Gemini Files API (${uploadRes.status}): ${errText}`);
  }

  const fileData = await uploadRes.json();
  const fileObj = fileData?.file;
  if (!fileObj || !fileObj.uri) {
    throw new Error('No se obtuvo el URI del archivo subido en Gemini');
  }

  // Si el archivo está en estado de procesamiento (PROCESSING), esperar a que esté ACTIVE
  if (fileObj.state === 'PROCESSING') {
    const fileName = fileObj.name;
    const startTime = Date.now();
    const maxWaitSec = 90;
    while ((Date.now() - startTime) < maxWaitSec * 1000) {
      await new Promise(r => setTimeout(r, 2500));
      try {
        const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`, {
          headers: { 'x-goog-api-key': apiKey }
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.state === 'ACTIVE') {
            break;
          }
          if (checkData.state === 'FAILED') {
            throw new Error('El análisis del archivo de audio falló en los servidores de Google Gemini.');
          }
        }
      } catch (checkErr) {
        // Continuar intentando
      }
    }
  }

  return { uri: fileObj.uri, mimeType: fileObj.mimeType || mimeType };
}

async function transcribirConGemini(audioFilePath, mimeType, apiKey, sizeMB) {
  const audioBytes = readFileSync(audioFilePath);
  const validMime = normalizeAudioMime(audioFilePath, mimeType);

  const initialPrompt = `Eres un asistente experto en transcripción y análisis pedagógico de clases escolares de matemáticas en Chile (Práctica Pedagógica III).
Transcribe el diálogo didáctico de esta clase identificando la secuencia didáctica completa de manera exhaustiva.

INSTRUCCIONES ESTRICTAS:
1. Divide la transcripción en turnos cronológicos.
2. Cada línea DEBE comenzar estrictamente con su marca de tiempo en corchetes [mm:ss] o [hh:mm:ss].
3. Identifica con claridad al hablante:
   - "Practicante:" o "Profesor:" para el docente.
   - "E1:", "E2:", "E3:" o "Estudiante:" para los alumnos.
4. Escribe el diálogo textual en español sin resumir ni omitir el razonamiento matemático de los estudiantes y el docente.

EJEMPLO DE FORMATO:
[00:00:12] Practicante: Buenos días. Hoy vamos a trabajar con una función afín.
[00:00:45] Practicante: ¿Cuánto da 5 multiplicado por 150?
[00:01:02] E1: Da 750.
[00:01:05] Practicante: ¿Cómo obtuviste ese valor?

Entrega ÚNICAMENTE las líneas transcritas en ese formato exacto.`;

  let audioPart;

  // Si el archivo es grande (>10MB), usamos la Files API de Gemini
  if (sizeMB > 10) {
    try {
      const fileInfo = await uploadAudioViaGeminiFilesApi(audioBytes, validMime, apiKey);
      audioPart = { fileData: { mimeType: fileInfo.mimeType, fileUri: fileInfo.uri } };
    } catch (uploadErr) {
      console.warn('Fallo upload por Files API, intentando inlineData...', uploadErr.message);
      const base64Audio = audioBytes.toString('base64');
      audioPart = { inlineData: { mimeType: validMime, data: base64Audio } };
    }
  } else {
    // Archivo menor o igual a 10MB: inlineData directo
    const base64Audio = audioBytes.toString('base64');
    audioPart = { inlineData: { mimeType: validMime, data: base64Audio } };
  }

  // Modelos oficiales de alta capacidad de contexto y cuota amplia para transcripción
  const models = [
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite'
  ];
  let lastError = null;

  for (const model of models) {
    let allTurnos = [];
    let currentPrompt = initialPrompt;
    let pass = 1;
    const maxPasses = 8; // Permite clases de hasta 2.5 horas (+2500 turnos)
    let lastTimestampSec = -1;

    try {
      while (pass <= maxPasses) {
        console.log(`[Gemini Transcripción] Modelo: ${model} | Pase: ${pass}...`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        let response;
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
          attempts++;
          try {
            response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
              },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: currentPrompt },
                    audioPart
                  ]
                }],
                generationConfig: {
                  temperature: 0.1,
                  maxOutputTokens: 8192
                }
              })
            });
          } catch (netErr) {
            const cause = netErr.cause?.message || netErr.cause?.code || netErr.message;
            throw new Error(`Error de red al conectar con Google Gemini (${cause}). Esto ocurre si el servidor se ejecuta en un entorno aislado sin acceso a internet.`);
          }

          if (response.status === 503 || response.status === 429) {
            console.warn(`[Gemini Transcripción] Servidor ocupado o cuota por minuto (${response.status}) en modelo ${model}. Esperando ${attempts * 4}s antes de reintentar (intento ${attempts}/${maxAttempts})...`);
            await new Promise(r => setTimeout(r, attempts * 4000));
            continue;
          }

          break;
        }

        if (!response.ok) {
          const errText = await response.text();
          let parsedMsg = errText;
          try {
            const p = JSON.parse(errText);
            if (p.error?.message) parsedMsg = p.error.message;
          } catch (_) {}

          if (response.status === 503) {
            lastError = new Error(`Los servidores de Google AI Studio están experimentando una alta demanda temporal (Error 503). Por favor espera 30 segundos y vuelve a presionar el botón de transcripción.`);
            break;
          }
          if (response.status === 429) {
            lastError = new Error(`Se ha alcanzado temporalmente el límite por minuto de la cuenta gratuita de Google AI Studio (Error 429). Por favor espera un minuto para que se renueve la cuota y vuelve a intentarlo.`);
            break;
          }
          if (response.status === 404) {
            lastError = new Error(`Modelo ${model} no disponible en tu región (${parsedMsg}), probando alternativa...`);
            break;
          }
          throw new Error(`Error en API de Gemini [${model}] (${response.status}): ${parsedMsg}`);
        }

        const data = await response.json();
        const candidate = data?.candidates?.[0];
        const rawText = candidate?.content?.parts?.[0]?.text || '';
        const finishReason = candidate?.finishReason;

        if (!rawText.trim()) {
          console.warn(`[Gemini Transcripción] Pase ${pass} devolvió texto vacío.`);
          break;
        }

        const passTurnos = parsearTextoATurnos(rawText);
        console.log(`[Gemini Transcripción] Pase ${pass}: ${passTurnos.length} turnos recibidos (finishReason: ${finishReason}).`);

        // Si cortó por MAX_TOKENS, la última línea suele estar cortada a la mitad (ej. "[27:03] Practicante: T").
        // Descartamos la última línea si está incompleta y tomamos el timestamp del último turno completo.
        if (finishReason === 'MAX_TOKENS' && passTurnos.length > 1) {
          const lastTurno = passTurnos[passTurnos.length - 1];
          const words = (lastTurno.x || '').trim().split(/\s+/);
          if (words.length < 3) {
            passTurnos.pop();
          }
        }

        // Buscar el timestamp del final del pase navegando desde el último turno hacia atrás
        let cutSec = lastTimestampSec;
        for (let i = passTurnos.length - 1; i >= 0; i--) {
          if (passTurnos[i].t !== null && passTurnos[i].t > lastTimestampSec) {
            cutSec = passTurnos[i].t;
            break;
          }
        }

        allTurnos = allTurnos.concat(passTurnos);

        // Si terminó naturalmente con STOP u otro motivo que no sea MAX_TOKENS, finalizamos
        if (finishReason !== 'MAX_TOKENS') {
          console.log(`[Gemini Transcripción] Grabación finalizada completamente en pase ${pass} (${finishReason}). Total turnos: ${allTurnos.length}`);
          break;
        }

        // Si se alcanzó el límite de tokens de salida de Gemini (MAX_TOKENS ~350 turnos):
        // Verificar que hayamos avanzado en el tiempo de la clase
        if (cutSec <= lastTimestampSec) {
          console.warn(`[Gemini Transcripción] El pase ${pass} no avanzó el tiempo (${cutSec}s <= ${lastTimestampSec}s). Deteniendo para evitar bucle.`);
          break;
        }

        lastTimestampSec = cutSec;
        const timeStr = fmtSeconds(lastTimestampSec);
        console.log(`[Gemini Transcripción] Límite de 8.192 tokens alcanzado en [${timeStr}] (${allTurnos.length} turnos acumulados). Iniciando pase de continuación ${pass + 1}...`);

        currentPrompt = `Eres un asistente experto en transcripción pedagógica de clases escolares de matemáticas en Chile.
Estás transcribiendo la grabación de audio adjunta. En el pase anterior la transcripción se detuvo exactamente en la marca de tiempo [${timeStr}].

INSTRUCCIONES DE CONTINUACIÓN ESTRICTAS:
1. Continúa transcribiendo el audio ESTRICTAMENTE a partir del minuto [${timeStr}] en adelante hasta el final de la clase.
2. NO repitas los diálogos anteriores a [${timeStr}]. Empieza inmediatamente con la siguiente intervención que ocurre a partir de [${timeStr}].
3. Mantén el formato obligatorio en cada turno:
   [mm:ss] Hablante: Diálogo textual
4. Identifica con precisión al hablante (Practicante/Profesor, E1, E2, Estudiante, etc.).
5. No resumas ni omitas intervenciones didácticas ni matemáticas. Entrega ÚNICAMENTE las líneas de diálogo continuadas.`;

        pass++;
      }

      if (allTurnos.length > 0) {
        const cleanedTurnos = deduplicarTurnos(allTurnos);
        const finalText = cleanedTurnos.map(l => `[${fmtSeconds(l.t)}] ${l.h ? l.h + ': ' : ''}${l.x}`).join('\n');

        return {
          ok: true,
          proveedor: 'gemini',
          modelo: model,
          texto: finalText,
          lineas: cleanedTurnos,
          pases: pass
        };
      }
    } catch (err) {
      console.warn(`[Gemini Transcripción] Falló con modelo ${model}:`, err.message);
      lastError = err;
      // Continuar al siguiente modelo en caso de falla
    }
  }

  throw lastError || new Error('No se pudo completar la transcripción con los modelos de Gemini disponibles');
}

async function transcribirConWhisper(audioFilePath, provider, apiKey) {
  const endpoint = provider === 'groq' 
    ? 'https://api.groq.com/openai/v1/audio/transcriptions'
    : 'https://api.openai.com/v1/audio/transcriptions';

  const model = provider === 'groq' ? 'whisper-large-v3' : 'whisper-1';

  const audioBytes = readFileSync(audioFilePath);
  const ext = extname(audioFilePath) || '.mp3';
  const blob = new Blob([audioBytes], { type: 'audio/mpeg' });

  const formData = new FormData();
  formData.append('file', blob, `audio${ext}`);
  formData.append('model', model);
  formData.append('language', 'es');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'segment');

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });
  } catch (netErr) {
    const cause = netErr.cause?.message || netErr.cause?.code || netErr.message;
    throw new Error(`Error de red al conectar con Whisper [${provider}] (${cause}).`);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error en Whisper API (${response.status}): ${errText}`);
  }

  const result = await response.json();
  const segments = result.segments || [];

  const lineas = segments.map((seg, idx) => {
    const startSec = Math.round(seg.start || 0);
    const text = (seg.text || '').trim();
    return {
      t: startSec,
      h: idx % 2 === 0 ? 'Practicante' : 'Estudiante',
      x: text
    };
  });

  const texto = lineas.map(l => `[${fmtSeconds(l.t)}] ${l.h}: ${l.x}`).join('\n');

  return {
    ok: true,
    proveedor: provider,
    texto,
    lineas
  };
}

function deduplicarTurnos(lineas) {
  if (!lineas || lineas.length === 0) return [];
  const result = [];
  for (let i = 0; i < lineas.length; i++) {
    const curr = lineas[i];
    if (result.length > 0) {
      const prev = result[result.length - 1];
      const sameSpeaker = (curr.h || '').trim().toLowerCase() === (prev.h || '').trim().toLowerCase();
      const timeDiff = (curr.t !== null && prev.t !== null) ? Math.abs(curr.t - prev.t) : 999;

      const currText = (curr.x || '').trim().toLowerCase();
      const prevText = (prev.x || '').trim().toLowerCase();
      const sameText = currText === prevText ||
        (currText.length > 15 && prevText.length > 15 && (currText.includes(prevText) || prevText.includes(currText)));

      if (sameSpeaker && sameText && timeDiff <= 5) {
        // Ignorar duplicado en la juntura entre pases
        continue;
      }
    }
    result.push(curr);
  }
  return result;
}

function parsearTextoATurnos(rawText) {
  const lineas = [];
  const rawLines = rawText.split('\n');

  for (const raw of rawLines) {
    const l = raw.trim();
    if (!l) continue;

    // Ignorar bloques de código o títulos markdown
    if (l.startsWith('```') || l.startsWith('---') || l.startsWith('###') || l.startsWith('**Pase')) continue;
    if (/^(aquí continúo|aquí está la continuación|continuación de la clase|continuación:)/i.test(l)) continue;

    let t = null;
    let h = '';
    let x = l;

    // Soporta [00:01:25], [1:25], [ 0m28s ], [ 1h 2m 5s ], (00:01:25), etc.
    const mTime = l.match(/^[\[(]?\s*(\d{1,2}:\d{2}(?::\d{2})?|\d+\s*[hms](?:\s*\d+\s*[ms])*(?:\s*\d+\s*s)?)\s*[\])]?\s*[-–:]?\s*(.*)$/i);
    if (mTime) {
      t = parseSegundos(mTime[1]);
      x = mTime[2].trim();
    }

    const mSpeaker = x.match(/^([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ ._\/-]{1,35}):\s*(.*)$/);
    if (mSpeaker) {
      h = mSpeaker[1].trim();
      x = mSpeaker[2].trim();
    }

    // Si no tiene marca de tiempo ni hablante y parece texto explicativo de la IA, ignorar
    if (t === null && !h && /^(nota|continuación|transcripción|espero|saludos)/i.test(x)) {
      continue;
    }

    if (x) {
      lineas.push({ t, h, x });
    }
  }

  return lineas;
}

function parseSegundos(str) {
  if (!str) return null;
  const s = str.trim().toLowerCase();

  // Caso con 'm' o 's' o 'h' ej. [ 0m28s ], [ 1h 2m 10s ]
  if (s.includes('m') || s.includes('s') || s.includes('h')) {
    const hMatch = s.match(/(\d+)\s*h/);
    const mMatch = s.match(/(\d+)\s*m/);
    const sMatch = s.match(/(\d+)\s*s/);
    const hours = hMatch ? parseInt(hMatch[1], 10) : 0;
    const mins = mMatch ? parseInt(mMatch[1], 10) : 0;
    const secs = sMatch ? parseInt(sMatch[1], 10) : 0;
    return hours * 3600 + mins * 60 + secs;
  }

  const p = s.split(':').map(Number);
  if (p.some(isNaN)) return null;

  if (p.length === 2) {
    return p[0] * 60 + p[1];
  }
  if (p.length === 3) {
    // Si el primer número es > 10, muy probablemente es mm:ss:ff o centisegundos, no horas
    if (p[0] > 10) {
      return p[0] * 60 + p[1];
    }
    return p[0] * 3600 + p[1] * 60 + p[2];
  }
  return null;
}

function fmtSeconds(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = n => String(n).padStart(2, '0');
  if (h > 0) {
    return `${p(h)}:${p(m)}:${p(sec)}`;
  }
  return `${p(m)}:${p(sec)}`;
}
