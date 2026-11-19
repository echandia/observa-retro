import fs from 'fs';
import db from '../server/db.js';
import {
  segmentarEpisodios,
  extraerEvidencias,
  valorarCompetencias,
  valorarRubricaSecuencias
} from '../server/pedagogyEngine.js';

function parseSegundos(str) {
  if (!str) return null;
  const parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(str) || null;
}

function parseFile1(text) {
  const lines = text.split('\n');
  const result = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!l || l.startsWith('Transcripción') || l.startsWith('Duración:') || l.startsWith('Notas:') || l.startsWith('Las líneas') || l.startsWith('El modelo') || l.startsWith('El tramo') || l.startsWith('Revisar contra') || l.startsWith('---')) continue;
    const m = l.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*(.*)$/);
    if (m) {
      const t = parseSegundos(m[1]);
      let x = m[2].trim();
      let h = 'Intervención de aula';
      if (/^([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ ._\/()\-]+):\s*(.*)$/.test(x)) {
        const sm = x.match(/^([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ ._\/()\-]+):\s*(.*)$/);
        h = sm[1].trim();
        x = sm[2].trim();
      } else if (/profesor/i.test(x)) {
        h = 'Profesor';
      }
      result.push({ t, h, x });
    }
  }
  return result;
}

function parseFile2(text) {
  const lines = text.split('\n');
  const result = [];
  let currentTime = 0;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    const m = l.match(/^([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ ._\/()\-]+):\s*(.*)$/);
    if (m) {
      const h = m[1].trim();
      const x = m[2].trim();
      result.push({ t: currentTime, h, x });
      currentTime += 15;
    } else {
      if (result.length) {
        result[result.length - 1].x += ' ' + l;
      }
    }
  }
  return result;
}

const p1 = '/Users/eugeniochandia/Library/CloudStorage/Dropbox/2026/UCSC/Segundo Semestre/Practica III/Planificaciones/Transcripciones/Transcripcion_Clase_27-10_Daniel.txt';
const p2 = '/Users/eugeniochandia/Library/CloudStorage/Dropbox/2026/UCSC/Segundo Semestre/Practica III/Planificaciones/Transcripciones/transcripci_n_clase_10_11_2026_Daniel.txt';

const lines1 = parseFile1(fs.readFileSync(p1, 'utf8'));
const lines2 = parseFile2(fs.readFileSync(p2, 'utf8'));

const danielUser = db.prepare('SELECT id, name FROM users WHERE email LIKE ? OR name LIKE ?').get('%djara%', '%Daniel%');
if (!danielUser) {
  console.error('No se encontró al usuario Daniel en la base de datos');
  process.exit(1);
}
console.log('Asignando a estudiante:', danielUser.name, 'ID:', danielUser.id);

