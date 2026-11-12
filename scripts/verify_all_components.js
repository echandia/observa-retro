/**
 * Verificador Integral de Todos los Componentes de la Plataforma Observa-Retro
 */

import { scryptSync } from 'node:crypto';
import db from '../server/db.js';
import { RUBRICA_SECUENCIAS, valorarRubricaSecuencias } from '../server/pedagogyEngine.js';
import { RUBRICA_REFLEXION, calcularResumenReflexion } from '../server/reflectionEval.js';
import { extractTextFromDocument } from '../server/docxParser.js';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

async function runAudit() {
  console.log("===============================================================");
  console.log("   AUDITORÍA INTEGRAL DE COMPONENTES - OBSERVA-RETRO");
  console.log(`   Servidor bajo prueba: ${BASE_URL}`);
  console.log("===============================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FALLÓ: ${message}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // 1. COMPONENTE BASE DE DATOS Y TABLAS
  // -------------------------------------------------------------
  console.log("1. Verificando Esquema y Tablas en Base de Datos (SQLite)...");
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  const expectedTables = ['users', 'sessions', 'intervenciones', 'transcripciones', 'analisis', 'reflexiones', 'revisiones', 'evaluaciones_reflexivas'];
  for (const exp of expectedTables) {
    assert(tables.includes(exp), `Tabla requerida '${exp}' presente`);
  }

  const userCount = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
  assert(userCount >= 20, `Usuarios matriculados en BD: ${userCount}`);

  // -------------------------------------------------------------
  // 2. COMPONENTE AUTENTICACIÓN Y ROLES (API)
  // -------------------------------------------------------------
  console.log("\n2. Verificando Autenticación, Sesiones y Control de Acceso...");
  
  // Login estudiante
  const stRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ncrisosto@alumnos.ucsc.cl', password: 'practica2026' })
  });
  const stData = await stRes.json();
  assert(stRes.status === 200 && stData.token && stData.user.role === 'estudiante', "Login de estudiante (Nicole Crisosto) con rol 'estudiante'");
  const stToken = stData.token;

  // Login tutor / admin
  const tutRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'echandia@ucsc.cl', password: 'admin2026' })
  });
  const tutData = await tutRes.json();
  assert(tutRes.status === 200 && tutData.token && tutData.user.role === 'admin', "Login de formador/administrador (Dr. Eugenio Chandía) con rol 'admin'");
  const tutToken = tutData.token;

  // Endpoint /api/auth/me
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${tutToken}` }
  });
  const meData = await meRes.json();
  assert(meRes.status === 200 && meData.user.email === 'echandia@ucsc.cl', "Endpoint /api/auth/me devuelve identidad autenticada");

  // -------------------------------------------------------------
  // 3. COMPONENTE NÓMINAS Y GESTIÓN DE CURSO
  // -------------------------------------------------------------
  console.log("\n3. Verificando Gestión de Estudiantes y Cursos...");
  const practRes = await fetch(`${BASE_URL}/api/users/practicantes`, {
    headers: { 'Authorization': `Bearer ${tutToken}` }
  });
  const practData = await practRes.json();
  assert(practRes.status === 200 && Array.isArray(practData.practicantes), `Lista de practicantes para formador (${practData.practicantes.length} estudiantes)`);

  const cursosRes = await fetch(`${BASE_URL}/api/cursos/estudiantes`, {
    headers: { 'Authorization': `Bearer ${tutToken}` }
  });
  const cursosData = await cursosRes.json();
  assert(cursosRes.status === 200 && Array.isArray(cursosData.estudiantes), `Lista consolidada de estudiantes matriculados en curso (${cursosData.estudiantes?.length || 0} estudiantes)`);

  // -------------------------------------------------------------
  // 4. COMPONENTE INTERVENCIONES Y DASHBOARD
  // -------------------------------------------------------------
  console.log("\n4. Verificando Intervenciones y Panel Principal...");
  const intListRes = await fetch(`${BASE_URL}/api/intervenciones`, {
    headers: { 'Authorization': `Bearer ${tutToken}` }
  });
  const intListData = await intListRes.json();
  assert(intListRes.status === 200 && intListData.intervenciones.length > 0, `Intervenciones encontradas en el panel (${intListData.intervenciones.length} registros)`);

  const firstInt = intListData.intervenciones[0];
  assert('tienePlanificacion' in firstInt && 'nTurnosReflexion' in firstInt, "Campos de resumen de planificación y chatbot en el listado");

  // Detalle de intervención para estudiante (debe ocultar evaluación interna)
  const stDetailRes = await fetch(`${BASE_URL}/api/intervenciones/${firstInt.id}`, {
    headers: { 'Authorization': `Bearer ${stToken}` }
  });
  const stDetailData = await stDetailRes.json();
  assert(stDetailData.evaluacionReflexiva === null && stDetailData.revision === null, "Privacidad estudiantil: evaluación y revisión son null para el practicante");

  // Detalle de intervención para formador (debe tener acceso a evaluación)
  const tutDetailRes = await fetch(`${BASE_URL}/api/intervenciones/${firstInt.id}`, {
    headers: { 'Authorization': `Bearer ${tutToken}` }
  });
  const tutDetailData = await tutDetailRes.json();
  assert(tutDetailRes.status === 200 && tutDetailData.intervencion.id === firstInt.id, "Acceso completo a la intervención para el formador");

  // -------------------------------------------------------------
  // 5. COMPONENTE PLANIFICACIÓN DIDÁCTICA Y EXTRACTOR MULTIFORMATO
  // -------------------------------------------------------------
  console.log("\n5. Verificando Planificación Didáctica y Parseo de Documentos...");
  const planText = "PLANIFICACIÓN TEST DE AUDITORÍA\nOA 3: Resolver divisiones de fracciones utilizando representaciones visuales y simbólicas.\nInicio: Activación de conocimientos.\nDesarrollo: Trabajo con tiras de fracciones.\nCierre: Metacognición.";
  const updatePlanRes = await fetch(`${BASE_URL}/api/intervenciones/${firstInt.id}/planificacion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stToken}` },
    body: JSON.stringify({ planificacion: planText })
  });
  const updatePlanData = await updatePlanRes.json();
  assert(updatePlanData.ok === true && updatePlanData.planificacion.includes('OA 3'), "Guardado y actualización directa de planificación didáctica");

  // -------------------------------------------------------------
  // 6. COMPONENTE MATRIZ DE SECUENCIAS DIDÁCTICAS (19 CRITERIOS)
  // -------------------------------------------------------------
  console.log("\n6. Verificando Matriz de Secuencias Didácticas (19 Criterios)...");
  assert(RUBRICA_SECUENCIAS.length === 19, `La matriz contiene exactamente 19 criterios formativos`);
  
  const rubVal = valorarRubricaSecuencias([], [], [], true, true);
  assert(rubVal.criterios.length === 19, "Valoración de matriz produce los 19 criterios evaluados");
  const crit1 = rubVal.criterios[0];
  assert(crit1.id && crit1.nombre && crit1.descripcion && crit1.exige && crit1.nivel, `Criterio ${crit1.id} cuenta con título, descripción formativa, evidencia exigida y nivel`);

  // -------------------------------------------------------------
  // 7. COMPONENTE CHATBOT REFLEXIVO (8 PASOS)
  // -------------------------------------------------------------
  console.log("\n7. Verificando Diálogo con el Chatbot Reflexivo (8 Pasos)...");
  const chatRes = await fetch(`${BASE_URL}/api/intervenciones/${firstInt.id}/reflexion/turno`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stToken}` },
    body: JSON.stringify({ mensaje: "En el minuto 10:15 dos estudiantes discutieron si dividir es multiplicar cruzado." })
  });
  const chatData = await chatRes.json();
  assert(chatData.ok === true && chatData.turno && chatData.turno.r === 'a', "Chatbot responde adaptativamente al practicante");
  assert(Array.isArray(chatData.sugerencias) && chatData.sugerencias.length > 0, "Chatbot ofrece sugerencias reflexivas basadas en el aula");

  // Borrador de reflexión
  const draftRes = await fetch(`${BASE_URL}/api/intervenciones/${firstInt.id}/reflexion/borrador`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${stToken}` }
  });
  const draftData = await draftRes.json();
  assert(draftData.ok === true && draftData.borrador.length === 8, "Generación de borrador estructurado de 8 secciones reflexivas");

  // -------------------------------------------------------------
  // 8. COMPONENTE EVALUACIÓN REFLEXIVA DEL FORMADOR (RÚBRICA 5D)
  // -------------------------------------------------------------
  console.log("\n8. Verificando Evaluación Reflexiva del Formador (Rúbrica 5D)...");
  const rubricaRes = await fetch(`${BASE_URL}/api/evaluacion-reflexiva/rubrica`, {
    headers: { 'Authorization': `Bearer ${tutToken}` }
  });
  const rubricaData = await rubricaRes.json();
  assert(rubricaRes.status === 200 && Array.isArray(rubricaData.rubrica) && rubricaData.rubrica.length === 5, "Rúbrica de 5 dimensiones reflexivas disponible");

  // Guardar evaluación como formador
  const evalSaveRes = await fetch(`${BASE_URL}/api/intervenciones/${firstInt.id}/evaluacion-reflexiva`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tutToken}` },
    body: JSON.stringify({
      dimensiones: { d1: 3, d2: 3, d3: 2, d4: 3, d5: 2 },
      fortalezas: "Buena capacidad de reconstrucción anclada en el minuto 10:15.",
      areasMejora: "Profundizar en la formulación de alternativas de andamiaje.",
      metasProximaClase: "Integrar preguntas abiertas en el desarrollo de la tarea."
    })
  });
  const evalSaveData = await evalSaveRes.json();
  assert(evalSaveData.ok === true && evalSaveData.nivelGeneral, `Evaluación reflexiva guardada exitosamente con nivel: ${evalSaveData.nivelGeneral}`);

  // Intentar guardar como estudiante (debe fallar con 403)
  const evalStSaveRes = await fetch(`${BASE_URL}/api/intervenciones/${firstInt.id}/evaluacion-reflexiva`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stToken}` },
    body: JSON.stringify({ dimensiones: { d1: 1 } })
  });
  assert(evalStSaveRes.status === 403, "Seguridad: estudiante bloqueado de calificar (HTTP 403)");

  // -------------------------------------------------------------
  // 9. COMPONENTE HISTORIAL Y PORTAFOLIO FORMATIVO
  // -------------------------------------------------------------
  console.log("\n9. Verificando Historial y Portafolio Formativo...");
  const histRes = await fetch(`${BASE_URL}/api/estudiantes/me/historial`, {
    headers: { 'Authorization': `Bearer ${stToken}` }
  });
  const histData = await histRes.json();
  assert(histData.ok === true && histData.estudiante && histData.resumen, "Historial y Portafolio del estudiante activo");
  assert(histData.resumen.totalPlanificaciones >= 1, `Métricas de portafolio reflejan planificaciones guardadas (${histData.resumen.totalPlanificaciones})`);
  assert(histData.resumen.totalTurnosChatbot > 0, `Métricas de portafolio reflejan turnos de chatbot guardados (${histData.resumen.totalTurnosChatbot})`);

  // Auditoría del formador sobre el historial del estudiante
  const tutAuditRes = await fetch(`${BASE_URL}/api/estudiantes/${stData.user.id}/historial`, {
    headers: { 'Authorization': `Bearer ${tutToken}` }
  });
  const tutAuditData = await tutAuditRes.json();
  assert(tutAuditRes.status === 200 && tutAuditData.historial[0].evaluacion !== null, "Formador puede auditar historial y ver evaluaciones cualitativas");

  // -------------------------------------------------------------
  // 10. COMPONENTE GUÍA OFICIAL Y DOCUMENTOS EN PDF
  // -------------------------------------------------------------
  console.log("\n10. Verificando Guías y Documentos PDF Oficiales...");
  const pdfRes = await fetch(`${BASE_URL}/docs/GUIA_PRESENTACION_REFLEXION_15MIN.pdf`);
  assert(pdfRes.status === 200 && pdfRes.headers.get('content-type'), "Documento PDF oficial de presentación oral (15 min) accesible y descargable");

  const mdRes = await fetch(`${BASE_URL}/docs/GUIA_PRESENTACION_REFLEXION_15MIN.md`);
  assert(mdRes.status === 200, "Documento Markdown oficial de presentación accesible");

  // -------------------------------------------------------------
  // RESUMEN FINAL
  // -------------------------------------------------------------
  console.log("\n===============================================================");
  console.log(`   RESULTADO DE LA AUDITORÍA: ${passed} PRUEBAS EXITOSAS, ${failed} FALLOS`);
  console.log("===============================================================");

  if (failed === 0) {
    console.log("🎉 ¡TODOS LOS COMPONENTES DE LA PLATAFORMA ESTÁN FUNCIONANDO AL 100%!");
  } else {
    process.exit(1);
  }
}

runAudit().catch(err => {
  console.error("Error durante la auditoría:", err);
  process.exit(1);
});
