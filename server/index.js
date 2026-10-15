import { createServer } from 'node:http';
import { createReadStream, createWriteStream, statSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import db from './db.js';
import { authenticateRequest, hashPassword, verifyPassword, createSession, deleteSession } from './auth.js';
import { streamAudioFile } from './audioService.js';
import { extractTextFromDocx } from './docxParser.js';
import {
  MATRIZ,
  RUBRICA_SECUENCIAS,
  SECUENCIA_REFLEXION,
  segmentarEpisodios,
  extraerEvidencias,
  valorarCompetencias,
  valorarRubricaSecuencias,
  procesarTurnoReflexion,
  compilarBorradorReflexion
} from './pedagogyEngine.js';
import { RUBRICA_REFLEXION, calcularResumenReflexion } from './reflectionEval.js';
import { getTranscriptionConfig, saveTranscriptionConfig, transcribirAudio } from './transcriptionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const publicDir = join(rootDir, 'public');
const uploadsAudioDir = process.env.UPLOADS_AUDIO_DIR || join(rootDir, 'uploads', 'audios');
const uploadsDocsDir = process.env.UPLOADS_DOCS_DIR || join(rootDir, 'uploads', 'documentos');

mkdirSync(uploadsAudioDir, { recursive: true });
mkdirSync(uploadsDocsDir, { recursive: true });

const PORT = process.env.PORT || 3000;

const MIME_STATIC = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-filename',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString('utf-8');
      if (body.length > 50 * 1024 * 1024) { // 50MB limit
        reject(new Error('Payload demasiado grande'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({ raw: body });
      }
    });
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;
  const method = req.method;

  // Manejo de CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-filename',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    res.end();
    return;
  }

  // ============================================================
  // API: Autenticación
  // ============================================================
  if (pathname === '/api/auth/login' && method === 'POST') {
    try {
      const { email, password } = await parseBody(req);
      if (!email || !password) {
        return sendJson(res, 400, { error: 'Faltan credenciales' });
      }
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
      if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
        return sendJson(res, 401, { error: 'Correo o contraseña incorrectos' });
      }
      const session = createSession(user.id);
      res.setHeader('Set-Cookie', `session_token=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`);
      return sendJson(res, 200, {
        token: session.token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          institucion: user.institucion
        }
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token && req.headers['cookie']) {
      const match = req.headers['cookie'].match(/session_token=([a-f0-9]+)/);
      if (match) token = match[1];
    }
    deleteSession(token);
    res.setHeader('Set-Cookie', 'session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });
    return sendJson(res, 200, { user });
  }

  // ============================================================
  // API: Usuarios y Practicantes
  // ============================================================
  if (pathname === '/api/users/practicantes' && method === 'GET') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });
    const practicantes = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE role = ? ORDER BY name ASC').all('estudiante');
    return sendJson(res, 200, { practicantes });
  }

  // ============================================================
  // API: Intervenciones (CRUD)
  // ============================================================
  if (pathname === '/api/intervenciones' && method === 'GET') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });

    let studentId = user.id;
    // Si es tutor o admin, puede consultar las de un estudiante específico pasado por query o las de todos
    const requestedStudent = urlObj.searchParams.get('studentId');
    if ((user.role === 'tutor' || user.role === 'admin') && requestedStudent) {
      studentId = requestedStudent;
    }

    let rows;
    if (user.role === 'tutor' || user.role === 'admin') {
      if (requestedStudent) {
        rows = db.prepare('SELECT * FROM intervenciones WHERE user_id = ? ORDER BY fecha DESC, creado_at DESC').all(studentId);
      } else {
        rows = db.prepare('SELECT i.*, u.name as student_name FROM intervenciones i JOIN users u ON i.user_id = u.id ORDER BY i.fecha DESC, i.creado_at DESC').all();
      }
    } else {
      rows = db.prepare('SELECT * FROM intervenciones WHERE user_id = ? ORDER BY fecha DESC, creado_at DESC').all(user.id);
    }

    // Agregar estado de análisis y reflexión
    const result = rows.map(r => {
      const an = db.prepare('SELECT con_reflexion FROM analisis WHERE intervencion_id = ?').get(r.id);
      const ref = db.prepare('SELECT aprobado FROM reflexiones WHERE intervencion_id = ?').get(r.id);
      const evRef = db.prepare('SELECT nivel_general FROM evaluaciones_reflexivas WHERE intervencion_id = ?').get(r.id);
      return {
        ...r,
        tieneAnalisis: !!an,
        reflexionAprobada: ref ? !!ref.aprobado : false,
        evaluacionReflexiva: evRef ? evRef.nivel_general : null
      };
    });

    return sendJson(res, 200, { intervenciones: result });
  }

  if (pathname.startsWith('/api/intervenciones/') && method === 'GET') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });

    const parts = pathname.split('/');
    const id = parts[3];

    const interv = db.prepare('SELECT * FROM intervenciones WHERE id = ?').get(id);
    if (!interv) return sendJson(res, 404, { error: 'Intervención no encontrada' });

    // Permisos: el estudiante solo ve las suyas; tutores/admins ven cualquiera
    if (user.role === 'estudiante' && interv.user_id !== user.id) {
      return sendJson(res, 403, { error: 'Acceso no permitido' });
    }

    const transcripcionRow = db.prepare('SELECT lineas_json FROM transcripciones WHERE intervencion_id = ?').get(id);
    const lineas = transcripcionRow ? JSON.parse(transcripcionRow.lineas_json) : [];

    const analisisRow = db.prepare('SELECT * FROM analisis WHERE intervencion_id = ?').get(id);
    let analisis = null;
    if (analisisRow) {
      analisis = {
        fecha: analisisRow.fecha,
        conReflexion: !!analisisRow.con_reflexion,
        calidad: analisisRow.calidad,
        sintesis: analisisRow.sintesis,
        episodios: JSON.parse(analisisRow.episodios_json || '[]'),
        evidencias: JSON.parse(analisisRow.evidencias_json || '[]'),
        competencias: JSON.parse(analisisRow.competencias_json || '[]'),
        ra: JSON.parse(analisisRow.ra_json || '[]'),
        rubrica: JSON.parse(analisisRow.rubrica_json || 'null'),
        seguimiento: JSON.parse(analisisRow.seguimiento_json || '[]'),
        ajustes: JSON.parse(analisisRow.ajustes_json || '[]')
      };
    }

    const reflexionRow = db.prepare('SELECT * FROM reflexiones WHERE intervencion_id = ?').get(id);
    let reflexion = null;
    if (reflexionRow) {
      reflexion = {
        turnos: JSON.parse(reflexionRow.turnos_json || '[]'),
        paso: reflexionRow.paso_actual,
        borrador: JSON.parse(reflexionRow.borrador_json || 'null'),
        aprobado: !!reflexionRow.aprobado,
        fechaAprob: reflexionRow.fecha_aprob
      };
    }

    const revisionRow = db.prepare('SELECT * FROM revisiones WHERE intervencion_id = ?').get(id);
    let revision = { comp: {}, rub: {}, estudiante: '', academico: '' };
    if (revisionRow) {
      revision = {
        comp: JSON.parse(revisionRow.comp_revision_json || '{}'),
        rub: JSON.parse(revisionRow.rub_revision_json || '{}'),
        estudiante: revisionRow.retro_estudiante || '',
        academico: revisionRow.retro_tutor || ''
      };
    }

    const evalReflexivaRow = db.prepare('SELECT * FROM evaluaciones_reflexivas WHERE intervencion_id = ?').get(id);
    let evaluacionReflexiva = null;
    if (evalReflexivaRow) {
      evaluacionReflexiva = {
        id: evalReflexivaRow.id,
        nivelGeneral: evalReflexivaRow.nivel_general,
        dimensiones: JSON.parse(evalReflexivaRow.dimensiones_json || '{}'),
        fortalezas: evalReflexivaRow.fortalezas,
        areasMejora: evalReflexivaRow.areas_mejora,
        metasProximaClase: evalReflexivaRow.metas_proxima_clase,
        fecha: evalReflexivaRow.fecha
      };
    }

    const studentUser = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(interv.user_id);

    return sendJson(res, 200, {
      intervencion: interv,
      estudiante: studentUser,
      lineas,
      analisis,
      reflexion,
      revision,
      evaluacionReflexiva
    });
  }

  if (pathname === '/api/intervenciones' && method === 'POST') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });

    try {
      const data = await parseBody(req);
      const id = 'int-' + randomUUID();
      const now = new Date().toISOString();

      const insertInterv = db.prepare(`
        INSERT INTO intervenciones (
          id, user_id, fecha, curso, contenido, proposito, contexto, planificacion, tipo_registro,
          audio_path, audio_filename, audio_mimetype, n_lineas, creado_at, actualizado_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const nLineas = (data.lineas && Array.isArray(data.lineas)) ? data.lineas.length : 0;

      insertInterv.run(
        id,
        user.id,
        data.fecha || now.slice(0, 10),
        (data.curso || '').trim(),
        (data.contenido || 'Intervención sin título').trim(),
        (data.proposito || '').trim(),
        (data.contexto || '').trim(),
        (data.planificacion || '').trim(),
        data.tipoRegistro || 'Solo audio transcrito',
        data.audioPath || null,
        data.audioFilename || null,
        data.audioMimeType || 'audio/mpeg',
        nLineas,
        now,
        now
      );

      // Guardar transcripción
      const lineas = Array.isArray(data.lineas) ? data.lineas : [];
      db.prepare('INSERT INTO transcripciones (intervencion_id, lineas_json) VALUES (?, ?)').run(id, JSON.stringify(lineas));

      return sendJson(res, 201, { id, ok: true });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  if (pathname.startsWith('/api/intervenciones/') && method === 'DELETE') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });

    const id = pathname.split('/')[3];
    const interv = db.prepare('SELECT user_id FROM intervenciones WHERE id = ?').get(id);
    if (!interv) return sendJson(res, 404, { error: 'No encontrada' });

    if (user.role === 'estudiante' && interv.user_id !== user.id) {
      return sendJson(res, 403, { error: 'Acceso no permitido' });
    }

    db.prepare('DELETE FROM intervenciones WHERE id = ?').run(id);
    return sendJson(res, 200, { ok: true });
  }

  // ============================================================
  // API: Subida de Archivos de Audio y Documentos
  // ============================================================
  if (pathname.startsWith('/api/upload/audio/') && method === 'POST') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });

    const id = pathname.split('/')[4];
    const interv = db.prepare('SELECT * FROM intervenciones WHERE id = ?').get(id);
    if (!interv) return sendJson(res, 404, { error: 'Intervención no encontrada' });
    if (user.role === 'estudiante' && interv.user_id !== user.id) {
      return sendJson(res, 403, { error: 'Acceso no permitido' });
    }

    const rawFilename = req.headers['x-filename'] ? decodeURIComponent(req.headers['x-filename']) : 'audio.mp3';
    const ext = extname(rawFilename).toLowerCase() || '.mp3';
    const savedFilename = `audio-${id}-${Date.now()}${ext}`;
    const targetPath = join(uploadsAudioDir, savedFilename);

    const writeStream = createWriteStream(targetPath);
    req.pipe(writeStream);

    writeStream.on('finish', () => {
      const stat = statSync(targetPath);
      const mime = req.headers['content-type'] || 'audio/mpeg';

      db.prepare(`
        UPDATE intervenciones
        SET audio_path = ?, audio_filename = ?, audio_mimetype = ?, audio_size = ?, actualizado_at = datetime('now')
        WHERE id = ?
      `).run(savedFilename, rawFilename, mime, stat.size, id);

      sendJson(res, 200, { ok: true, filename: rawFilename, size: stat.size });
    });

    writeStream.on('error', err => {
      sendJson(res, 500, { error: `Error al guardar audio: ${err.message}` });
    });
    return;
  }

  // Streaming de Audio (HTTP 206 Byte-Range)
  if (pathname.startsWith('/api/audio/') && method === 'GET') {
    const id = pathname.split('/')[3];
    const interv = db.prepare('SELECT audio_path FROM intervenciones WHERE id = ?').get(id);
    if (!interv || !interv.audio_path) {
      return sendJson(res, 404, { error: 'Audio no registrado para esta intervención' });
    }
    const fullAudioPath = join(uploadsAudioDir, interv.audio_path);
    streamAudioFile(fullAudioPath, req, res);
    return;
  }

  // Subida de Documento (.docx o texto)
  if (pathname === '/api/upload/documento' && method === 'POST') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });

    const rawFilename = req.headers['x-filename'] ? decodeURIComponent(req.headers['x-filename']) : 'documento.docx';
    const ext = extname(rawFilename).toLowerCase();
    const tempFile = join(uploadsDocsDir, `doc-${Date.now()}${ext}`);

    const writeStream = createWriteStream(tempFile);
    req.pipe(writeStream);

    writeStream.on('finish', async () => {
      try {
        let text = '';
        if (ext === '.docx') {
          text = await extractTextFromDocx(tempFile);
        } else {
          // Lectura directa de texto plano
          const chunks = [];
          const read = createReadStream(tempFile, { encoding: 'utf-8' });
          for await (const chunk of read) chunks.push(chunk);
          text = chunks.join('');
        }
        sendJson(res, 200, { ok: true, filename: rawFilename, text });
      } catch (err) {
        sendJson(res, 500, { error: `Error procesando documento: ${err.message}` });
      }
    });
    return;
  }

  // Configuración de Transcripción
  if (pathname === '/api/settings/transcription' && method === 'GET') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });
    const cfg = getTranscriptionConfig();
    return sendJson(res, 200, {
      provider: cfg.provider,
      configured: !!cfg.apiKey,
      maskedKey: cfg.apiKey ? cfg.apiKey.slice(0, 4) + '...' + cfg.apiKey.slice(-4) : ''
    });
  }

  if (pathname === '/api/settings/transcription' && method === 'POST') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });
    const body = await parseBody(req);
    saveTranscriptionConfig(body.provider, body.apiKey);
    return sendJson(res, 200, { ok: true, provider: body.provider, configured: !!body.apiKey });
  }

  // Transcribir Audio con IA
  if (pathname === '/api/transcribir-audio' && method === 'POST') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });

    const contentType = req.headers['content-type'] || '';

    // Caso A: Se envió JSON con el ID de una intervención ya existente o audioPrueba
    if (contentType.includes('application/json')) {
      const body = await parseBody(req);
      let audioPath = null;
      let mimeType = 'audio/mp4';

      if (body.audioPrueba) {
        const testFile = join(rootDir, 'Audios de prueba', body.audioPrueba);
        if (!existsSync(testFile)) return sendJson(res, 404, { error: 'Audio de prueba no encontrado' });
        audioPath = testFile;
      } else if (body.intervencionId) {
        const interv = db.prepare('SELECT audio_path, audio_mimetype FROM intervenciones WHERE id = ?').get(body.intervencionId);
        if (!interv || !interv.audio_path) {
          return sendJson(res, 400, { error: 'La intervención no tiene audio registrado' });
        }
        audioPath = join(uploadsAudioDir, interv.audio_path);
        mimeType = interv.audio_mimetype || 'audio/mp4';
      } else {
        return sendJson(res, 400, { error: 'Falta intervencionId o audioPrueba' });
      }

      try {
        const result = await transcribirAudio(audioPath, mimeType);
        if (body.intervencionId && result.ok && result.lineas.length) {
          db.prepare(`
            INSERT INTO transcripciones (intervencion_id, lineas_json) VALUES (?, ?)
            ON CONFLICT(intervencion_id) DO UPDATE SET lineas_json = excluded.lineas_json
          `).run(body.intervencionId, JSON.stringify(result.lineas));
          db.prepare('UPDATE intervenciones SET n_lineas = ?, actualizado_at = datetime("now") WHERE id = ?').run(result.lineas.length, body.intervencionId);
        }
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    // Caso B: Se envió el archivo de audio directamente en el stream para transcribirlo
    const rawFilename = req.headers['x-filename'] ? decodeURIComponent(req.headers['x-filename']) : 'audio.mp3';
    const ext = extname(rawFilename).toLowerCase() || '.mp3';
    const tempAudio = join(uploadsAudioDir, `trans-${Date.now()}${ext}`);

    const writeStream = createWriteStream(tempAudio);
    req.pipe(writeStream);

    writeStream.on('finish', async () => {
      try {
        const mime = req.headers['content-type'] || 'audio/mpeg';
        const result = await transcribirAudio(tempAudio, mime);
        sendJson(res, 200, { ...result, savedFile: tempAudio, filename: rawFilename });
      } catch (err) {
        sendJson(res, 500, { error: `Error durante la transcripción: ${err.message}` });
      }
    });

    writeStream.on('error', err => {
      sendJson(res, 500, { error: `Error recibiendo audio: ${err.message}` });
    });
    return;
  }

  // ============================================================
  // API: Audios de Prueba Disponibles en el Proyecto
  // ============================================================
  if (pathname === '/api/audios-prueba' && method === 'GET') {
    const audiosPruebaDir = join(rootDir, 'Audios de prueba');
    if (!existsSync(audiosPruebaDir)) return sendJson(res, 200, { files: [] });

    try {
      const entries = readdirSync(audiosPruebaDir);
      const files = entries
        .filter(f => !f.startsWith('.'))
        .map(name => {
          const fullP = join(audiosPruebaDir, name);
          const st = statSync(fullP);
          const sizeMB = (st.size / (1024 * 1024)).toFixed(1);
          let duracionAprox = 'Grabación de aula';
          if (name.includes('Cordillera')) duracionAprox = '45 min';
          else if (name.includes('La Costa')) duracionAprox = '1h 26 min';
          else if (name.includes('Puchoco')) duracionAprox = '1h 23 min';
          return {
            filename: name,
            sizeBytes: st.size,
            sizeMB,
            duracionAprox
          };
        });
      return sendJson(res, 200, { files });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  if (pathname === '/api/audios-prueba/cargar' && method === 'POST') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });

    try {
      const body = await parseBody(req);
      const filename = body.filename;
      const audiosPruebaDir = join(rootDir, 'Audios de prueba');
      const sourcePath = join(audiosPruebaDir, filename);

      if (!existsSync(sourcePath)) {
        return sendJson(res, 404, { error: 'Audio de prueba no encontrado' });
      }

      const ext = extname(filename).toLowerCase() || '.m4a';
      const savedFilename = `audio-prueba-${Date.now()}${ext}`;
      const targetPath = join(uploadsAudioDir, savedFilename);
      copyFileSync(sourcePath, targetPath);
      const stat = statSync(targetPath);

      if (body.intervencionId) {
        db.prepare(`
          UPDATE intervenciones
          SET audio_path = ?, audio_filename = ?, audio_mimetype = 'audio/mp4', audio_size = ?, actualizado_at = datetime('now')
          WHERE id = ?
        `).run(savedFilename, filename, stat.size, body.intervencionId);
      }

      return sendJson(res, 200, {
        ok: true,
        savedFilename,
        filename,
        sizeBytes: stat.size,
        mimeType: 'audio/mp4'
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // ============================================================
  // API: Motor de Análisis de Evidencias
  // ============================================================
  if (pathname.startsWith('/api/intervenciones/') && pathname.endsWith('/analizar') && method === 'POST') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });

    const id = pathname.split('/')[3];
    const interv = db.prepare('SELECT * FROM intervenciones WHERE id = ?').get(id);
    if (!interv) return sendJson(res, 404, { error: 'Intervención no encontrada' });

    const transcripcionRow = db.prepare('SELECT lineas_json FROM transcripciones WHERE intervencion_id = ?').get(id);
    const lineas = transcripcionRow ? JSON.parse(transcripcionRow.lineas_json) : [];

    const reflexionRow = db.prepare('SELECT turnos_json, aprobado FROM reflexiones WHERE intervencion_id = ?').get(id);
    const conReflexion = reflexionRow && JSON.parse(reflexionRow.turnos_json || '[]').length > 0;

    const episodios = segmentarEpisodios(lineas);
    const evidencias = extraerEvidencias(lineas, episodios);
    const competencias = valorarCompetencias(evidencias, lineas, conReflexion);
    const rubrica = valorarRubricaSecuencias(lineas, episodios, evidencias, !!interv.planificacion, conReflexion);

    // Calcular estado de RA prioritarios
    const ra = [
      { id: "RA1.a", estado: "reunida", evidencias: evidencias.filter(e => e.ind === "CE5.1" || e.ind === "CE1.1").map(e => e.id), falta: "" },
      { id: "RA1.b", estado: "reunida", evidencias: evidencias.filter(e => e.ind === "CE5.3" || e.ind === "CE4.3").map(e => e.id), falta: "" },
      { id: "RA2.a", estado: "reunida", evidencias: evidencias.filter(e => e.ind === "CE5.2" || e.ind === "CE5.4").map(e => e.id), falta: "" },
      { id: "RA2.b", estado: "reunida", evidencias: evidencias.filter(e => e.ind === "CE5.3").map(e => e.id), falta: "" },
      { id: "RA2.c", estado: "parcial", evidencias: evidencias.filter(e => e.ind === "CE5.5").map(e => e.id), falta: "Profundizar en la comparación de procedimientos divergentes." },
      { id: "RA3.a", estado: "parcial", evidencias: evidencias.filter(e => e.ind === "CE2.1" || e.ind === "CE2.2").map(e => e.id), falta: "Recoger evidencia formativa individual en el cierre." },
      { id: "RA3.b", estado: "reunida", evidencias: evidencias.filter(e => e.tipo === "discrepa").map(e => e.id), falta: "" },
      { id: "RA3.c", estado: "reunida", evidencias: evidencias.filter(e => e.tipo === "discrepa").map(e => e.id), falta: "" }
    ];

    const sintesis = `Análisis de la clase sobre "${interv.contenido}". Se identificaron ${episodios.length} episodios formativos y ${evidencias.length} evidencias observables vinculadas a las competencias de Práctica III.`;

    db.prepare(`
      INSERT INTO analisis (
        intervencion_id, fecha, con_reflexion, calidad, sintesis, episodios_json, evidencias_json,
        competencias_json, ra_json, rubrica_json, seguimiento_json, ajustes_json, creado_at
      ) VALUES (?, datetime('now'), ?, 'Registro de aula con transcripción y marcas temporales.', ?, ?, ?, ?, ?, ?, '[]', '[]', datetime('now'))
      ON CONFLICT(intervencion_id) DO UPDATE SET
        fecha = datetime('now'),
        con_reflexion = excluded.con_reflexion,
        sintesis = excluded.sintesis,
        episodios_json = excluded.episodios_json,
        evidencias_json = excluded.evidencias_json,
        competencias_json = excluded.competencias_json,
        ra_json = excluded.ra_json,
        rubrica_json = excluded.rubrica_json
    `).run(
      id,
      conReflexion ? 1 : 0,
      sintesis,
      JSON.stringify(episodiosEp(episodios)),
      JSON.stringify(evidencias),
      JSON.stringify(competencias),
      JSON.stringify(ra),
      JSON.stringify(rubrica)
    );

    return sendJson(res, 200, {
      ok: true,
      analisis: {
        episodios,
        evidencias,
        competencias,
        ra,
        rubrica,
        sintesis
      }
    });
  }

  function episodiosEp(eps) {
    return eps;
  }

  // ============================================================
  // API: Chatbot Reflexivo (8 Pasos)
  // ============================================================
  if (pathname.startsWith('/api/intervenciones/') && pathname.endsWith('/reflexion/turno') && method === 'POST') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });

    const id = pathname.split('/')[3];
    const interv = db.prepare('SELECT * FROM intervenciones WHERE id = ?').get(id);
    if (!interv) return sendJson(res, 404, { error: 'Intervención no encontrada' });

    const body = await parseBody(req);
    const mensajeUsuario = (body.mensaje || '').trim();

    let refRow = db.prepare('SELECT * FROM reflexiones WHERE intervencion_id = ?').get(id);
    let turnos = refRow ? JSON.parse(refRow.turnos_json || '[]') : [];

    if (mensajeUsuario) {
      turnos.push({ r: 'u', c: mensajeUsuario });
    }

    const respuestaBot = procesarTurnoReflexion(interv, mensajeUsuario, turnos);
    turnos.push({
      r: 'a',
      c: respuestaBot.mensaje,
      paso: respuestaBot.paso
    });

    db.prepare(`
      INSERT INTO reflexiones (
        intervencion_id, turnos_json, paso_actual, borrador_json, aprobado, creado_at, actualizado_at
      ) VALUES (?, ?, ?, NULL, 0, datetime('now'), datetime('now'))
      ON CONFLICT(intervencion_id) DO UPDATE SET
        turnos_json = excluded.turnos_json,
        paso_actual = excluded.paso_actual,
        actualizado_at = datetime('now')
    `).run(id, JSON.stringify(turnos), respuestaBot.paso);

    return sendJson(res, 200, {
      ok: true,
      turno: {
        r: 'a',
        c: respuestaBot.mensaje,
        paso: respuestaBot.paso,
        nombrePaso: respuestaBot.nombrePaso
      },
      sugerencias: respuestaBot.sugerencias,
      puedeGenerarBorrador: respuestaBot.puedeGenerarBorrador,
      pasoActual: respuestaBot.paso
    });
  }

  if (pathname.startsWith('/api/intervenciones/') && pathname.endsWith('/reflexion/borrador') && method === 'POST') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });

    const id = pathname.split('/')[3];
    const refRow = db.prepare('SELECT turnos_json FROM reflexiones WHERE intervencion_id = ?').get(id);
    if (!refRow) return sendJson(res, 400, { error: 'Aún no hay diálogo reflexivo' });

    const turnos = JSON.parse(refRow.turnos_json || '[]');
    const borrador = compilarBorradorReflexion(turnos);

    db.prepare(`
      UPDATE reflexiones
      SET borrador_json = ?, actualizado_at = datetime('now')
      WHERE intervencion_id = ?
    `).run(JSON.stringify(borrador), id);

    return sendJson(res, 200, { ok: true, borrador });
  }

  if (pathname.startsWith('/api/intervenciones/') && pathname.endsWith('/reflexion/aprobar') && method === 'POST') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });

    const id = pathname.split('/')[3];
    const body = await parseBody(req);
    const borrador = body.borrador;
    const today = new Date().toISOString().slice(0, 10);

    db.prepare(`
      UPDATE reflexiones
      SET borrador_json = ?, aprobado = 1, fecha_aprob = ?, actualizado_at = datetime('now')
      WHERE intervencion_id = ?
    `).run(JSON.stringify(borrador), today, id);

    return sendJson(res, 200, { ok: true, fechaAprob: today });
  }

  // ============================================================
  // API: Revisión del Formador / Tutor
  // ============================================================
  if (pathname.startsWith('/api/intervenciones/') && pathname.endsWith('/revision') && method === 'POST') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });
    if (user.role !== 'tutor' && user.role !== 'admin') {
      return sendJson(res, 403, { error: 'Solo formadores y tutores pueden guardar revisiones académicas' });
    }

    const id = pathname.split('/')[3];
    const body = await parseBody(req);

    db.prepare(`
      INSERT INTO revisiones (
        intervencion_id, tutor_id, comp_revision_json, rub_revision_json, retro_estudiante, retro_tutor, actualizado_at
      ) VALUES (?, ?, ?, ?, '', ?, datetime('now'))
      ON CONFLICT(intervencion_id) DO UPDATE SET
        tutor_id = excluded.tutor_id,
        comp_revision_json = excluded.comp_revision_json,
        rub_revision_json = excluded.rub_revision_json,
        retro_tutor = excluded.retro_tutor,
        actualizado_at = datetime('now')
    `).run(
      id,
      user.id,
      JSON.stringify(body.comp || {}),
      JSON.stringify(body.rub || {}),
      body.retroTutor || ''
    );

    return sendJson(res, 200, { ok: true });
  }

  // Comentario del estudiante
  if (pathname.startsWith('/api/intervenciones/') && pathname.endsWith('/comentario-estudiante') && method === 'POST') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });

    const id = pathname.split('/')[3];
    const body = await parseBody(req);

    db.prepare(`
      INSERT INTO revisiones (
        intervencion_id, tutor_id, comp_revision_json, rub_revision_json, retro_estudiante, retro_tutor, actualizado_at
      ) VALUES (?, NULL, '{}', '{}', ?, '', datetime('now'))
      ON CONFLICT(intervencion_id) DO UPDATE SET
        retro_estudiante = excluded.retro_estudiante,
        actualizado_at = datetime('now')
    `).run(id, body.comentario || '');

    return sendJson(res, 200, { ok: true });
  }

  // ============================================================
  // API: Módulo de Evaluación de la Reflexión de la Práctica
  // ============================================================
  if (pathname === '/api/evaluacion-reflexiva/rubrica' && method === 'GET') {
    return sendJson(res, 200, { rubrica: RUBRICA_REFLEXION });
  }

  if (pathname.startsWith('/api/intervenciones/') && pathname.endsWith('/evaluacion-reflexiva') && method === 'POST') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });
    if (user.role !== 'tutor' && user.role !== 'admin') {
      return sendJson(res, 403, { error: 'Solo formadores y tutores pueden evaluar la reflexión docente' });
    }

    const id = pathname.split('/')[3];
    const interv = db.prepare('SELECT user_id FROM intervenciones WHERE id = ?').get(id);
    if (!interv) return sendJson(res, 404, { error: 'Intervención no encontrada' });

    const body = await parseBody(req);
    const resumen = calcularResumenReflexion({ dimensiones: body.dimensiones });
    const nivelGeneral = resumen ? resumen.nivelGlobal : 'Nivel 1 · Inicial';
    const evalId = 'ev-ref-' + randomUUID();
    const today = new Date().toISOString().slice(0, 10);

    db.prepare(`
      INSERT INTO evaluaciones_reflexivas (
        id, intervencion_id, user_id, tutor_id, nivel_general, dimensiones_json, fortalezas, areas_mejora, metas_proxima_clase, fecha
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(intervencion_id) DO UPDATE SET
        tutor_id = excluded.tutor_id,
        nivel_general = excluded.nivel_general,
        dimensiones_json = excluded.dimensiones_json,
        fortalezas = excluded.fortalezas,
        areas_mejora = excluded.areas_mejora,
        metas_proxima_clase = excluded.metas_proxima_clase,
        fecha = excluded.fecha
    `).run(
      evalId,
      id,
      interv.user_id,
      user.id,
      nivelGeneral,
      JSON.stringify(body.dimensiones || {}),
      body.fortalezas || '',
      body.areasMejora || '',
      body.metasProximaClase || '',
      today
    );

    return sendJson(res, 200, { ok: true, nivelGeneral, resumen });
  }

  // Trayectoria longitudinal de reflexión de un estudiante
  if (pathname.startsWith('/api/estudiantes/') && pathname.endsWith('/trayectoria-reflexiva') && method === 'GET') {
    const user = authenticateRequest(req);
    if (!user) return sendJson(res, 401, { error: 'No autorizado' });

    const studentId = pathname.split('/')[3];
    if (user.role === 'estudiante' && user.id !== studentId) {
      return sendJson(res, 403, { error: 'Acceso no permitido' });
    }

    const evals = db.prepare(`
      SELECT e.*, i.contenido as intervencion_nombre, i.fecha as intervencion_fecha, u.name as tutor_nombre
      FROM evaluaciones_reflexivas e
      JOIN intervenciones i ON e.intervencion_id = i.id
      JOIN users u ON e.tutor_id = u.id
      WHERE e.user_id = ?
      ORDER BY i.fecha ASC
    `).all(studentId);

    const trayectoria = evals.map(e => ({
      ...e,
      dimensiones: JSON.parse(e.dimensiones_json || '{}')
    }));

    return sendJson(res, 200, { trayectoria, rubrica: RUBRICA_REFLEXION });
  }

  // ============================================================
  // Servir Archivos Estáticos (Frontend SPA)
  // ============================================================
  let filePath = join(publicDir, pathname === '/' ? 'index.html' : pathname);
  if (!existsSync(filePath)) {
    filePath = join(publicDir, 'index.html');
  }

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_STATIC[ext] || 'application/octet-stream';

  try {
    const stat = statSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size
    });
    createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Página no encontrada');
  }
});

server.setTimeout(600000); // 10 minutos para procesar grabaciones largas en múltiples pases de IA

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Plataforma Observa-Retro · Práctica Pedagógica III`);
  console.log(` Servidor activo en http://localhost:${PORT}`);
  console.log(` Base de datos persistente SQLite: observa_retro.db`);
  console.log(`=======================================================`);
});

export default server;
