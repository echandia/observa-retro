import { createClient } from '@libsql/client';

let cloudClient = null;
let isConfigured = false;

/**
 * Inicializa la conexión con Turso si las variables de entorno están presentes
 */
export function getCloudClient() {
  if (cloudClient) return cloudClient;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    return null;
  }

  try {
    cloudClient = createClient({
      url: url.startsWith('http') || url.startsWith('libsql') ? url : `https://${url}`,
      authToken
    });
    isConfigured = true;
    return cloudClient;
  } catch (err) {
    console.error('[CloudSync] Error inicializando cliente Turso:', err.message);
    return null;
  }
}

export function isCloudEnabled() {
  return !!getCloudClient();
}

/**
 * Crea las tablas en Turso si aún no existen
 */
async function ensureCloudSchema(client) {
  const schemaStatements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      institucion TEXT DEFAULT 'UCSC',
      rut TEXT,
      curso TEXT,
      seccion TEXT,
      created_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS intervenciones (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      fecha TEXT NOT NULL,
      curso TEXT NOT NULL,
      contenido TEXT NOT NULL,
      proposito TEXT,
      contexto TEXT,
      planificacion TEXT,
      tipo_registro TEXT NOT NULL,
      audio_path TEXT,
      audio_filename TEXT,
      audio_mimetype TEXT,
      audio_size INTEGER DEFAULT 0,
      audio_duration INTEGER DEFAULT 0,
      n_lineas INTEGER DEFAULT 0,
      creado_at TEXT NOT NULL,
      actualizado_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS transcripciones (
      intervencion_id TEXT PRIMARY KEY,
      lineas_json TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS analisis (
      intervencion_id TEXT PRIMARY KEY,
      fecha TEXT NOT NULL,
      con_reflexion INTEGER DEFAULT 1,
      calidad TEXT DEFAULT 'Adecuado',
      sintesis TEXT,
      episodios_json TEXT NOT NULL,
      evidencias_json TEXT NOT NULL,
      competencias_json TEXT NOT NULL,
      ra_json TEXT,
      rubrica_json TEXT,
      seguimiento_json TEXT,
      ajustes_json TEXT,
      creado_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS reflexiones (
      intervencion_id TEXT PRIMARY KEY,
      turnos_json TEXT NOT NULL,
      paso_actual INTEGER DEFAULT 1,
      borrador_json TEXT,
      aprobado INTEGER DEFAULT 0,
      fecha_aprob TEXT,
      creado_at TEXT NOT NULL,
      actualizado_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS revisiones (
      id TEXT PRIMARY KEY,
      intervencion_id TEXT UNIQUE NOT NULL,
      tutor_id TEXT NOT NULL,
      comentarios TEXT,
      aspectos_logrados TEXT,
      aspectos_a_mejorar TEXT,
      sugerencias TEXT,
      comentario_estudiante TEXT,
      fecha_revision TEXT NOT NULL,
      fecha_comentario_estudiante TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS evaluaciones_reflexivas (
      id TEXT PRIMARY KEY,
      intervencion_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      tutor_id TEXT NOT NULL,
      nivel_general TEXT NOT NULL,
      dimensiones_json TEXT NOT NULL,
      fortalezas TEXT,
      areas_mejora TEXT,
      metas_proxima_clase TEXT,
      fecha TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS configuraciones (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );`
  ];

  for (const sql of schemaStatements) {
    try {
      await client.execute(sql);
    } catch (e) {
      console.warn('[CloudSync] Aviso al crear esquema en Turso:', e.message);
    }
  }
}

/**
 * Sincronización inicial en el arranque del servidor:
 * 1. Asegura esquema en Turso
 * 2. Descarga a local cualquier registro de Turso que no esté en local o sea más reciente
 * 3. Sube a Turso cualquier registro local que falte en Turso
 */
export async function initCloudSync(localDb) {
  const client = getCloudClient();
  if (!client) {
    console.log('[CloudSync] Modo SQLite Local activo. (Define TURSO_DATABASE_URL y TURSO_AUTH_TOKEN para persistencia externa)');
    return;
  }

  console.log('[CloudSync] Conectando con base de datos en la nube (Turso)...');
  try {
    await ensureCloudSchema(client);

    // 1. Sincronizar usuarios
    const cloudUsers = await client.execute('SELECT * FROM users');
    const localUsers = localDb.prepare('SELECT id FROM users').all();
    const localUserIds = new Set(localUsers.map(u => u.id));

    // Descargar usuarios faltantes a local
    for (const row of cloudUsers.rows) {
      if (!localUserIds.has(row.id)) {
        localDb.prepare(`
          INSERT OR REPLACE INTO users (id, email, password_hash, salt, name, role, institucion, rut, curso, seccion, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(row.id, row.email, row.password_hash, row.salt, row.name, row.role, row.institucion, row.rut, row.curso, row.seccion, row.created_at);
      }
    }

    // Subir usuarios locales a Turso
    const allLocalUsers = localDb.prepare('SELECT * FROM users').all();
    const cloudUserIds = new Set(cloudUsers.rows.map(r => r.id));
    for (const u of allLocalUsers) {
      if (!cloudUserIds.has(u.id)) {
        await client.execute({
          sql: `INSERT OR REPLACE INTO users (id, email, password_hash, salt, name, role, institucion, rut, curso, seccion, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [u.id, u.email, u.password_hash, u.salt, u.name, u.role, u.institucion, u.rut, u.curso, u.seccion, u.created_at]
        });
      }
    }

    // 2. Sincronizar intervenciones
    const cloudInts = await client.execute('SELECT * FROM intervenciones');
    const localInts = localDb.prepare('SELECT id, actualizado_at FROM intervenciones').all();
    const localIntMap = new Map(localInts.map(i => [i.id, i.actualizado_at]));

    // Descargar de Turso a local si falta o es más reciente
    for (const r of cloudInts.rows) {
      const localAct = localIntMap.get(r.id);
      if (!localAct || (r.actualizado_at && r.actualizado_at > localAct)) {
        localDb.prepare(`
          INSERT OR REPLACE INTO intervenciones (
            id, user_id, fecha, curso, contenido, proposito, contexto, planificacion, tipo_registro,
            audio_path, audio_filename, audio_mimetype, audio_size, audio_duration, n_lineas, creado_at, actualizado_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          r.id, r.user_id, r.fecha, r.curso, r.contenido, r.proposito, r.contexto, r.planificacion,
          r.tipo_registro, r.audio_path, r.audio_filename, r.audio_mimetype, r.audio_size || 0,
          r.audio_duration || 0, r.n_lineas || 0, r.creado_at, r.actualizado_at
        );
      }
    }

    // Subir de local a Turso si falta
    const cloudIntIds = new Set(cloudInts.rows.map(r => r.id));
    const allLocalInts = localDb.prepare('SELECT * FROM intervenciones').all();
    for (const inv of allLocalInts) {
      if (!cloudIntIds.has(inv.id)) {
        await client.execute({
          sql: `INSERT OR REPLACE INTO intervenciones (
                  id, user_id, fecha, curso, contenido, proposito, contexto, planificacion, tipo_registro,
                  audio_path, audio_filename, audio_mimetype, audio_size, audio_duration, n_lineas, creado_at, actualizado_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            inv.id, inv.user_id, inv.fecha, inv.curso, inv.contenido, inv.proposito, inv.contexto, inv.planificacion,
            inv.tipo_registro, inv.audio_path, inv.audio_filename, inv.audio_mimetype, inv.audio_size || 0,
            inv.audio_duration || 0, inv.n_lineas || 0, inv.creado_at, inv.actualizado_at
          ]
        });
      }
    }

    // 3. Sincronizar transcripciones
    const cloudTrans = await client.execute('SELECT * FROM transcripciones');
    for (const t of cloudTrans.rows) {
      localDb.prepare('INSERT OR REPLACE INTO transcripciones (intervencion_id, lineas_json) VALUES (?, ?)').run(t.intervencion_id, t.lineas_json);
    }
    const allLocalTrans = localDb.prepare('SELECT * FROM transcripciones').all();
    const cloudTransIds = new Set(cloudTrans.rows.map(r => r.intervencion_id));
    for (const lt of allLocalTrans) {
      if (!cloudTransIds.has(lt.intervencion_id)) {
        await client.execute({
          sql: 'INSERT OR REPLACE INTO transcripciones (intervencion_id, lineas_json) VALUES (?, ?)',
          args: [lt.intervencion_id, lt.lineas_json]
        });
      }
    }

    // 4. Sincronizar análisis
    const cloudAnalisis = await client.execute('SELECT * FROM analisis');
    for (const a of cloudAnalisis.rows) {
      localDb.prepare(`
        INSERT OR REPLACE INTO analisis (intervencion_id, fecha, con_reflexion, calidad, sintesis, episodios_json, evidencias_json, competencias_json, creado_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(a.intervencion_id, a.fecha, a.con_reflexion, a.calidad, a.sintesis, a.episodios_json, a.evidencias_json, a.competencias_json, a.creado_at);
    }
    const allLocalAnalisis = localDb.prepare('SELECT * FROM analisis').all();
    const cloudAnalisisIds = new Set(cloudAnalisis.rows.map(r => r.intervencion_id));
    for (const la of allLocalAnalisis) {
      if (!cloudAnalisisIds.has(la.intervencion_id)) {
        await client.execute({
          sql: `INSERT OR REPLACE INTO analisis (intervencion_id, fecha, con_reflexion, calidad, sintesis, episodios_json, evidencias_json, competencias_json, creado_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [la.intervencion_id, la.fecha, la.con_reflexion, la.calidad, la.sintesis, la.episodios_json, la.evidencias_json, la.competencias_json, la.creado_at]
        });
      }
    }

    // 5. Sincronizar reflexiones
    const cloudReflex = await client.execute('SELECT * FROM reflexiones');
    for (const ref of cloudReflex.rows) {
      localDb.prepare(`
        INSERT OR REPLACE INTO reflexiones (intervencion_id, turnos_json, paso_actual, borrador_json, aprobado, fecha_aprob, creado_at, actualizado_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(ref.intervencion_id, ref.turnos_json, ref.paso_actual, ref.borrador_json, ref.aprobado, ref.fecha_aprob, ref.creado_at, ref.actualizado_at);
    }
    const allLocalReflex = localDb.prepare('SELECT * FROM reflexiones').all();
    const cloudReflexIds = new Set(cloudReflex.rows.map(r => r.intervencion_id));
    for (const lr of allLocalReflex) {
      if (!cloudReflexIds.has(lr.intervencion_id)) {
        await client.execute({
          sql: `INSERT OR REPLACE INTO reflexiones (intervencion_id, turnos_json, paso_actual, borrador_json, aprobado, fecha_aprob, creado_at, actualizado_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [lr.intervencion_id, lr.turnos_json, lr.paso_actual, lr.borrador_json, lr.aprobado, lr.fecha_aprob, lr.creado_at, lr.actualizado_at]
        });
      }
    }

    // 6. Sincronizar evaluaciones reflexivas
    const cloudEvals = await client.execute('SELECT * FROM evaluaciones_reflexivas');
    for (const ev of cloudEvals.rows) {
      localDb.prepare(`
        INSERT OR REPLACE INTO evaluaciones_reflexivas (id, intervencion_id, user_id, tutor_id, nivel_general, dimensiones_json, fortalezas, areas_mejora, metas_proxima_clase, fecha)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(ev.id, ev.intervencion_id, ev.user_id, ev.tutor_id, ev.nivel_general, ev.dimensiones_json, ev.fortalezas, ev.areas_mejora, ev.metas_proxima_clase, ev.fecha);
    }
    const allLocalEvals = localDb.prepare('SELECT * FROM evaluaciones_reflexivas').all();
    const cloudEvalIds = new Set(cloudEvals.rows.map(r => r.id));
    for (const le of allLocalEvals) {
      if (!cloudEvalIds.has(le.id)) {
        await client.execute({
          sql: `INSERT OR REPLACE INTO evaluaciones_reflexivas (id, intervencion_id, user_id, tutor_id, nivel_general, dimensiones_json, fortalezas, areas_mejora, metas_proxima_clase, fecha)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [le.id, le.intervencion_id, le.user_id, le.tutor_id, le.nivel_general, le.dimensiones_json, le.fortalezas, le.areas_mejora, le.metas_proxima_clase, le.fecha]
        });
      }
    }

    console.log(`[CloudSync] ✓ Sincronización exitosa con Turso: ${cloudInts.rows.length} en nube, ${allLocalInts.length} en local.`);
  } catch (err) {
    console.error('[CloudSync] Error durante sincronización con Turso:', err);
  }
}

/**
 * Guarda una mutación directamente en Turso de forma asíncrona
 */
export async function pushCloudQuery(sql, args = []) {
  const client = getCloudClient();
  if (!client) return;

  try {
    await client.execute({ sql, args });
  } catch (err) {
    console.error('[CloudSync] Error enviando mutación a Turso:', err.message, { sql });
  }
}
