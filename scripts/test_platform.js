import db from '../server/db.js';
import { verifyPassword } from '../server/auth.js';
import { extractTextFromDocx } from '../server/docxParser.js';
import { procesarTurnoReflexion, compilarBorradorReflexion } from '../server/pedagogyEngine.js';
import { RUBRICA_REFLEXION, calcularResumenReflexion } from '../server/reflectionEval.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runTests() {
  console.log('--- INICIANDO VERIFICACIÓN DE LA PLATAFORMA OBSERVA-RETRO ---');

  // Test 1: Usuarios y contraseñas
  console.log('1. Verificando usuarios en la base de datos...');
  const student = db.prepare('SELECT * FROM users WHERE email = ?').get('estudiante@ucsc.cl');
  const tutor = db.prepare('SELECT * FROM users WHERE email = ?').get('tutor@ucsc.cl');

  if (!student || !verifyPassword('practica2026', student.password_hash, student.salt)) {
    throw new Error('Fallo en autenticación de estudiante');
  }
  if (!tutor || !verifyPassword('tutor2026', tutor.password_hash, tutor.salt)) {
    throw new Error('Fallo en autenticación de tutor');
  }
  const practicantes = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE role = ? ORDER BY name ASC').all('estudiante');
  if (!practicantes.length) throw new Error('No practicantes found');
  console.log(`   ✓ Consulta de practicantes para tutores verificada (${practicantes.length} estudiantes).`);
  console.log('   ✓ Usuarios y contraseñas (scrypt) verificados correctamente.');

  // Test 2: Intervención sembrada
  console.log('2. Verificando persistencia de intervenciones...');
  const interv = db.prepare('SELECT * FROM intervenciones WHERE id = ?').get('int-demo-taxi-1');
  if (!interv) throw new Error('Intervención demo no encontrada');
  console.log(`   ✓ Intervención "${interv.contenido}" cargada (${interv.n_lineas} líneas).`);

  // Test 3: Transcripción
  const transRow = db.prepare('SELECT lineas_json FROM transcripciones WHERE intervencion_id = ?').get(interv.id);
  const lineas = JSON.parse(transRow.lineas_json);
  if (!lineas || lineas.length !== 32) throw new Error(`Líneas incorrectas: ${lineas ? lineas.length : 0}`);
  console.log(`   ✓ Transcripción verificada con ${lineas.length} líneas y marcas de tiempo.`);

  // Test 4: Extractor de docx sobre Ejemplo 1.docx
  console.log('4. Verificando extractor de docx con Ejemplo 1.docx...');
  const docxPath = join(__dirname, '..', 'Transcripción', 'Ejemplo 1.docx');
  const docxText = await extractTextFromDocx(docxPath);
  if (!docxText || docxText.length < 1000) {
    throw new Error(`Texto extraído insuficiente (${docxText ? docxText.length : 0} caracteres)`);
  }
  console.log(`   ✓ Extractor docx operativo: ${docxText.length} caracteres extraídos de Ejemplo 1.docx.`);

  // Test 5: Motor conversacional reflexivo en 8 pasos
  console.log('5. Verificando motor de diálogo reflexivo...');
  const mockInterv = { contenido: 'Función lineal y afín' };
  const turno1 = procesarTurnoReflexion(mockInterv, '', []);
  if (turno1.paso !== 1 || !turno1.mensaje.includes('Paso 1')) {
    throw new Error('Paso 1 no se generó adecuadamente');
  }
  const turno2 = procesarTurnoReflexion(mockInterv, 'El propósito era modelar con funciones y elijo el minuto 01:30.', [{ r: 'a', paso: 1, c: turno1.mensaje }]);
  if (turno2.paso !== 2 || !turno2.mensaje.includes('Paso 2')) {
    throw new Error('Paso 2 no avanzó adecuadamente');
  }
  console.log('   ✓ Motor conversacional reflexivo de 8 pasos responde adaptativamente.');

  // Test 6: Compilación de borrador de reflexión
  console.log('6. Verificando compilación de borrador oficial...');
  const turnosMock = [
    { r: 'u', c: 'Propósito y selección del episodio' },
    { r: 'u', c: 'Descripción fáctica de la interacción' },
    { r: 'u', c: 'Interpretación didáctica del error' },
    { r: 'u', c: 'Citas y marcas de tiempo verificables' },
    { r: 'u', c: 'Evidencias discrepantes identificadas' },
    { r: 'u', c: 'Relación con competencia CE5 nivel 2' },
    { r: 'u', c: 'Alternativa didáctica planteada' },
    { r: 'u', c: 'Meta concreta para próxima clase' }
  ];
  const borrador = compilarBorradorReflexion(turnosMock);
  if (borrador.length !== 8) throw new Error(`Borrador incompleto: ${borrador.length} secciones`);
  console.log('   ✓ Compilación de borrador de reflexión en 8 secciones completada.');

  // Test 7: Evaluación del avance reflexivo
  console.log('7. Verificando rúbrica y cálculo del avance reflexivo...');
  const evalMock = {
    dimensiones: {
      DIM1: { nivel: 3 },
      DIM2: { nivel: 3 },
      DIM3: { nivel: 3 },
      DIM4: { nivel: 3 },
      DIM5: { nivel: 3 }
    }
  };
  const resReflexion = calcularResumenReflexion(evalMock);
  if (resReflexion.promedio !== 3.0 || !resReflexion.nivelGlobal.includes('Nivel 3')) {
    throw new Error('Cálculo de progresión reflexiva incorrecto');
  }
  console.log(`   ✓ Evaluación de avance reflexivo calculada: Promedio ${resReflexion.promedio} (${resReflexion.nivelGlobal}).`);

  console.log('\n=======================================================');
  console.log(' ¡TODAS LAS PRUEBAS DE LA PLATAFORMA PASARON CON ÉXITO! ');
  console.log('=======================================================');
}

runTests().catch(err => {
  console.error('Error durante las pruebas:', err);
  process.exit(1);
});
