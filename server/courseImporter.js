import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { scryptSync, randomBytes } from 'node:crypto';
import db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const pythonScript = join(rootDir, 'scripts', 'extract_xlsx.py');

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function toTitleCase(str) {
  if (!str) return '';
  return str.toLowerCase().split(' ').map(w => {
    if (w.length <= 2 && ['de', 'del', 'la', 'los', 'las', 'y', 'en'].includes(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

function formatStudentName(rawName) {
  if (!rawName) return { formatted: '', emailPrefix: '' };
  if (rawName.includes(',')) {
    const parts = rawName.split(',').map(p => p.trim());
    const lastNames = toTitleCase(parts[0]);
    const firstNames = toTitleCase(parts[1] || '');

    // Primer apellido (paterno) y primer nombre
    const paternal = parts[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/)[0] || '';
    const firstName = (parts[1] || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/)[0] || '';
    const emailPrefix = firstName && paternal ? `${firstName[0]}${paternal}` : '';

    return {
      formatted: `${firstNames} ${lastNames}`.trim(),
      emailPrefix
    };
  }
  return { formatted: toTitleCase(rawName), emailPrefix: '' };
}

function cleanRut(rut) {
  if (!rut) return '';
  return rut.toString().replace(/[^0-9kK]/g, '');
}

function generateStudentEmail(emailPrefix, rut) {
  const cRut = cleanRut(rut);
  if (emailPrefix) {
    return `${emailPrefix}@alumnos.ucsc.cl`;
  }
  return `${cRut}@alumnos.ucsc.cl`;
}

export function parseCourseXlsx(filePath) {
  return new Promise((resolve, reject) => {
    execFile('python3', [pythonScript, filePath], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`Error al leer archivo Excel del curso: ${stderr || err.message}`));
      }
      try {
        const data = JSON.parse(stdout);
        resolve(data);
      } catch (e) {
        reject(new Error(`Error parseando JSON de Excel: ${e.message}`));
      }
    });
  });
}

/**
 * Importa un archivo de curso específico a la base de datos
 */
export async function importarListaCurso(filePath) {
  const data = await parseCourseXlsx(filePath);
  const fname = basename(filePath);

  // Detectar código y sección
  let cursoCodigo = 'ED1360C';
  let seccion = 'Sec. 1';

  if (fname.includes('_2_') || (data.course_title && data.course_title.toLowerCase().includes('sec.2'))) {
    seccion = 'Sec. 2';
  } else if (fname.includes('_1_') || (data.course_title && data.course_title.toLowerCase().includes('sec.1'))) {
    seccion = 'Sec. 1';
  }

  const matchCode = (data.course_title || fname).match(/ED\d+[A-Z]?/i);
  if (matchCode) {
    cursoCodigo = matchCode[0].toUpperCase();
  }

  // Asegurar columnas en la base de datos
  try { db.exec("ALTER TABLE users ADD COLUMN rut TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE users ADD COLUMN curso TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE users ADD COLUMN seccion TEXT;"); } catch (_) {}

  const stmtFind = db.prepare('SELECT id, email FROM users WHERE rut = ? OR email = ?');
  const stmtInsert = db.prepare(`
    INSERT INTO users (id, email, password_hash, salt, name, role, institucion, rut, curso, seccion, created_at)
    VALUES (?, ?, ?, ?, ?, 'estudiante', 'UCSC', ?, ?, ?, datetime('now'))
  `);
  const stmtUpdate = db.prepare(`
    UPDATE users SET name = ?, curso = ?, seccion = ?, rut = ?, email = ? WHERE id = ?
  `);

  let creados = 0;
  let actualizados = 0;
  const estudiantesProcesados = [];

  // Registrar también a Eugenio Chandía como profesor responsable si está presente
  if (data.instructor) {
    const profRut = 'prof-echandia';
    const profEmail = 'echandia@ucsc.cl';
    const profExists = db.prepare('SELECT id FROM users WHERE email = ? OR id = ?').get(profEmail, profRut);
    if (!profExists) {
      const { hash, salt } = hashPassword('tutor2026');
      db.prepare(`
        INSERT INTO users (id, email, password_hash, salt, name, role, institucion, rut, curso, seccion, created_at)
        VALUES (?, ?, ?, ?, ?, 'tutor', 'UCSC', 'tutor', ?, 'Docente Responsable', datetime('now'))
      `).run(profRut, profEmail, hash, salt, 'Dr. Eugenio Chandía Muñoz', cursoCodigo);
      console.log('✓ Profesor Dr. Eugenio Chandía Muñoz registrado como Tutor/Docente Responsable.');
    }
  }

  const { hash: defaultHash, salt: defaultSalt } = hashPassword('practica2026');

  for (const st of data.students) {
    const r = cleanRut(st.rut);
    if (!r) continue;

    const { formatted: formattedName, emailPrefix } = formatStudentName(st.name);
    const email = generateStudentEmail(emailPrefix, r);
    const existing = stmtFind.get(r, email);

    if (existing) {
      stmtUpdate.run(formattedName, cursoCodigo, seccion, r, email, existing.id);
      actualizados++;
      estudiantesProcesados.push({ id: existing.id, rut: r, email, name: formattedName, seccion, estado: 'actualizado' });
    } else {
      const id = `est-${r}`;
      stmtInsert.run(id, email, defaultHash, defaultSalt, formattedName, r, cursoCodigo, seccion);
      creados++;
      estudiantesProcesados.push({ id, rut: r, email, name: formattedName, seccion, estado: 'creado' });
    }
  }

  return {
    ok: true,
    curso: cursoCodigo,
    seccion,
    titulo: data.course_title,
    profesor: data.instructor,
    total: data.students.length,
    creados,
    actualizados,
    estudiantes: estudiantesProcesados
  };
}

/**
 * Escanea la carpeta 'Listas de cursos/' e importa automáticamente todos los archivos Excel disponibles
 */
export async function sincronizarListasDeCursos() {
  const dir = join(rootDir, 'Listas de cursos');
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'));
  const resultados = [];

  for (const file of files) {
    const fullPath = join(dir, file);
    try {
      console.log(`[Importador] Sincronizando lista de curso: ${file}...`);
      const res = await importarListaCurso(fullPath);
      resultados.push({ archivo: file, ...res });
      console.log(`[Importador] ${file}: ${res.creados} nuevos, ${res.actualizados} actualizados.`);
    } catch (e) {
      console.warn(`[Importador] Error con ${file}:`, e.message);
      resultados.push({ archivo: file, ok: false, error: e.message });
    }
  }

  return resultados;
}
