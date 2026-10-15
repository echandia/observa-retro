import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scryptSync, randomBytes } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = process.env.DATABASE_PATH || join(__dirname, '..', 'observa_retro.db');

const db = new DatabaseSync(dbPath);

// Activar WAL para alto rendimiento y lecturas concurrentes
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Esquema de tablas
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL, -- 'estudiante', 'tutor', 'admin'
  institucion TEXT DEFAULT 'UCSC',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS intervenciones (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  fecha TEXT NOT NULL,
  curso TEXT,
  contenido TEXT NOT NULL,
  proposito TEXT,
  contexto TEXT,
  planificacion TEXT,
  tipo_registro TEXT,
  audio_path TEXT,
  audio_filename TEXT,
  audio_mimetype TEXT,
  audio_size INTEGER DEFAULT 0,
  audio_duration REAL DEFAULT 0,
  n_lineas INTEGER DEFAULT 0,
  creado_at TEXT NOT NULL,
  actualizado_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transcripciones (
  intervencion_id TEXT PRIMARY KEY,
  lineas_json TEXT NOT NULL,
  FOREIGN KEY (intervencion_id) REFERENCES intervenciones(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS analisis (
  intervencion_id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  con_reflexion INTEGER DEFAULT 0,
  calidad TEXT,
  sintesis TEXT,
  episodios_json TEXT,
  evidencias_json TEXT,
  competencias_json TEXT,
  ra_json TEXT,
  rubrica_json TEXT,
  seguimiento_json TEXT,
  ajustes_json TEXT,
  creado_at TEXT NOT NULL,
  FOREIGN KEY (intervencion_id) REFERENCES intervenciones(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reflexiones (
  intervencion_id TEXT PRIMARY KEY,
  turnos_json TEXT NOT NULL,
  paso_actual INTEGER DEFAULT 1,
  borrador_json TEXT,
  aprobado INTEGER DEFAULT 0,
  fecha_aprob TEXT,
  creado_at TEXT NOT NULL,
  actualizado_at TEXT NOT NULL,
  FOREIGN KEY (intervencion_id) REFERENCES intervenciones(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS consultas (
  intervencion_id TEXT PRIMARY KEY,
  turnos_json TEXT NOT NULL,
  creado_at TEXT NOT NULL,
  actualizado_at TEXT NOT NULL,
  FOREIGN KEY (intervencion_id) REFERENCES intervenciones(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS revisiones (
  intervencion_id TEXT PRIMARY KEY,
  tutor_id TEXT,
  comp_revision_json TEXT,
  rub_revision_json TEXT,
  retro_estudiante TEXT,
  retro_tutor TEXT,
  actualizado_at TEXT NOT NULL,
  FOREIGN KEY (intervencion_id) REFERENCES intervenciones(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evaluaciones_reflexivas (
  id TEXT PRIMARY KEY,
  intervencion_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tutor_id TEXT NOT NULL,
  nivel_general TEXT NOT NULL,
  dimensiones_json TEXT NOT NULL,
  fortalezas TEXT,
  areas_mejora TEXT,
  metas_proxima_clase TEXT,
  fecha TEXT NOT NULL,
  FOREIGN KEY (intervencion_id) REFERENCES intervenciones(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (tutor_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS configuraciones (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`);

function hash(pwd, salt) {
  return scryptSync(pwd, salt, 64).toString('hex');
}

// Semilla de usuarios por defecto
const userCheck = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (userCheck.count === 0) {
  const seedUsers = [
    {
      id: 'usr-estudiante-1',
      email: 'estudiante@ucsc.cl',
      pass: 'practica2026',
      name: 'María Jesús Valenzuela (Practicante)',
      role: 'estudiante'
    },
    {
      id: 'usr-tutor-1',
      email: 'tutor@ucsc.cl',
      pass: 'tutor2026',
      name: 'Dr. Carlos Henríquez (Profesor Formador)',
      role: 'tutor'
    },
    {
      id: 'usr-admin-1',
      email: 'admin@ucsc.cl',
      pass: 'admin2026',
      name: 'Coordinación Práctica III (UCSC/CIAE)',
      role: 'admin'
    }
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, password_hash, salt, name, role, institucion, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'UCSC', datetime('now'))
  `);

  for (const u of seedUsers) {
    const salt = randomBytes(16).toString('hex');
    const pwdHash = hash(u.pass, salt);
    insertUser.run(u.id, u.email, pwdHash, salt, u.name, u.role);
  }

  // Semilla de una intervención inicial con análisis, diálogo reflexivo y evaluación del formador
  const iid = 'int-demo-taxi-1';
  const uid = 'usr-estudiante-1';
  const tid = 'usr-tutor-1';

  db.prepare(`
    INSERT INTO intervenciones (
      id, user_id, fecha, curso, contenido, proposito, contexto, planificacion, tipo_registro,
      audio_path, audio_filename, audio_mimetype, n_lineas, creado_at, actualizado_at
    ) VALUES (
      ?, ?, '2026-09-18', '1° medio B', 'Función lineal y afín: tarifa de taxi',
      'Modelar una situación con valor fijo mediante una función matemática y distinguir entre función lineal y función afín.',
      'En la sesión previa varios estudiantes confundieron el valor fijo con la tasa de variación constante.',
      'Objetivo: Modelar situaciones de la vida cotidiana usando funciones lineales y afines. Tarea: Problema de tarifa de taxi (bajada de bandera $400, $150 cada 200m).',
      'Solo audio transcrito', NULL, NULL, 'audio/mpeg', 32, datetime('now'), datetime('now')
    )
  `).run(iid, uid);

  // Líneas de transcripción del ejemplo
  const lineasDemo = [
    { t: 12, h: "Practicante", x: "Buenos días. Hoy vamos a trabajar con una situación de taxis. El objetivo es que podamos modelar una situación con una función y decidir si es lineal o afín." },
    { t: 40, h: "Practicante", x: "La semana pasada varios me dijeron que se confundían cuando había un valor fijo, así que partimos con un caso que lo tiene. Un taxi cobra 400 pesos por bajar la bandera y 150 pesos por cada 200 metros. ¿Cuánto se paga por 1 kilómetro?" },
    { t: 95, h: "E1", x: "750." },
    { t: 98, h: "Practicante", x: "¿Cómo lo obtuviste?" },
    { t: 102, h: "E1", x: "Porque un kilómetro son cinco de 200, cinco por 150 es 750." },
    { t: 115, h: "Practicante", x: "¿Alguien lo hizo distinto o llegó a otro valor?" },
    { t: 123, h: "E2", x: "Yo sumé la bandera, me dio 1150." },
    { t: 130, h: "Practicante", x: "Ya, 1150. ¿Por qué creen que E1 y E2 tienen resultados distintos? Conversen con su compañero un minuto." },
    { t: 200, h: "E3", x: "Es que el E1 no contó lo que se paga al subirse." },
    { t: 208, h: "Practicante", x: "E1, ¿qué opinas de lo que dice tu compañera?" },
    { t: 214, h: "E1", x: "Ah, sí, se me fue el fijo." },
    { t: 220, h: "Practicante", x: "Bien. Entonces el valor fijo se paga aunque no avancemos nada. Ahora en parejas completen la tabla para 2, 3 y 5 kilómetros y escriban una expresión para x kilómetros." },
    { t: 555, h: "Practicante", x: "A ver, ¿qué expresión escribieron?" },
    { t: 562, h: "E4", x: "Nosotros pusimos 750x más 400." },
    { t: 567, h: "Practicante", x: "Correcto, 750x más 400. Anótenlo." },
    { t: 575, h: "E5", x: "Profe, nosotros hicimos otra cosa, fuimos sumando 750 a la tabla cada vez, sin fórmula." },
    { t: 584, h: "Practicante", x: "Ya, también sirve. Sigamos. ¿Esta función es lineal o afín?" },
    { t: 592, h: "Practicante", x: "¿Qué pasa cuando x es cero? ¿Pasa por el origen? ¿Cuánto vale f de cero?" },
    { t: 601, h: "Practicante", x: "Vale 400, entonces no pasa por el origen, así que es afín." },
    { t: 615, h: "E2", x: "¿Y si no cobraran la bandera?" },
    { t: 620, h: "Practicante", x: "Buena pregunta. ¿Qué cambiaría en la expresión si no hay bandera?" },
    { t: 631, h: "E2", x: "Quedaría 750x no más." },
    { t: 635, h: "Practicante", x: "¿Y esa sería lineal o afín? ¿Por qué?" },
    { t: 642, h: "E6", x: "Lineal, porque con cero kilómetros se paga cero." },
    { t: 650, h: "Practicante", x: "Exacto. Ahora grafiquen las dos en el mismo plano en su cuaderno." },
    { t: 1000, h: "Practicante", x: "Miren el gráfico que hizo E3 en la pizarra. ¿En qué se parecen y en qué se diferencian las dos rectas?" },
    { t: 1015, h: "E3", x: "Son paralelas, una parte más arriba." },
    { t: 1022, h: "Practicante", x: "¿Qué de la expresión hace que sean paralelas?" },
    { t: 1030, h: "E4", x: "Que las dos tienen 750." },
    { t: 1035, h: "Practicante", x: "La pendiente, muy bien. Y el 400 es lo que la desplaza." },
    { t: 1060, h: "Practicante", x: "Para cerrar: una función afín tiene la forma mx más n, con n distinto de cero, y la lineal es cuando n es cero. Creo que todos comprendieron. ¿Alguna duda?" },
    { t: 1078, h: "Practicante", x: "Bueno, nos vemos el jueves." }
  ];

  db.prepare('INSERT INTO transcripciones (intervencion_id, lineas_json) VALUES (?, ?)').run(iid, JSON.stringify(lineasDemo));

  // Análisis pre-procesado
  const episodiosDemo = [
    { ini: 1, fin: 5, tipo: "presentacion_tarea", titulo: "Presentación y problema del taxi", resumen: "Encuadre de la clase y consigna sobre el cobro por kilómetro." },
    { ini: 6, fin: 12, tipo: "discusion", titulo: "Comparación de respuestas y fijación del cargo fijo", resumen: "Debate entre E1 y E2 sobre el cobro de la bajada de bandera." },
    { ini: 13, fin: 19, tipo: "error", titulo: "Tratamiento de la expresión algebraica y estrategia recursiva", resumen: "Formulación de la función y propuesta recursiva de E5." },
    { ini: 20, fin: 25, tipo: "explicacion", titulo: "Distinción entre función lineal y afín", resumen: "Comparación teórica sobre el punto de partida (f(0))." },
    { ini: 26, fin: 30, tipo: "trabajo_estudiantes", titulo: "Representación gráfica y paralelismo", resumen: "Análisis del gráfico en pizarra y significado de la pendiente." },
    { ini: 31, fin: 32, tipo: "cierre", titulo: "Institucionalización y cierre de clase", resumen: "Definición formal de f(x)=mx+n y cierre de sesión." }
  ];

  const evidenciasDemo = [
    { id: "e1", ind: "CE5.3", ini: 6, fin: 8, tipo: "apoya", fuente: "registro", observado: "El practicante pregunta '¿Por qué creen que E1 y E2 tienen resultados distintos?' y pide conversar en parejas.", interpretacion: "Promueve la mediación entre pares y el análisis de procedimientos divergentes." },
    { id: "e2", ind: "CE5.5", ini: 9, fin: 11, tipo: "apoya", fuente: "registro", observado: "Pide a E1 opinar sobre la intervención de E3 ('¿qué opinas de lo que dice tu compañera?') permitiendo que él mismo reconozca el error.", interpretacion: "Uso formativo del error sin sanción directa." },
    { id: "e3", ind: "CE5.4", ini: 26, fin: 30, tipo: "apoya", fuente: "registro", observado: "Conecta la expresión algebraica f(x)=750x+400 con la inclinación geométrica de las rectas paralelas en el plano.", interpretacion: "Articulación entre representaciones gráfica y analítica." },
    { id: "e4", ind: "CE3.4", ini: 15, fin: 17, tipo: "discrepa", fuente: "registro", observado: "En 09:35 E5 propone una estrategia recursiva sumando 750 a la tabla, pero el practicante valida y pasa inmediatamente a la siguiente pregunta.", interpretacion: "Oportunidad de discusión perdida: no se comparó la estrategia recursiva con la expresión funcional general." },
    { id: "e5", ind: "CE3.4", ini: 31, fin: 32, tipo: "discrepa", fuente: "registro", observado: "En el minuto 17:40 el practicante afirma 'Creo que todos comprendieron' y cierra sin levantar evidencia del curso.", interpretacion: "Cierre presuntivo sin evaluación formativa explícita de la comprensión." }
  ];

  const competenciasDemo = [
    { id: "CE5", categoria: "2", fuerza: "alta", justificacion: "Evidencia consistente de formulación de tareas contextualizadas, preguntas de mediación y conexiones representacionales.", limites: "Falta profundizar en la comparación de procedimientos estudiantiles no previstos.", pregunta: "¿Cómo podrías haber aprovechado la propuesta de E5 para discutir la diferencia entre crecimiento recursivo y funcional?", meta: "En la próxima clase, solicitar explícitamente la comparación entre dos procedimientos estudiantiles." },
    { id: "CE3", categoria: "2", fuerza: "alta", justificacion: "El estudiante demuestra capacidad de identificar episodios con minutos del audio y reconocer evidencias discrepantes.", limites: "Requiere contrastar con evidencias escritas de los cuadernos escolares.", pregunta: "¿Qué evidencia de los cuadernos confirmaría que todos comprendieron la pendiente?", meta: "Recoger tarjetas de salida para verificar comprensión individual." },
    { id: "CG1", categoria: "2", fuerza: "media", justificacion: "Ajusta la actividad recuperando la confusión de la sesión anterior con el valor fijo.", limites: "Falta evidencia sobre cómo se apoyó a estudiantes con mayor rezago.", pregunta: "¿Qué apoyo alternativo previste para quienes no lograron formular la expresión algebraica?", meta: "Diseñar apoyos escalonados para la fase de ejercitación autónoma." },
    { id: "CE4", categoria: "2", fuerza: "alta", justificacion: "Mantiene corrección matemática precisa en la distinción entre f(x)=mx y f(x)=mx+n.", limites: "Ninguno observable en este registro.", pregunta: "¿Cómo fundamentarías formalmente que dos rectas con igual pendiente no se intersectan?", meta: "" },
    { id: "CE1", categoria: "1", fuerza: "media", justificacion: "Permite la participación de varios alumnos (E1 a E6), pero predomina la interacción frontal con el docente.", limites: "No se observa monitoreo diferenciado en los bancos.", pregunta: "¿Qué estrategias utilizarás para hacer visibles a estudiantes que no intervienen espontáneamente?", meta: "" },
    { id: "CE2", categoria: "1", fuerza: "media", justificacion: "Formula preguntas diagnósticas en la interacción, pero el cierre de la clase no recogió evidencia de logro.", limites: "Ausencia de instrumento formal o ticket de salida.", pregunta: "¿Qué instrumento breve te permitiría saber cuántos estudiantes distinguen ambas funciones?", meta: "Incorporar una pregunta de comprobación individual escrita al final de la sesión." },
    { id: "CG2", categoria: "2", fuerza: "alta", justificacion: "Consignas claras, lenguaje matemático riguroso y escucha activa de los argumentos escolares.", limites: "En un momento responde su propia pregunta sobre el valor de f(0).", pregunta: "¿Qué efecto tuvo responder tú mismo el valor de f(0) en vez de esperar la respuesta del curso?", meta: "" }
  ];

  const raDemo = [
    { id: "RA1.a", estado: "reunida", evidencias: ["e1"], falta: "" },
    { id: "RA1.b", estado: "reunida", evidencias: ["e2"], falta: "" },
    { id: "RA2.a", estado: "reunida", evidencias: ["e3"], falta: "" },
    { id: "RA2.b", estado: "reunida", evidencias: ["e1"], falta: "" },
    { id: "RA2.c", estado: "parcial", evidencias: ["e4"], falta: "Comparar estrategias alternativas en el debate." },
    { id: "RA3.a", estado: "parcial", evidencias: ["e5"], falta: "Levantar evidencia individual en el cierre." },
    { id: "RA3.b", estado: "reunida", evidencias: ["e4", "e5"], falta: "" },
    { id: "RA3.c", estado: "reunida", evidencias: ["e4"], falta: "" }
  ];

  const rubricaDemo = {
    fecha: "2026-09-18T16:00:00Z",
    conReflexion: true,
    criterios: [
      { id: "1.1", nivel: "Competente", evidencias: [{ fuente: "planificacion", cita: "Modelar situaciones cotidianas usando funciones afines", nota: "Alineación clara con currículum." }], justificacion: "Objetivos claros y coherentes.", paso: "Explicitar habilidades de argumentación.", estandar: "E3" },
      { id: "2.3", nivel: "Competente", evidencias: [{ fuente: "registro", ini: 6, fin: 8, nota: "¿Por qué creen que tienen resultados distintos?" }], justificacion: "Formula preguntas que abren debate matemático.", paso: "Esperar más tiempo antes de validar respuestas.", estandar: "E7" },
      { id: "2.6", nivel: "Destacado", evidencias: [{ fuente: "registro", ini: 20, fin: 25, nota: "Distinción formal f(0)=400 vs f(0)=0" }], justificacion: "Rigurosa idoneidad epistémica y conceptual.", paso: "Mantener la precisión observada.", estandar: "DA" },
      { id: "4.3", nivel: "Competente", evidencias: [{ fuente: "registro", ini: 26, fin: 30, nota: "Aprovechamiento del gráfico en pizarra" }], justificacion: "Ajusta la explicación conectando pendiente con paralelismo.", paso: "Promover que los estudiantes lo conjeturen.", estandar: "E11" }
    ],
    alerta: "",
    ajustes: []
  };

  db.prepare(`
    INSERT INTO analisis (
      intervencion_id, fecha, con_reflexion, calidad, sintesis, episodios_json, evidencias_json,
      competencias_json, ra_json, rubrica_json, seguimiento_json, ajustes_json, creado_at
    ) VALUES (?, '2026-09-18T16:00:00Z', 1, 'Registro sonoro claro con 32 turnos y marcas temporales precisas.',
      'Clase estructurada sobre modelación de funciones lineales y afines con situación de tarifa de taxi. Destaca la mediación en torno al error del cargo fijo y la conexión con el gráfico de rectas paralelas.',
      ?, ?, ?, ?, ?, '[]', '[]', datetime('now')
    )
  `).run(
    iid,
    JSON.stringify(episodiosDemo),
    JSON.stringify(evidenciasDemo),
    JSON.stringify(competenciasDemo),
    JSON.stringify(raDemo),
    JSON.stringify(rubricaDemo)
  );

  // Reflexión del estudiante
  const turnosReflexionDemo = [
    { r: "a", c: "Hola María Jesús. Comencemos la reflexión sobre tu clase de Práctica Pedagógica III.\n\nPara partir (Paso 1: Reconstrucción), cuéntame: ¿Cuál era el propósito matemático central que esperabas promover y en qué momento específico de la grabación te gustaría focalizar nuestro análisis?", paso: 1 },
    { r: "u", c: "Hola. El propósito era que los estudiantes comprendieran la diferencia entre función lineal y afín a partir de una situación cotidiana con valor fijo. Me gustaría focalizar en el minuto 01:30 a 03:30, cuando discutimos por qué E1 obtuvo 750 y E2 obtuvo 1150." },
    { r: "a", c: "Muy buen momento para analizar (Paso 2: Descripción).\n\nEn ese episodio (01:30 a 03:30): ¿Qué hiciste tú exactamente para mediar esa discrepancia y qué dijeron los estudiantes?", paso: 2 },
    { r: "u", c: "En vez de decirles quién estaba bien, pregunté al curso por qué creían que daban números distintos y les di un minuto para discutir con su compañero de banco. Después le pregunté a E3 y ella explicó que E1 no había considerado la bajada de bandera. Ahí E1 reconoció que se le había olvidado el valor fijo." },
    { r: "a", c: "Excelente detalle descriptivo (Paso 3: Interpretación del pensamiento escolar).\n\nMirando esa respuesta de E1: ¿Por qué crees que calculó 5 por 150 y olvidó el 400? ¿Qué revela sobre su razonamiento matemático previo?", paso: 3 },
    { r: "u", c: "Creo que venían muy acostumbrados a la proporcionalidad directa de años anteriores donde multiplicar basta. Al enfrentarse a una relación afín, el obstáculo fue integrar una condición aditiva inicial independiente del avance del taxi." },
    { r: "a", c: "Una interpretación didáctica muy acertada (Paso 4: Fundamentación en evidencia observable).\n\n¿Qué evidencias concretas del registro (marcas de tiempo o citas) sostienen esta interpretación?", paso: 4 },
    { r: "u", c: "En el minuto 01:42 E1 dice 'un kilómetro son cinco de 200, cinco por 150 es 750', lo que demuestra que aplicó proporcionalidad estricta. Y en 03:34 él mismo dice 'Ah, sí, se me fue el fijo', confirmando que comprendió la diferencia." },
    { r: "a", c: "Rigor en las citas (Paso 5: Contraste y evidencias discrepantes).\n\n¿Qué momentos de la clase muestran límites o situaciones donde se dio por sabida la comprensión sin suficiente verificación?", paso: 5 },
    { r: "u", c: "Reconozco que en el minuto 09:35 un alumno propuso hacer la tabla sumando 750 sucesivamente y yo le dije 'ya, también sirve, sigamos' en vez de contrastarlo con la fórmula. Además en el cierre (17:40) dije 'creo que todos comprendieron' y cerré la clase sin una actividad de comprobación individual." },
    { r: "a", c: "Esa autocrítica es fundamental (Paso 6: Relación curricular).\n\n¿Con qué competencia vinculas esta actuación y en qué nivel de la escala (1, 2 o 3) te ubicarías?", paso: 6 },
    { r: "u", c: "La vinculo con CE5.5 (utiliza errores y estrategias) y CE3.2 (uso de respuestas como evidencia). Me ubico en Nivel 2 (esperado en Práctica III): logré una mediación adecuada en el error inicial, pero mi actuación fue incipiente respecto a comparar procedimientos alternativos." },
    { r: "a", c: "Muy buena justificación (Paso 7: Alternativas didácticas).\n\nSi volvieras a estar en el minuto 09:35 frente a la estrategia recursiva: ¿Qué habrías hecho diferente?", paso: 7 },
    { r: "u", c: "Habría escrito en la pizarra la tabla recursiva al lado de la función algebraica y habría preguntado: '¿Cómo encontramos el valor para 50 kilómetros con cada método?' Así habrían visto la ventaja de la expresión funcional." },
    { r: "a", c: "Excelente alternativa (Paso 8: Proyección de mejora).\n\n¿Qué meta concreta y qué evidencia observable buscarás en tu próxima clase grabada?", paso: 8 },
    { r: "u", c: "En mi próxima clase solicitaré al menos dos procedimientos distintos antes de validar una respuesta y dejaré 5 minutos finales para una tarjeta de salida escrita individual que me dé evidencia real de aprendizaje." }
  ];

  const borradorDemo = [
    "Propósito: Modelar con funciones lineales y afines distinguiendo el valor fijo. Episodio seleccionado: minutos 01:30 a 03:30, debate sobre tarifas discrepantes.",
    "El practicante planteó la pregunta al curso sin validar inmediatamente y promovió el diálogo entre pares durante un minuto.",
    "E1 aplicó proporcionalidad directa aprendida previamente, mostrando un obstáculo conceptual al no integrar la constante aditiva inicial.",
    "Citas textuales verificables: minuto 01:42 (procedimiento de E1) y 03:34 (reconocimiento del valor fijo tras la intervención de E3).",
    "Evidencias discrepantes reconocidas: desaprovechamiento de la estrategia recursiva de E5 en 09:35 y cierre presuntivo en 17:40 sin ticket de salida.",
    "Vinculación con CE5.5 y CE3.2 en Nivel 2 (esperado en Práctica III): mediación efectiva ante el error pero insuficiente contraste de estrategias diversas.",
    "Alternativa: Contrastar la estrategia recursiva con la algebraica pidiendo calcular la tarifa para 50 kilómetros para mostrar la necesidad del modelo funcional.",
    "Meta de mejora para la próxima clase: Levantar dos estrategias escolares distintas y cerrar con una tarjeta de salida escrita individual."
  ];

  db.prepare(`
    INSERT INTO reflexiones (
      intervencion_id, turnos_json, paso_actual, borrador_json, aprobado, fecha_aprob, creado_at, actualizado_at
    ) VALUES (?, ?, 8, ?, 1, '2026-09-18', datetime('now'), datetime('now'))
  `).run(iid, JSON.stringify(turnosReflexionDemo), JSON.stringify(borradorDemo));

  // Revisión académica del tutor
  const revCompDemo = {
    "CE5": { estado: "confirmada", categoria: "2", nota: "Coincido plenamente. Se evidencia un excelente uso del error como oportunidad de aprendizaje en aula.", por: tid, fecha: "2026-09-19T10:00:00Z" },
    "CE3": { estado: "confirmada", categoria: "2", nota: "Muy buena capacidad para citar marcas temporales y reconocer el cierre prematuro en 17:40.", por: tid, fecha: "2026-09-19T10:00:00Z" }
  };

  const revRubDemo = {
    "2.3": { estado: "Validado", nivel: "Competente", nota: "Pregunta abierta bien formulada que promovió deliberación entre pares.", por: tid, fecha: "2026-09-19T10:00:00Z" }
  };

  db.prepare(`
    INSERT INTO revisiones (
      intervencion_id, tutor_id, comp_revision_json, rub_revision_json, retro_estudiante, retro_tutor, actualizado_at
    ) VALUES (?, ?, ?, ?, 'Me pareció muy valioso el diálogo con el chatbot para darme cuenta del momento en que desestimé la estrategia recursiva.',
      'Excelente reflexión María Jesús. Demuestras madurez pedagógica al no quedarte solo con lo que salió bien y al proyectar un ticket de salida para tu próxima intervención.', datetime('now'))
  `).run(iid, tid, JSON.stringify(revCompDemo), JSON.stringify(revRubDemo));

  // Evaluación del avance reflexivo realizada por el tutor
  const evalReflexivaDemo = {
    DIM1: { nivel: 3, justificacion: "Focalizó con claridad en el pensamiento matemático de los estudiantes y el obstáculo con el valor fijo." },
    DIM2: { nivel: 3, justificacion: "Citó minutos específicos (01:42, 03:34, 09:35, 17:40) y transcripciones textuales verificables." },
    DIM3: { nivel: 3, justificacion: "Distinguió adecuadamente los hechos de la hipótesis sobre la persistencia de la proporcionalidad directa." },
    DIM4: { nivel: 3, justificacion: "Reconoció honestamente que en 09:35 y 17:40 omitió levantar evidencia formativa." },
    DIM5: { nivel: 3, justificacion: "Formuló una meta situada con una acción concreta (ticket de salida) para la siguiente clase." }
  };

  db.prepare(`
    INSERT INTO evaluaciones_reflexivas (
      id, intervencion_id, user_id, tutor_id, nivel_general, dimensiones_json, fortalezas, areas_mejora, metas_proxima_clase, fecha
    ) VALUES (
      'ev-ref-1', ?, ?, ?, 'Nivel 3 · Basado en Evidencia (Nivel PPIII)', ?,
      'Capacidad sobresaliente de análisis sustentado en citas y honestidad pedagógica frente a evidencias discrepantes.',
      'Profundizar en la anticipación didáctica de representaciones múltiples durante la fase de diseño.',
      'Implementar el ticket de salida en la siguiente grabación y analizar sus resultados en la próxima reflexión.',
      '2026-09-19'
    )
  `).run(iid, uid, tid, JSON.stringify(evalReflexivaDemo));
}

export default db;
