/**
 * Módulo Frontend: Evaluación del Avance en la Reflexión de la Práctica
 */

const ReflectionEvalUI = {
  rubrica: null,

  async loadRubrica() {
    if (!this.rubrica) {
      const data = await window.API.getRubricaReflexion();
      this.rubrica = data.rubrica;
    }
    return this.rubrica;
  },

  renderEvaluationForm(evalData, isTutor) {
    if (!this.rubrica) return '<p>Cargando rúbrica...</p>';

    const dims = (evalData && evalData.dimensiones) || {};
    const strengths = (evalData && evalData.fortalezas) || '';
    const areas = (evalData && evalData.areasMejora) || '';
    const metas = (evalData && evalData.metasProximaClase) || '';
    const nivelGen = (evalData && evalData.nivelGeneral) || 'Pendiente de evaluación';

    let html = `
      <div class="eval-reflection-card" style="margin-top: 14px; max-width: 900px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; margin-bottom:14px;">
          <div>
            <h2>Evaluación del Avance en la Reflexión sobre la Práctica</h2>
            <p class="lead">Seguimiento longitudinal de la profundidad reflexiva: desde descripciones anecdóticas hacia el análisis didáctico sustentado en evidencias de aula.</p>
          </div>
          <span class="user-role-tag tutor" style="font-size:0.85rem; padding:5px 12px;">${escapeHtml(nivelGen)}</span>
        </div>
    `;

    this.rubrica.forEach(dim => {
      const selectedLevel = dims[dim.id] ? Number(dims[dim.id].nivel) : null;
      const justif = dims[dim.id] ? dims[dim.id].justificacion : '';

      html += `
        <div class="comp-card" style="margin-bottom: 16px;">
          <header>
            <h3><span class="cid-badge">${dim.id}</span> ${escapeHtml(dim.nombre)}</h3>
          </header>
          <p class="meta">${escapeHtml(dim.descripcion)}</p>

          <div style="display: grid; gap: 8px; margin: 12px 0;">
      `;

      [1, 2, 3, 4].forEach(lvl => {
        const item = dim.niveles[lvl];
        const isChecked = selectedLevel === lvl;
        const disabled = !isTutor ? 'disabled' : '';

        html += `
          <label style="display:flex; gap:10px; align-items:flex-start; padding:8px 10px; border-radius:6px; border:1px solid ${isChecked ? 'var(--board)' : 'var(--line)'}; background:${isChecked ? 'var(--board-soft)' : 'var(--surface)'}; cursor:${isTutor ? 'pointer' : 'default'}">
            <input type="radio" name="dim_${dim.id}" value="${lvl}" ${isChecked ? 'checked' : ''} ${disabled} data-dim="${dim.id}">
            <div>
              <b style="font-size:0.88rem; color:var(--board);">${escapeHtml(item.etiqueta)}</b>
              <p style="font-size:0.84rem; margin:2px 0 0; color:var(--ink);">${escapeHtml(item.descriptor)}</p>
            </div>
          </label>
        `;
      });

      html += `</div>`;

      if (isTutor) {
        html += `
          <div style="margin-top:8px;">
            <label style="font-size:0.85rem; font-weight:600;">Fundamento de la valoración (${dim.id}):
              <input type="text" class="form-control" data-dim-justif="${dim.id}" value="${escapeHtml(justif)}" placeholder="Ej: Se apoya con precisión en los minutos 01:42 y 03:34">
            </label>
          </div>
        `;
      } else if (justif) {
        html += `<p class="meta" style="margin-top:4px;"><b>Comentario del formador:</b> ${escapeHtml(justif)}</p>`;
      }

      html += `</div>`;
    });

    // Retroalimentación cualitativa global
    if (isTutor) {
      html += `
        <div class="academic-review-box" style="margin-top: 20px;">
          <h3 style="margin-bottom:8px;">Retroalimentación Cualitativa y Proyección Formativa</h3>
          <label style="font-size:0.88rem; font-weight:600;">Fortalezas observadas en la reflexión:
            <textarea id="eval-ref-fortalezas" placeholder="Aspectos donde el practicante evidenció madurez y apego a la evidencia...">${escapeHtml(strengths)}</textarea>
          </label>
          <label style="font-size:0.88rem; font-weight:600;">Áreas que requieren mayor profundidad:
            <textarea id="eval-ref-areas" placeholder="Aspectos donde la reflexión fue superficial, complaciente o desarticulada del aprendizaje escolar...">${escapeHtml(areas)}</textarea>
          </label>
          <label style="font-size:0.88rem; font-weight:600;">Metas sugeridas para la próxima intervención grabada:
            <textarea id="eval-ref-metas" placeholder="Acción didáctica específica y evidencia a observar en su siguiente clase...">${escapeHtml(metas)}</textarea>
          </label>
          <div class="row" style="margin-top:10px;">
            <button class="btn" id="btn-guardar-eval-reflexiva">Guardar Evaluación del Avance Reflexivo</button>
            <span id="eval-save-status" class="meta"></span>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="academic-review-box" style="margin-top: 20px;">
          <h3 style="margin-bottom:8px;">Retroalimentación del Profesor/a Formador/a</h3>
          <p><b>Fortalezas destacadas:</b> ${escapeHtml(strengths || 'Pendiente de evaluación.')}</p>
          <p><b>Áreas de mejora:</b> ${escapeHtml(areas || 'Pendiente de evaluación.')}</p>
          <p><b>Metas para tu próxima intervención:</b> ${escapeHtml(metas || 'Pendiente de evaluación.')}</p>
        </div>
      `;
    }

    html += `</div>`;
    return html;
  },

  renderTrayectoriaReflexiva(trayectoriaList) {
    if (!trayectoriaList || !trayectoriaList.length) {
      return `
        <div style="padding:24px 0;">
          <h2>Trayectoria de la Reflexión sobre la Práctica</h2>
          <p class="lead">Aún no se registran evaluaciones del avance reflexivo para este practicante. Una vez que el formador evalúe las intervenciones, aquí se graficará la progresión.</p>
        </div>
      `;
    }

    let rowsHtml = '';
    trayectoriaList.forEach((ev, idx) => {
      rowsHtml += `
        <tr>
          <td><b>Intervención ${idx + 1}</b><br><small class="meta">${escapeHtml(ev.intervencion_fecha)}</small></td>
          <td>${escapeHtml(ev.intervencion_nombre)}</td>
          <td><span class="user-role-tag tutor">${escapeHtml(ev.nivel_general)}</span></td>
          <td>${escapeHtml(ev.fortalezas || '—')}</td>
          <td>${escapeHtml(ev.metas_proxima_clase || '—')}</td>
        </tr>
      `;
    });

    return `
      <div style="padding:16px 0; max-width:960px;">
        <h2>Evolución Longitudinal de la Reflexión Docente</h2>
        <p class="lead">Comparación del nivel de profundidad reflexiva alcanzado en cada intervención de Práctica Pedagógica III.</p>
        <div class="table-scroll" style="margin-top:16px;">
          <table>
            <thead>
              <tr>
                <th>Intervención</th>
                <th>Contenido Matemático</th>
                <th>Nivel de Reflexión Alcanzado</th>
                <th>Fortalezas</th>
                <th>Meta para Siguiente Clase</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  }
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

window.ReflectionEvalUI = ReflectionEvalUI;