const clases = [
  {
    id: 'int-daniel-2710',
    fecha: '2026-10-27',
    curso: '8° básico',
    contenido: 'Introducción al Concepto de Función: La Máquina Matemática',
    proposito: 'Comprender el concepto de función como una relación de entrada-salida f(x), explorando regularidades numéricas mediante la analogía de la máquina matemática.',
    contexto: 'Estudiantes de 8° básico con profesor titular Óscar y profesor en formación Daniel Jara. Primera aproximación formal al concepto de función.',
    planificacion: `PLANIFICACIÓN DIDÁCTICA · CLASE 1 (27-10-2026)
Asignatura: Matemática · 8° Básico
Profesor en formación: Daniel Jara Urrea · Profesor guía: Óscar

Objetivo de Aprendizaje (OA):
Comprender el concepto de función matemática a partir de situaciones cotidianas y tablas de valores, identificando variables dependientes e independientes y reglas de asignación f(x).

Habilidades matemáticas promovidas:
- Representar relaciones numéricas mediante analogías concretas (la máquina matemática).
- Argumentar y comunicar conjeturas sobre el valor de salida correspondiente a una entrada.
- Modelar regularidades algebraicas básicas.

Secuencia Didáctica:
1. Inicio (15 min): Encuadre de la unidad con el profesor titular. Presentación del profesor invitado Daniel. Planteamiento del problema inicial: la analogía de la máquina matemática (entradas, procesamiento interno y salidas).
2. Desarrollo (50 min): Experimentación interactiva con diferentes reglas numéricas ("lo multiplicas por 2", sumas y combinaciones). Participación de los escolares proponiendo valores de entrada y anticipando la salida. Registro en la pizarra y formalización de variables.
3. Cierre (15 min): Síntesis de los componentes clave de una función: conjunto de entrada/partida, regla de transformación y conjunto de salida/llegada.`,
    audio_path: 'audio-int-daniel-2710.m4a',
    audio_filename: 'Clase 27-10.m4a',
    audio_mimetype: 'audio/mp4',
    audio_size: 66868085,
    lineas: lines1
  },
  {
    id: 'int-daniel-1011',
    fecha: '2026-11-10',
    curso: '8° básico',
    contenido: 'Función lineal y función afín: análisis de parámetros',
    proposito: 'Diferenciar entre función lineal y función afín a partir de su expresión algebraica y la interpretación del término constante y la pendiente.',
    contexto: 'Estudiantes de 8° básico, segunda clase con Daniel Jara. Retoman conocimientos previos sobre conjunto de partida/llegada y analizan f(x)=2x vs f(x)=2x+1.',
    planificacion: `PLANIFICACIÓN DIDÁCTICA · CLASE 2 (10-11-2026)
Asignatura: Matemática · 8° Básico
Profesor en formación: Daniel Jara Urrea · Profesor guía: Óscar

Objetivo de Aprendizaje (OA):
Caracterizar la función lineal f(x) = mx y la función afín f(x) = mx + n, analizando el rol del coeficiente de posición n y la pendiente m, reconociendo la función lineal como caso particular de la función afín.

Habilidades matemáticas promovidas:
- Comparar y contrastar representaciones algebraicas equivalentes y no equivalentes.
- Formular y verificar conjeturas respecto a los efectos de sumar una constante a una función lineal.
- Comunicar con rigor conceptual los componentes de una relación funcional.

Secuencia Didáctica:
1. Inicio (15 min): Activación de conocimientos previos sobre funciones (conjuntos de partida y llegada). Pregunta socrática: ¿Qué elementos componen una función? Clasificación inicial de expresiones.
2. Desarrollo (50 min): Comparación guiada entre f(x) = 2x y f(x) = 2x + 1, f(x) = 3x. Discusión sobre qué provoca la constante agregada (traslación / intercepto). Desafío cognitivo: ¿Cómo hacer que una función lineal sea una función afín sin alterar su valor? (sumar cero / n=0).
3. Cierre (15 min): Institucionalización de las diferencias entre función lineal y afín. Preguntas de verificación de comprensión.`,
    audio_path: 'audio-int-daniel-1011.m4a',
    audio_filename: 'Clase 10-11-2026.m4a',
    audio_mimetype: 'audio/mp4',
    audio_size: 65617899,
    lineas: lines2
  }
];

for (const c of clases) {
  const episodios = segmentarEpisodios(c.lineas);
  const evidencias = extraerEvidencias(c.lineas, episodios);
  const competencias = valorarCompetencias(evidencias, c.lineas, false);
  const rubrica = valorarRubricaSecuencias(c.lineas, episodios, evidencias, !!c.planificacion, false);

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

  const sintesis = `Análisis pedagógico de la clase sobre "${c.contenido}". Se identificaron ${episodios.length} episodios formativos y ${evidencias.length} evidencias observables vinculadas a las competencias docentes de Práctica III.`;

  db.prepare(`
    INSERT OR REPLACE INTO intervenciones (
      id, user_id, fecha, curso, contenido, proposito, contexto, planificacion, tipo_registro,
      audio_path, audio_filename, audio_mimetype, audio_size, audio_duration, n_lineas, creado_at, actualizado_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    c.id, danielUser.id, c.fecha, c.curso, c.contenido, c.proposito, c.contexto, c.planificacion,
    'Solo audio transcrito', c.audio_path, c.audio_filename, c.audio_mimetype, c.audio_size,
    0, c.lineas.length
  );

  db.prepare(`
    INSERT OR REPLACE INTO transcripciones (intervencion_id, lineas_json)
    VALUES (?, ?)
  `).run(c.id, JSON.stringify(c.lineas));

  db.prepare(`
    INSERT OR REPLACE INTO analisis (
      intervencion_id, fecha, con_reflexion, calidad, sintesis, episodios_json, evidencias_json,
      competencias_json, ra_json, rubrica_json, seguimiento_json, ajustes_json, creado_at
    ) VALUES (?, ?, 0, 'Adecuado', ?, ?, ?, ?, ?, ?, '[]', '[]', datetime('now'))
  `).run(
    c.id, c.fecha, sintesis, JSON.stringify(episodios), JSON.stringify(evidencias),
    JSON.stringify(competencias), JSON.stringify(ra), JSON.stringify(rubrica)
  );

  db.prepare(`
    INSERT OR REPLACE INTO reflexiones (
      intervencion_id, turnos_json, paso_actual, borrador_json, aprobado, fecha_aprob, creado_at, actualizado_at
    ) VALUES (?, '[]', 1, NULL, 0, NULL, datetime('now'), datetime('now'))
  `).run(c.id);

  console.log(`✓ Clase "${c.contenido}" guardada exitosamente (${c.lineas.length} turnos, ${episodios.length} episodios).`);
}

db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
console.log('✓ Checkpoint SQLite completado exitosamente.');
