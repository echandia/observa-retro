/**
 * Módulo de Evaluación del Avance en la Reflexión de la Práctica
 * Práctica Pedagógica III · Pedagogía en Educación Media en Matemática
 * CIAE BASAL / UCSC
 */

export const RUBRICA_REFLEXION = [
  {
    id: "DIM1",
    nombre: "Foco y objeto de la reflexión",
    descripcion: "Evolución desde apreciaciones afectivas y auto-referenciales hacia el análisis del pensamiento matemático de los escolares.",
    niveles: {
      1: {
        etiqueta: "Nivel 1 · Impresionista / Auto-referencial",
        descriptor: "La reflexión se centra en impresiones generales, estados afectivos del practicante ('estuve nervioso/a') o control disciplinario ('se portaron bien'), sin analizar el aprendizaje de los alumnos."
      },
      2: {
        etiqueta: "Nivel 2 · Centrado en la enseñanza propia",
        descriptor: "Focaliza en lo que el practicante hizo o explicó ('yo quería terminar la guía', 'les di la fórmula'), justificando decisiones desde el cumplimiento del plan y no desde las respuestas de los estudiantes."
      },
      3: {
        etiqueta: "Nivel 3 · Centrado en el aprendizaje matemático (Esperado en PPIII)",
        descriptor: "Focaliza de manera explícita en las producciones, respuestas, estrategias y dificultades matemáticas de los estudiantes, analizando cómo razonaron frente a la tarea."
      },
      4: {
        etiqueta: "Nivel 4 · Articulación epistémica y didáctica profunda",
        descriptor: "Analiza la interacción entre la demanda cognitiva de la tarea, los significados matemáticos institucionales y las formas de razonamiento escolar, problematizando los obstáculos didácticos."
      }
    }
  },
  {
    id: "DIM2",
    nombre: "Uso de evidencias observables del registro",
    descripcion: "Capacidad de sustentar afirmaciones reflexivas en fragmentos concretos de la transcripción y marcas temporales del audio.",
    niveles: {
      1: {
        etiqueta: "Nivel 1 · Sin sustento en evidencia",
        descriptor: "Emite afirmaciones categóricas globales ('todos entendieron', 'les costó mucho') sin citar ningún fragmento del registro ni referencia a intervenciones estudiantiles."
      },
      2: {
        etiqueta: "Nivel 2 · Evidencia anecdótica o vaga",
        descriptor: "Menciona situaciones generales de memoria ('cuando pasé por los bancos'), pero sin precisar minutos, turnos de habla ni citas verificables de la clase."
      },
      3: {
        etiqueta: "Nivel 3 · Evidencia localizada y verificable (Esperado en PPIII)",
        descriptor: "Localiza episodios específicos con minutos del audio o números de línea de la transcripción, citando textualmente lo que dijo o hizo el escolar para fundamentar su juicio."
      },
      4: {
        etiqueta: "Nivel 4 · Triangulación y contraste riguroso",
        descriptor: "Triangula múltiples episodios del registro con la planificación y las producciones escritas, contrastando evidencias confirmatorias con evidencias discrepantes o límites del registro."
      }
    }
  },
  {
    id: "DIM3",
    nombre: "Distinción entre descripción, interpretación y valoración",
    descripcion: "Rigor epistémico para diferenciar los hechos observables de las hipótesis explicativas y los juicios de valor.",
    niveles: {
      1: {
        etiqueta: "Nivel 1 · Fusión indiferenciada",
        descriptor: "Confunde lo ocurrido con su juicio de agrado/desagrado o valoración ('la clase fue un éxito porque participaron'), sin distinguir lo que realmente se observó."
      },
      2: {
        etiqueta: "Nivel 2 · Descripción predominantemente fáctica",
        descriptor: "Describe cronológicamente lo que ocurrió con cierto detalle, pero le cuesta formular hipótesis sobre las causas matemáticas o pedagógicas de las dificultades."
      },
      3: {
        etiqueta: "Nivel 3 · Interpretación pedagógica y didáctica (Esperado en PPIII)",
        descriptor: "Distingue con claridad lo que el estudiante dijo/hizo de la interpretación de su origen cognitivo o conceptual, reconociendo el grado de certeza de su inferencia."
      },
      4: {
        etiqueta: "Nivel 4 · Formulación de interpretaciones alternativas",
        descriptor: "Propone y sopesa múltiples hipótesis explicativas frente a un mismo procedimiento o error estudiantil, analizando qué conocimientos matemáticos previos podrían estar en juego."
      }
    }
  },
  {
    id: "DIM4",
    nombre: "Reconocimiento de tensiones y evidencias discrepantes",
    descripcion: "Disposición a examinar momentos críticos de la clase, preguntas no respondidas y oportunidades matemáticas desaprovechadas.",
    niveles: {
      1: {
        etiqueta: "Nivel 1 · Visión complaciente o defensiva",
        descriptor: "Ignora o minimiza los errores y dificultades ocurridas en el aula, o los atribuye exclusivamente a factores externos inmodificables ('falta de base del colegio', 'el tiempo')."
      },
      2: {
        etiqueta: "Nivel 2 · Reconocimiento superficial de dificultades",
        descriptor: "Menciona que algo no funcionó o que una actividad se desordenó, pero sin profundizar en las causas didácticas ni en el rol de las decisiones docentes."
      },
      3: {
        etiqueta: "Nivel 3 · Identificación de oportunidades no aprovechadas (Esperado en PPIII)",
        descriptor: "Identifica con honestidad episodios donde una intervención estudiantil no fue retomada, donde se validó apresuradamente una respuesta o donde el cierre no verificó comprensión."
      },
      4: {
        etiqueta: "Nivel 4 · Problematización reconstructiva profunda",
        descriptor: "Analiza críticamente cómo sus propias intervenciones verbales o preguntas cerradas pudieron condicionar o limitar el debate matemático genuino entre los estudiantes."
      }
    }
  },
  {
    id: "DIM5",
    nombre: "Proyección y formulación de metas de transformación",
    descripcion: "Capacidad de proyectar cambios observables sustentados en la evidencia analizada para la siguiente intervención.",
    niveles: {
      1: {
        etiqueta: "Nivel 1 · Metas vagas o actitudinales",
        descriptor: "Formula intenciones genéricas de carácter actitudinal ('estar más tranquilo/a', 'explicar mejor'), sin acciones pedagógicas concretas."
      },
      2: {
        etiqueta: "Nivel 2 · Metas de incremento cuantitativo",
        descriptor: "Propone hacer más de lo mismo sin cambio metodológico ('hacer más ejercicios', 'preguntar a más alumnos'), sin definir cómo comprobará su efecto."
      },
      3: {
        etiqueta: "Nivel 3 · Acción situada con evidencia observable (Esperado en PPIII)",
        descriptor: "Formula una modificación didáctica concreta (ej. reformulación de consigna, uso de contraejemplos) y define con precisión qué evidencia buscará en la grabación de su próxima clase."
      },
      4: {
        etiqueta: "Nivel 4 · Meta estratégica y dispositivo didáctico fundamentado",
        descriptor: "Diseña un dispositivo didáctico específico (consignas de argumentación, secuencia de andamiaje, comparación sistemática de estrategias) articulado con teorías didácticas y criterios de verificación."
      }
    }
  }
];

export function calcularResumenReflexion(evaluacion) {
  if (!evaluacion || !evaluacion.dimensiones) return null;
  const dims = evaluacion.dimensiones;
  const puntajes = Object.values(dims).map(d => Number(d.nivel)).filter(n => !isNaN(n) && n >= 1 && n <= 4);
  if (!puntajes.length) return null;
  const promedio = Math.round((puntajes.reduce((a, b) => a + b, 0) / puntajes.length) * 10) / 10;
  
  let nivelGlobal = "Nivel 1 · Inicial";
  if (promedio >= 3.5) nivelGlobal = "Nivel 4 · Crítico / Reconstructivo";
  else if (promedio >= 2.6) nivelGlobal = "Nivel 3 · Basado en Evidencia (Nivel PPIII)";
  else if (promedio >= 1.8) nivelGlobal = "Nivel 2 · Explicativo / Centrado en Enseñanza";

  return {
    promedio,
    totalDimensiones: RUBRICA_REFLEXION.length,
    dimensionesEvaluadas: puntajes.length,
    nivelGlobal
  };
}
