/**
 * Controlador Principal de la Plataforma Observa-Retro
 */

const App = {
  state: {
    user: null,
    practicantes: [],
    selectedStudentId: null,
    intervenciones: [],
    currentInterv: null,
    view: 'dashboard', // 'dashboard', 'nueva', 'intervencion', 'trayectoria', 'avance_reflexivo', 'marco'
    tab: 'registro',   // 'registro', 'rubrica', 'reflexion', 'supervision', 'eval_reflexiva', 'reporte'
    loading: false,
    error: null,
    notice: null
  },

  async init() {
    window.AudioPlayer.init();
    await window.ReflectionEvalUI.loadRubrica();

    window.addEventListener('auth-expired', () => {
      this.state.user = null;
      this.render();
    });

    try {
      if (window.API.token) {
        const data = await window.API.getMe();
        this.state.user = data.user;
        await this.loadInitialData();
      }
    } catch (e) {
      this.state.user = null;
    }

    this.render();
  },

  async loadInitialData() {
    if (!this.state.user) return;

    if (this.state.user.role === 'tutor' || this.state.user.role === 'admin') {
      try {
        const pr = await window.API.getPracticantes();
        this.state.practicantes = pr.practicantes || [];
        if (!this.state.selectedStudentId && this.state.practicantes.length) {
          this.state.selectedStudentId = this.state.practicantes[0].id;
        }
      } catch (e) {}
    } else {
      this.state.selectedStudentId = this.state.user.id;
    }

    await this.cargarIntervenciones();
  },

  async cargarIntervenciones() {
    try {
      const studentId = (this.state.user.role === 'tutor' || this.state.user.role === 'admin') ? this.state.selectedStudentId : null;
      const res = await window.API.getIntervenciones(studentId);
      this.state.intervenciones = res.intervenciones || [];
    } catch (e) {
      this.state.error = e.message;
    }
  },

  async abrirIntervencion(id) {
    this.state.loading = true;
    this.render();
    try {
      const res = await window.API.getIntervencion(id);
      this.state.currentInterv = res;
      this.state.view = 'intervencion';
      this.state.tab = 'registro';
      window.currentInterventionLines = res.lineas || [];

      if (res.intervencion.audio_path) {
        window.AudioPlayer.loadAudio(id, res.intervencion.audio_filename);
      } else {
        window.AudioPlayer.unloadAudio();
      }
    } catch (e) {
      this.state.error = e.message;
    } finally {
      this.state.loading = false;
      this.render();
      window.scrollTo(0, 0);
    }
  },

  render() {
    const root = document.getElementById('app-root');
    if (!root) return;

    if (!this.state.user) {
      root.innerHTML = this.renderLoginView();
      this.bindLoginEvents();
      return;
    }

    root.innerHTML = `
      <div class="app-container">
        ${this.renderSidebar()}
        <main class="main-content">
          ${this.renderTopBar()}
          ${this.state.notice ? `<div class="alert info">${this.escapeHtml(this.state.notice)} <button class="btn min secondary" id="btn-close-notice" style="margin-left:auto">Cerrar</button></div>` : ''}
          ${this.state.error ? `<div class="alert warning">${this.escapeHtml(this.state.error)} <button class="btn min secondary" id="btn-close-error" style="margin-left:auto">Entendido</button></div>` : ''}
          ${this.renderCurrentView()}
        </main>
      </div>
    `;

    this.bindAppEvents();
  },

  renderLoginView() {
    return `
      <div class="modal-overlay">
        <div class="modal-card">
          <div style="text-align:center;">
            <h1>Observa-Retro</h1>
            <p class="lead" style="margin:4px 0 16px;">Acompañamiento Formativo y Diagnóstico en Práctica Pedagógica III<br><small>UCSC · Facultad de Educación · CIAE BASAL</small></p>
          </div>

          <form id="form-login" style="display:grid; gap:12px;">
            <label style="font-weight:600; font-size:0.9rem;">Correo institucional:
              <input type="email" id="login-email" class="form-control" required placeholder="estudiante@ucsc.cl" value="estudiante@ucsc.cl">
            </label>
            <label style="font-weight:600; font-size:0.9rem;">Contraseña:
              <input type="password" id="login-pass" class="form-control" required placeholder="••••••••" value="practica2026">
            </label>
            <button type="submit" class="btn" style="justify-content:center; padding:10px; margin-top:6px;">Ingresar a la Plataforma</button>
          </form>

          <div style="border-top:1px solid var(--line); padding-top:14px; margin-top:8px;">
            <p class="meta" style="margin-bottom:8px; font-weight:600;">Acceso rápido de demostración institucional:</p>
            <div style="display:grid; gap:8px;">
              <button class="btn secondary min" id="quick-login-student" style="justify-content:flex-start; text-align:left;">
                <b>Estudiante:</b> María Jesús Valenzuela (Practicante 6° semestre)
              </button>
              <button class="btn secondary min" id="quick-login-tutor" style="justify-content:flex-start; text-align:left;">
                <b>Formador:</b> Dr. Carlos Henríquez (Profesor Formador)
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderSidebar() {
    const u = this.state.user;
    const isTutor = u.role === 'tutor' || u.role === 'admin';

    let studentSelectHtml = '';
    if (isTutor && this.state.practicantes.length) {
      studentSelectHtml = `
        <div style="margin-bottom:8px;">
          <label style="font-size:0.8rem; opacity:0.85; display:block; margin-bottom:4px;">Practicante a supervisar:</label>
          <select id="select-active-student" class="form-control" style="background:var(--board); color:var(--board-fg); border-color:rgba(255,255,255,0.3); font-size:0.86rem; padding:6px 8px;">
            ${this.state.practicantes.map(p => `
              <option value="${p.id}" ${p.id === this.state.selectedStudentId ? 'selected' : ''}>${this.escapeHtml(p.name)}</option>
            `).join('')}
          </select>
        </div>
      `;
    }

    return `
      <aside class="sidebar">
        <div class="brand">
          Observa-Retro
          <small>Práctica Pedagógica III · ED1360C</small>
        </div>

        <div class="user-badge">
          <b>${this.escapeHtml(u.name)}</b>
          <span class="user-role-tag ${isTutor ? 'tutor' : ''}">${isTutor ? 'Profesor/a Formador/a' : 'Estudiante de Pedagogía'}</span>
        </div>

        ${studentSelectHtml}

        <button class="btn-nueva" id="btn-nav-nueva">
          + Nueva intervención
        </button>

        <div class="nav-section">
          <h4>Intervenciones de Aula</h4>
          <button class="nav-btn ${this.state.view === 'dashboard' ? 'active' : ''}" id="btn-nav-dashboard">
            <span>Todas las intervenciones</span>
            <small>${this.state.intervenciones.length}</small>
          </button>
          ${this.state.intervenciones.map((x, idx) => `
            <button class="nav-btn ${this.state.view === 'intervencion' && this.state.currentInterv && this.state.currentInterv.intervencion.id === x.id ? 'active' : ''}" data-nav-int="${x.id}">
              <div>
                <span>${idx + 1}. ${this.escapeHtml(x.contenido)}</span>
                <small>${this.formatFecha(x.fecha)} ${x.tieneAnalisis ? '· Analizada' : '· Sin analizar'}</small>
              </div>
            </button>
          `).join('')}
        </div>

        <div class="nav-section">
          <h4>Evaluación y Trayectoria</h4>
          <button class="nav-btn ${this.state.view === 'trayectoria' ? 'active' : ''}" id="btn-nav-trayectoria">
            Trayectoria de competencias
          </button>
          <button class="nav-btn ${this.state.view === 'avance_reflexivo' ? 'active' : ''}" id="btn-nav-avance-ref">
            Avance en la reflexión
          </button>
          <button class="nav-btn ${this.state.view === 'marco' ? 'active' : ''}" id="btn-nav-marco">
            Marco curricular PPIII
          </button>
        </div>

        <div class="sidebar-footer">
          <p>UCSC · Facultad de Educación</p>
          <button class="btn secondary min" id="btn-logout" style="width:100%; justify-content:center; margin-top:8px; border-color:rgba(255,255,255,0.2); color:var(--board-fg);">
            Cerrar sesión
          </button>
        </div>
      </aside>
    `;
  },

  renderTopBar() {
    const u = this.state.user;
    return `
      <div class="top-bar">
        <div>
          <span style="font-size:0.85rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.04em; font-weight:600;">
            ${u.role === 'tutor' ? 'Espacio de Formadores y Tutores Académicos' : 'Espacio de Aprendizaje Profesional del Practicante'}
          </span>
          <h2 style="margin:2px 0 0; color:var(--board);">
            ${this.state.view === 'dashboard' ? 'Panel de Intervenciones Pedagógicas' :
              this.state.view === 'nueva' ? 'Cargar Nueva Intervención de Aula' :
              this.state.view === 'intervencion' && this.state.currentInterv ? this.escapeHtml(this.state.currentInterv.intervencion.contenido) :
              this.state.view === 'trayectoria' ? 'Trayectoria Longitudinal de Competencias' :
              this.state.view === 'avance_reflexivo' ? 'Evaluación del Avance en la Reflexión' : 'Marco Curricular'}
          </h2>
        </div>
        <div class="row">
          <button class="btn secondary min" id="btn-config-ia-modal">
            ⚙️ Configurar Transcripción IA
          </button>
          <button class="btn secondary min" id="btn-quick-switch-role">
            Cambiar a rol ${u.role === 'tutor' ? 'Estudiante' : 'Formador/Tutor'}
          </button>
        </div>
      </div>
    `;
  },

  renderCurrentView() {
    if (this.state.view === 'dashboard') return this.renderDashboard();
    if (this.state.view === 'nueva') return this.renderNueva();
    if (this.state.view === 'intervencion') return this.renderIntervencion();
    if (this.state.view === 'trayectoria') return this.renderTrayectoria();
    if (this.state.view === 'avance_reflexivo') return this.renderAvanceReflexivo();
    if (this.state.view === 'marco') return this.renderMarco();
    return this.renderDashboard();
  },

  renderDashboard() {
    const list = this.state.intervenciones;
    return `
      <div>
        <p class="lead">
          Plataforma de registro y análisis de clases para el desarrollo progresivo de competencias y la reflexión profesional basada en evidencias observables de aula.
        </p>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin: 20px 0;">
          <div style="background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:16px;">
            <small class="meta">Intervenciones registradas</small>
            <div style="font-size:1.8rem; font-weight:700; color:var(--board);">${list.length}</div>
          </div>
          <div style="background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:16px;">
            <small class="meta">Analizadas con motor de evidencias</small>
            <div style="font-size:1.8rem; font-weight:700; color:var(--board);">${list.filter(x => x.tieneAnalisis).length}</div>
          </div>
          <div style="background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:16px;">
            <small class="meta">Reflexiones aprobadas</small>
            <div style="font-size:1.8rem; font-weight:700; color:var(--board);">${list.filter(x => x.reflexionAprobada).length}</div>
          </div>
        </div>

        <div class="row" style="margin-bottom:16px; justify-content:space-between;">
          <h3>Registros de Aula</h3>
          <button class="btn" id="btn-dash-nueva">+ Cargar nueva intervención</button>
        </div>

        ${!list.length ? `
          <div style="background:var(--surface); border:1px dashed var(--line); border-radius:8px; padding:32px; text-align:center;">
            <p class="meta">Aún no hay intervenciones registradas para este practicante.</p>
            <button class="btn secondary min" id="btn-dash-cargar-demo" style="margin-top:8px;">Cargar ejemplo demostrativo</button>
          </div>
        ` : `
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fecha</th>
                  <th>Curso</th>
                  <th>Contenido / Tarea Matemática</th>
                  <th>Tipo de Registro</th>
                  <th>Análisis</th>
                  <th>Reflexión</th>
                  <th>Evaluación Formador</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                ${list.map((item, idx) => `
                  <tr>
                    <td><b>${idx + 1}</b></td>
                    <td>${this.formatFecha(item.fecha)}</td>
                    <td>${this.escapeHtml(item.curso || '—')}</td>
                    <td><b>${this.escapeHtml(item.contenido)}</b></td>
                    <td><span class="tag">${this.escapeHtml(item.tipo_registro)}</span></td>
                    <td>${item.tieneAnalisis ? '<span class="cat-pill cat-2">Analizada</span>' : '<span class="meta">Pendiente</span>'}</td>
                    <td>${item.reflexionAprobada ? '<span class="cat-pill cat-3">Aprobada</span>' : '<span class="meta">En proceso</span>'}</td>
                    <td>${item.evaluacionReflexiva ? `<span class="user-role-tag tutor">${this.escapeHtml(item.evaluacionReflexiva)}</span>` : '<span class="meta">Sin evaluar</span>'}</td>
                    <td>
                      <button class="btn min secondary" data-open-int="${item.id}">Abrir</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  },

  renderNueva() {
    return `
      <div style="max-width:880px;">
        <p class="lead">Sube la transcripción y el audio de la clase. Los archivos se guardarán de manera persistente en la plataforma.</p>

        <form id="form-nueva-intervencion" class="form-grid">
          <fieldset style="border:0; border-top:2px solid var(--ink); padding:16px 0 0; margin:0; display:grid; gap:16px;">
            <legend style="font-weight:700; font-size:1.1rem; color:var(--board);">1. Grabación y Transcripción de Aula</legend>

            <label>Archivo de Audio (.mp3, .m4a, .wav, .webm)
              <span>Permite escuchar la clase y transcribirla directamente con Inteligencia Artificial.</span>
              <input type="file" id="input-audio-file" accept="audio/*,video/mp4,video/webm" class="form-control">
              <span id="audio-upload-status" class="meta" style="color:var(--success);"></span>
            </label>

            <div style="background:var(--board-soft); border:1px solid rgba(27,73,67,0.18); border-radius:6px; padding:12px; margin-top:-6px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:4px;">
                <b style="font-size:0.88rem; color:var(--board);">📁 Audios de prueba detectados en tu carpeta:</b>
                <small class="meta" style="color:var(--muted);">Haz clic para seleccionar una grabación de aula del proyecto</small>
              </div>
              <div class="row" style="flex-wrap:wrap; gap:8px;" id="container-audios-prueba">
                <button type="button" class="btn secondary min btn-audio-prueba-tag" data-file="Cordillera (1).m4a" style="font-size:0.84rem;">
                  🎧 Escuela Cordillera (45 min · 10.5 MB)
                </button>
                <button type="button" class="btn secondary min btn-audio-prueba-tag" data-file="La Costa (1).m4a" style="font-size:0.84rem;">
                  🎧 Escuela La Costa (1h 26m · 20.2 MB)
                </button>
                <button type="button" class="btn secondary min btn-audio-prueba-tag" data-file="Puchoco.m4a" style="font-size:0.84rem;">
                  🎧 Escuela Puchoco (1h 23m · 40.9 MB)
                </button>
              </div>
            </div>

            <div class="row" id="row-transcribir-audio" style="margin-top:-6px; margin-bottom:4px;">
              <button type="button" class="btn min" id="btn-transcribir-audio-ia" style="background:#1B4943; color:#fff;">
                ✨ Transcribir audio automáticamente con IA
              </button>
              <button type="button" class="btn secondary min" id="btn-config-ia-shortcut">
                ⚙️ Configurar API Key (Gemini/Whisper)
              </button>
              <span id="transcribiendo-spinner" class="meta" style="font-weight:600; color:var(--board);"></span>
            </div>

            <label>Archivo de Transcripción (.docx de Teams/Zoom, .vtt, .srt, .txt, .json Whisper)
              <span>Idealmente con marcas de tiempo [mm:ss] y separación de hablantes.</span>
              <input type="file" id="input-trans-file" accept=".docx,.txt,.vtt,.srt,.json,.md" class="form-control">
              <span id="trans-file-status" class="meta" style="color:var(--board);"></span>
            </label>

            <label>O pega directamente la transcripción aquí:
              <textarea id="input-trans-text" class="form-control" style="min-height:120px;" placeholder="[00:01:35] E1: 750.&#10;[00:01:38] Practicante: ¿Cómo lo obtuviste?"></textarea>
            </label>

            <div class="row">
              <button type="button" class="btn secondary min" id="btn-parse-text">Procesar texto pegado</button>
              <button type="button" class="btn secondary min" id="btn-cargar-ejemplo-1">Cargar Ejemplo 1 (Raíz Enésima .docx)</button>
              <span id="trans-parse-count" class="meta"></span>
            </div>

            <label>Nombres que deben anonimizarse (separados por comas)
              <span>Se reemplazarán automáticamente por "Estudiante 1", "Estudiante 2"...</span>
              <input type="text" id="input-anon-names" class="form-control" placeholder="Camila, Benjamín, Matías">
            </label>

            <label>Tipo de registro
              <select id="input-tipo-registro" class="form-control">
                <option>Solo audio transcrito</option>
                <option>Audio y video transcritos</option>
                <option>Transcripción revisada por el practicante</option>
                <option>Notas de campo</option>
              </select>
            </label>
          </fieldset>

          <fieldset style="border:0; border-top:2px solid var(--ink); padding:16px 0 0; margin:0; display:grid; gap:16px;">
            <legend style="font-weight:700; font-size:1.1rem; color:var(--board);">2. Antecedentes Curriculares y Didácticos</legend>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
              <label>Fecha de la clase
                <input type="date" id="input-fecha" class="form-control" value="${new Date().toISOString().slice(0, 10)}">
              </label>
              <label>Curso escolar
                <input type="text" id="input-curso" class="form-control" placeholder="Ej: 2° medio A">
              </label>
            </div>

            <label>Contenido / Tarea Matemática
              <input type="text" id="input-contenido" class="form-control" placeholder="Ej: Raíz enésima y aproximación de raíces inexactas" required>
            </label>

            <label>Propósito matemático planificado
              <textarea id="input-proposito" class="form-control" placeholder="¿Qué aprendizaje matemático esperabas promover?"></textarea>
            </label>

            <label>Antecedentes del grupo y contexto
              <textarea id="input-contexto" class="form-control" placeholder="Conocimientos previos, características relevantes del curso..."></textarea>
            </label>

            <label>Planificación de la clase (texto o archivo .docx / .txt)
              <textarea id="input-planificacion" class="form-control" placeholder="Pega el texto de tu planificación..."></textarea>
              <input type="file" id="input-plan-file" accept=".docx,.txt,.md" class="form-control" style="margin-top:6px;">
            </label>
          </fieldset>

          <div style="margin-top:10px;">
            <label style="display:flex; gap:10px; align-items:flex-start; font-weight:normal; font-size:0.9rem;">
              <input type="checkbox" id="input-consent" required checked>
              <span>Confirmo que cuento con las autorizaciones del establecimiento educacional para este registro y entiendo que su fin es exclusivamente formativo y diagnóstico.</span>
            </label>
          </div>

          <div class="row" style="margin-top:16px;">
            <button type="submit" class="btn" id="btn-submit-nueva">Guardar e ingresar a la intervención</button>
            <button type="button" class="btn secondary" id="btn-cancel-nueva">Cancelar</button>
          </div>
        </form>
      </div>
    `;
  },

  renderIntervencion() {
    const data = this.state.currentInterv;
    if (!data) return '<p>No hay intervención seleccionada.</p>';

    const interv = data.intervencion;
    const isTutor = this.state.user.role === 'tutor' || this.state.user.role === 'admin';

    const tabs = [
      ['registro', 'Registro y evidencias'],
      ['rubrica', 'Matriz de secuencias (19 criterios)'],
      ['reflexion', 'Reflexión guiada con Chatbot'],
      ['supervision', 'Supervisión de diálogo'],
      ['eval_reflexiva', 'Evaluación de la reflexión'],
      ['reporte', 'Reporte formativo']
    ];

    let contentHtml = '';
    if (this.state.tab === 'registro') contentHtml = this.renderTabRegistro();
    else if (this.state.tab === 'rubrica') contentHtml = this.renderTabRubrica();
    else if (this.state.tab === 'reflexion') contentHtml = this.renderTabReflexion();
    else if (this.state.tab === 'supervision') contentHtml = this.renderTabSupervision();
    else if (this.state.tab === 'eval_reflexiva') contentHtml = this.renderTabEvalReflexiva();
    else if (this.state.tab === 'reporte') contentHtml = this.renderTabReporte();

    return `
      <div>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; margin-bottom:12px;">
          <div>
            <h1 style="font-size:1.6rem;">${this.escapeHtml(interv.contenido)}</h1>
            <p class="meta">
              ${this.formatFecha(interv.fecha)} · ${this.escapeHtml(interv.curso || 'Sin curso')} · 
              Practicante: <b>${this.escapeHtml(data.estudiante ? data.estudiante.name : 'María Jesús')}</b> · 
              ${data.lineas.length} líneas transcritas · ${this.escapeHtml(interv.tipo_registro)}
            </p>
          </div>
          <div class="row">
            ${interv.audio_path ? `
              <span class="user-role-tag" style="background:var(--board-soft); color:var(--board); padding:6px 12px;">
                Audio vinculado: ${this.escapeHtml(interv.audio_filename || 'audio.mp3')}
              </span>
              <button class="btn secondary min" id="btn-retranscribir-audio" data-id="${interv.id}">
                ✨ ${data.lineas && data.lineas.length ? 'Re-transcribir con IA' : 'Transcribir audio con IA'}
              </button>
            ` : `
              <label class="btn secondary min" style="cursor:pointer;">
                + Adjuntar archivo de audio
                <input type="file" id="btn-adjuntar-audio-rapido" accept="audio/*,video/mp4,video/webm" hidden>
              </label>
            `}
            <button class="btn secondary min danger" id="btn-eliminar-intervencion" data-id="${interv.id}">Eliminar</button>
          </div>
        </div>

        <nav class="tabs-nav">
          ${tabs.map(([key, label]) => `
            <button class="tab-btn ${this.state.tab === key ? 'active' : ''}" data-tab="${key}">
              ${label}
            </button>
          `).join('')}
        </nav>

        ${contentHtml}
      </div>
    `;
  },

  renderTabRegistro() {
    const data = this.state.currentInterv;
    const interv = data.intervencion;
    const an = data.analisis;
    const lineas = data.lineas || [];

    if (lineas.length === 0) {
      return `
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:32px 24px; margin-top:16px; text-align:center;">
          <h2 style="font-size:1.3rem; margin-bottom:8px;">Sin transcripción de aula registrada</h2>
          <p class="lead" style="margin:8px auto 20px; max-width:600px;">
            ${interv.audio_path ? `Esta intervención cuenta con el archivo de audio <b>${this.escapeHtml(interv.audio_filename || 'audio.mp3')}</b>. Puedes transcribirlo de forma 100% automatizada con Inteligencia Artificial (reconociendo marcas temporales [mm:ss] y hablantes).` : 'Para analizar la práctica pedagógica, se requiere una transcripción o una grabación de audio.'}
          </p>
          ${interv.audio_path ? `
            <button class="btn" id="btn-transcribir-desde-tab">✨ Transcribir audio automáticamente con IA</button>
          ` : `
            <label class="btn" style="cursor:pointer; display:inline-block;">
              Adjuntar archivo de audio (.mp3, .m4a, .wav)
              <input type="file" id="btn-adjuntar-audio-tab" accept="audio/*,video/mp4,video/webm" hidden>
            </label>
          `}
        </div>
      `;
    }

    if (!an) {
      return `
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:28px; margin-top:16px; text-align:center;">
          <h2>Aún no se analiza este registro de aula</h2>
          <p class="lead" style="margin:8px auto 20px;">El motor de evidencias segmentará la clase en episodios didácticos e identificará citas, marcas de tiempo y contraevidencias vinculadas a las competencias de Práctica III.</p>
          <button class="btn" id="btn-ejecutar-analisis">Analizar evidencias de la clase</button>
        </div>
      `;
    }

    const n = lineas.length;
    const evMap = {};
    (an.evidencias || []).forEach(e => {
      if (e.ini) {
        for (let i = e.ini; i <= e.fin; i++) {
          evMap[i] = e.tipo;
        }
      }
    });

    const timelineHtml = `
      <div class="timeline-tape">
        <div class="timeline-ticks">
          ${(an.evidencias || []).filter(e => e.ini).map(e => `
            <i class="${e.tipo}" style="left:${((e.ini - 0.5) / n * 100).toFixed(2)}%" title="${e.ind} (L${e.ini}-L${e.fin})" data-seek-line="${e.ini}"></i>
          `).join('')}
        </div>
        <div class="timeline-bar">
          ${(an.episodios || []).map(ep => `
            <button style="flex:${ep.fin - ep.ini + 1}; background:${this.getEpColor(ep.tipo)}" title="L${ep.ini}-L${ep.fin}: ${this.escapeHtml(ep.titulo)}" data-seek-line="${ep.ini}"></button>
          `).join('')}
        </div>
        <div class="timeline-legend">
          <span><i style="background:var(--marker)"></i> Evidencia que apoya</span>
          <span><i style="background:var(--contra)"></i> Evidencia discrepante / límite</span>
        </div>
      </div>
    `;

    const epIniMap = {};
    (an.episodios || []).forEach(ep => { epIniMap[ep.ini] = ep; });

    const transcriptHtml = `
      <div class="transcript-box" id="transcript-box">
        ${lineas.map((l, idx) => {
          const lineNum = idx + 1;
          const ep = epIniMap[lineNum];
          const hasEv = evMap[lineNum];
          return `
            ${ep ? `<div class="ep-header"><i style="background:${this.getEpColor(ep.tipo)}"></i>${this.escapeHtml(ep.titulo)}: ${this.escapeHtml(ep.resumen)}</div>` : ''}
            <div class="trans-line ${hasEv ? 'has-evidence ' + hasEv : ''}" id="line-${lineNum}">
              <button class="btn-time" data-seek-time="${l.t != null ? l.t : ''}" data-line-num="${lineNum}">
                ${l.t != null ? window.AudioPlayer.formatSeconds(l.t) : lineNum}
              </button>
              <div class="text">
                ${l.h ? `<span class="speaker">${this.escapeHtml(l.h)}:</span> ` : ''}
                ${this.escapeHtml(l.x)}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    const compsHtml = `
      <div>
        <div class="row" style="margin-bottom:14px; justify-content:space-between;">
          <h3 style="margin:0;">Competencias y Evidencias Observables</h3>
          <button class="btn secondary min" id="btn-re-analizar">Re-ejecutar análisis</button>
        </div>
        ${(an.competencias || []).map(c => this.renderCompCard(c, an.evidencias, data.revision)).join('')}
      </div>
    `;

    return `
      <div>
        ${timelineHtml}
        <div class="two-cols">
          ${transcriptHtml}
          ${compsHtml}
        </div>
      </div>
    `;
  },

  renderCompCard(c, allEvs, revision) {
    const evs = (allEvs || []).filter(e => e.ind && e.ind.startsWith(c.id));
    const isTutor = this.state.user.role === 'tutor' || this.state.user.role === 'admin';
    const rev = (revision && revision.comp && revision.comp[c.id]) || null;

    return `
      <section class="comp-card">
        <header>
          <h3><span class="cid-badge">${c.id}</span></h3>
          <div class="row">
            <span class="cat-pill cat-${c.categoria}">${c.categoria === 'NE' ? 'No evaluable' : `Nivel ${c.categoria}`}</span>
            <span class="tag">Fuerza: ${c.fuerza}</span>
          </div>
        </header>

        <p class="meta"><b>Interpretación del sistema:</b> ${this.escapeHtml(c.justificacion)}</p>
        ${c.limites ? `<p class="meta"><b>Límites observados:</b> ${this.escapeHtml(c.limites)}</p>` : ''}

        <div style="margin:10px 0;">
          ${evs.map(e => `
            <div class="evidence-item ${e.tipo}">
              <div class="row" style="justify-content:space-between;">
                <b>${e.ind}</b>
                ${e.ini ? `<button class="btn-ref" data-seek-line="${e.ini}">Líneas ${e.ini}-${e.fin}</button>` : ''}
              </div>
              <p class="evidence-desc"><b>Observado:</b> ${this.escapeHtml(e.observado)}</p>
              <p class="evidence-desc"><b>Interpretación didáctica:</b> ${this.escapeHtml(e.interpretacion)}</p>
            </div>
          `).join('')}
        </div>

        ${c.pregunta ? `<p style="font-size:0.9rem; color:var(--board); margin:8px 0;"><b>Pregunta para profundizar:</b> ${this.escapeHtml(c.pregunta)}</p>` : ''}
        ${c.meta ? `<p style="font-size:0.9rem; color:var(--ink); margin:6px 0;"><b>Meta de mejora sugerida:</b> ${this.escapeHtml(c.meta)}</p>` : ''}

        ${isTutor ? `
          <div class="academic-review-box">
            <b style="font-size:0.85rem;">Validación del Formador:</b>
            <div class="row">
              <button class="btn min secondary ${rev && rev.estado === 'confirmada' ? 'active' : ''}" data-act-rev="confirmada" data-comp="${c.id}">Confirmar</button>
              <button class="btn min secondary ${rev && rev.estado === 'modificada' ? 'active' : ''}" data-act-rev="modificada" data-comp="${c.id}">Modificar</button>
              <button class="btn min secondary ${rev && rev.estado === 'rechazada' ? 'active' : ''}" data-act-rev="rechazada" data-comp="${c.id}">Rechazar</button>
            </div>
            <textarea class="form-control" data-comp-note="${c.id}" placeholder="Comentario o retroalimentación formativa">${this.escapeHtml(rev ? rev.nota : '')}</textarea>
          </div>
        ` : (rev && rev.nota ? `
          <div class="academic-review-box">
            <p><b>Retroalimentación del profesor formador:</b> ${this.escapeHtml(rev.nota)}</p>
          </div>
        ` : '')}
      </section>
    `;
  },

  renderTabRubrica() {
    const data = this.state.currentInterv;
    const an = data.analisis;
    if (!an || !an.rubrica) {
      return `
        <div style="padding:28px 0;">
          <h2>Matriz de Análisis de Secuencias Didácticas</h2>
          <p class="lead">Ejecuta el análisis de la clase en la pestaña "Registro y evidencias" para obtener la valoración de los 19 criterios.</p>
        </div>
      `;
    }

    const isTutor = this.state.user.role === 'tutor' || this.state.user.role === 'admin';
    const criterios = an.rubrica.criterios || [];

    return `
      <div style="max-width:920px; padding:12px 0;">
        <h2>Matriz de Análisis de Secuencias Didácticas (19 Criterios)</h2>
        <p class="lead">4 dimensiones formativas de Práctica Pedagógica III: Planificación, Implementación, Evaluación, y Coherencia y reflexión.</p>

        <div class="table-scroll" style="margin-top:18px;">
          <table>
            <thead>
              <tr>
                <th>Criterio</th>
                <th>Nivel</th>
                <th>Evidencias Observadas</th>
                <th>Justificación Pedagógica</th>
                <th>Siguiente Paso</th>
                ${isTutor ? '<th>Validación Formador</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${criterios.map(c => `
                <tr>
                  <td><b>${c.id}</b></td>
                  <td><span class="cat-pill cat-${c.nivel === 'Destacado' ? '3' : c.nivel === 'Competente' ? '2' : '1'}">${this.escapeHtml(c.nivel)}</span></td>
                  <td>${(c.evidencias || []).map(e => e.nota || e.cita).join('<br>') || 'Registro'}</td>
                  <td>${this.escapeHtml(c.justificacion)}</td>
                  <td>${this.escapeHtml(c.paso)}</td>
                  ${isTutor ? `
                    <td>
                      <button class="btn min secondary" data-val-rub="${c.id}">Validar</button>
                    </td>
                  ` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  renderTabReflexion() {
    const data = this.state.currentInterv;
    const ref = data.reflexion || { turnos: [], paso: 1, borrador: null, aprobado: false };
    const turnos = ref.turnos || [];
    const pasoActual = ref.paso || 1;

    const pasosNombres = [
      "1. Reconstrucción",
      "2. Descripción",
      "3. Interpretación",
      "4. Fundamentación",
      "5. Contraste",
      "6. Relación curricular",
      "7. Alternativa didáctica",
      "8. Proyección de mejora"
    ];

    return `
      <div class="reflection-layout">
        <div>
          <ol class="steps-stepper">
            ${pasosNombres.map((name, idx) => {
              const stepNum = idx + 1;
              const isDone = pasoActual > stepNum;
              const isCurrent = pasoActual === stepNum;
              return `<li class="${isDone ? 'done' : isCurrent ? 'current' : ''}">${name}</li>`;
            }).join('')}
          </ol>
          <div style="margin-top:16px; font-size:0.84rem; color:var(--muted); line-height:1.4;">
            El chatbot formula preguntas adaptativas ancladas en tu registro de aula. Responde con tus propias palabras y cita las marcas de tiempo.
          </div>
        </div>

        <div>
          <div class="chat-container" id="chat-messages-container">
            ${!turnos.length ? `
              <div style="background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:24px; text-align:center;">
                <h3>Inicia el diálogo reflexivo sobre tu intervención</h3>
                <p class="lead">El asistente recorrerá los 8 pasos de la práctica reflexiva basada en evidencias de tu clase.</p>
                <button class="btn" id="btn-iniciar-chat-reflexion">Comenzar reflexión guiada</button>
              </div>
            ` : turnos.map(t => `
              <div class="chat-bubble ${t.r === 'u' ? 'user' : 'assistant'}">
                <small>${t.r === 'u' ? 'Tú (Practicante)' : `Chatbot Reflexivo · Paso ${t.paso || 1}`}</small>
                <div>${this.escapeHtml(t.c)}</div>
              </div>
            `).join('')}
          </div>

          ${turnos.length ? `
            <div class="chat-input-area">
              <div class="chat-suggestions" id="chat-suggestions-box"></div>
              <div class="row">
                <button class="btn secondary min" id="btn-citar-minuto-audio">
                  🎙️ Citar minuto actual del audio (${window.AudioPlayer.getCurrentTimeFormatted()})
                </button>
              </div>
              <textarea id="chat-input-text" placeholder="Escribe tu reflexión aquí. Describe qué ocurrió y cita el minuto cuando corresponda..."></textarea>
              <div class="row" style="justify-content:space-between;">
                <button class="btn" id="btn-enviar-chat-reflexion">Enviar respuesta</button>
                <button class="btn secondary" id="btn-generar-borrador-reflexion">Generar borrador de reflexión</button>
              </div>
            </div>
          ` : ''}

          ${ref.borrador ? `
            <div style="margin-top:32px; background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:20px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h3>Borrador Oficial de Reflexión Docente</h3>
                ${ref.aprobado ? `<span class="cat-pill cat-3">Aprobado el ${this.formatFecha(ref.fechaAprob)}</span>` : '<span class="tag">Borrador preliminar</span>'}
              </div>
              <p class="meta">Este texto se estructuró a partir de tus respuestas en el diálogo. Puedes editar cada sección antes de aprobarlo.</p>

              <div style="display:grid; gap:12px; margin-top:14px;">
                ${ref.borrador.map((txt, i) => `
                  <label style="font-weight:600; font-size:0.88rem;">${i + 1}. ${pasosNombres[i]}
                    <textarea class="form-control" data-borrador-idx="${i}" style="min-height:70px; margin-top:4px;">${this.escapeHtml(txt)}</textarea>
                  </label>
                `).join('')}
              </div>

              <div class="row" style="margin-top:16px;">
                <button class="btn" id="btn-aprobar-borrador-reflexion">
                  ${ref.aprobado ? 'Guardar cambios del borrador aprobado' : 'Aprobar borrador y fijar en el reporte'}
                </button>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  },

  renderTabSupervision() {
    const data = this.state.currentInterv;
    const ref = data.reflexion || { turnos: [], aprobado: false };
    const turnos = ref.turnos || [];

    return `
      <div style="max-width:880px; padding:12px 0;">
        <h2>Supervisión Académica del Diálogo con el Chatbot</h2>
        <p class="lead">Auditoría completa de la interacción reflexiva entre el practicante y el asistente pedagógico.</p>

        ${!turnos.length ? `
          <div style="background:var(--surface); border:1px dashed var(--line); border-radius:8px; padding:24px; text-align:center;">
            <p class="meta">El practicante aún no ha iniciado el diálogo reflexivo con el chatbot para esta intervención.</p>
          </div>
        ` : `
          <div class="chat-container" style="margin-top:16px;">
            ${turnos.map((t, idx) => `
              <div class="chat-bubble ${t.r === 'u' ? 'user' : 'assistant'}">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                  <small>${t.r === 'u' ? 'Respuesta del Practicante' : `Pregunta del Asistente (Paso ${t.paso || 1})`}</small>
                  <small class="meta">Turno #${idx + 1}</small>
                </div>
                <div>${this.escapeHtml(t.c)}</div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  },

  renderTabEvalReflexiva() {
    const data = this.state.currentInterv;
    const isTutor = this.state.user.role === 'tutor' || this.state.user.role === 'admin';
    return window.ReflectionEvalUI.renderEvaluationForm(data.evaluacionReflexiva, isTutor);
  },

  renderTabReporte() {
    const data = this.state.currentInterv;
    const interv = data.intervencion;
    const an = data.analisis;
    const ref = data.reflexion;

    return `
      <div style="max-width:880px; padding:16px 0;">
        <div class="row" style="justify-content:space-between; margin-bottom:16px;">
          <h2>Reporte Formativo de Intervención Pedagógica</h2>
          <button class="btn secondary min" onclick="window.print()">Imprimir / Guardar PDF</button>
        </div>

        <div style="background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:24px;">
          <h3>1. Identificación</h3>
          <p><b>Clase:</b> ${this.escapeHtml(interv.contenido)} (${this.formatFecha(interv.fecha)})</p>
          <p><b>Curso:</b> ${this.escapeHtml(interv.curso || '—')} | <b>Tipo de Registro:</b> ${this.escapeHtml(interv.tipo_registro)}</p>
          <p><b>Propósito declarado:</b> ${this.escapeHtml(interv.proposito || 'No declarado')}</p>

          <h3 style="margin-top:20px;">2. Síntesis Descriptiva del Registro</h3>
          <p>${this.escapeHtml(an ? an.sintesis : 'Sin análisis ejecutado.')}</p>

          <h3 style="margin-top:20px;">3. Reflexión Aprobada del Practicante</h3>
          ${ref && ref.borrador && ref.aprobado ? `
            <div style="display:grid; gap:8px;">
              ${ref.borrador.map((txt, i) => `<p><b>Paso ${i + 1}:</b> ${this.escapeHtml(txt)}</p>`).join('')}
            </div>
          ` : '<p class="meta">El practicante aún no ha aprobado su reflexión.</p>'}

          <h3 style="margin-top:20px;">4. Evaluación del Avance Reflexivo (Formador)</h3>
          ${data.evaluacionReflexiva ? `
            <p><b>Nivel General:</b> ${this.escapeHtml(data.evaluacionReflexiva.nivelGeneral)}</p>
            <p><b>Fortalezas:</b> ${this.escapeHtml(data.evaluacionReflexiva.fortalezas)}</p>
            <p><b>Metas para próxima intervención:</b> ${this.escapeHtml(data.evaluacionReflexiva.metasProximaClase)}</p>
          ` : '<p class="meta">Evaluación pendiente por parte del formador.</p>'}
        </div>
      </div>
    `;
  },

  async renderTrayectoria() {
    const list = this.state.intervenciones;
    return `
      <div>
        <h2>Trayectoria Longitudinal de Competencias</h2>
        <p class="lead">Evolución de evidencias observables por competencia a lo largo del semestre en Práctica Pedagógica III.</p>

        <div class="table-scroll" style="margin-top:16px;">
          <table>
            <thead>
              <tr>
                <th>Competencia</th>
                ${list.map((x, idx) => `<th>Intervención ${idx + 1}<br><small class="meta">${this.formatFecha(x.fecha)}</small></th>`).join('')}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><b>CE5</b> Didáctica de la Matemática</td>
                ${list.map(x => `<td><span class="cat-pill cat-2">Nivel 2 (Esperado)</span></td>`).join('')}
              </tr>
              <tr>
                <td><b>CE3</b> Análisis basado en evidencia</td>
                ${list.map(x => `<td><span class="cat-pill cat-2">Nivel 2 (Esperado)</span></td>`).join('')}
              </tr>
              <tr>
                <td><b>CG1</b> Diagnóstico y bien común</td>
                ${list.map(x => `<td><span class="cat-pill cat-2">Nivel 2</span></td>`).join('')}
              </tr>
              <tr>
                <td><b>CE4</b> Conocimiento matemático</td>
                ${list.map(x => `<td><span class="cat-pill cat-2">Nivel 2</span></td>`).join('')}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  async renderAvanceReflexivo() {
    const studentId = this.state.selectedStudentId || this.state.user.id;
    try {
      const data = await window.API.getTrayectoriaReflexiva(studentId);
      return window.ReflectionEvalUI.renderTrayectoriaReflexiva(data.trayectoria);
    } catch (e) {
      return `<p class="alert warning">Error cargando trayectoria reflexiva: ${this.escapeHtml(e.message)}</p>`;
    }
  },

  renderMarco() {
    return `
      <div style="max-width:920px;">
        <h2>Marco Curricular y Modelo de Evidencias</h2>
        <p class="lead">Alineamiento de Práctica Pedagógica III (ED1360C) con el perfil de egreso y los Estándares de la Profesión Docente (CPEIP, 2021).</p>

        <div class="comp-card">
          <h3>Resultados de Aprendizaje del Syllabus</h3>
          <p><b>RA1 (30%):</b> Reconocer el modo en que aprenden las y los estudiantes y sus implicancias para la secuencia didáctica.</p>
          <p><b>RA2 (40%):</b> Implementar secuencias coherentes con el contexto incorporando recursos y TIC.</p>
          <p><b>RA3 (30%):</b> Evaluar la efectividad de la implementación en los resultados de aprendizaje.</p>
        </div>

        <div class="comp-card" style="margin-top:16px;">
          <h3>Competencias Prioritarias de la Carrera</h3>
          <p><b>CE5:</b> Desarrollar proyectos didácticos para la enseñanza de la matemática en contextos diversos.</p>
          <p><b>CE3:</b> Analizar reflexiva y críticamente las prácticas educativas para mejorar la acción docente basándose en evidencias sistematizadas.</p>
          <p><b>CG1:</b> Diagnosticar necesidades de formación para implementar acciones innovadoras vinculadas al bien común.</p>
        </div>
      </div>
    `;
  },

  bindLoginEvents() {
    const form = document.getElementById('form-login');
    if (form) {
      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-pass').value;
        try {
          const res = await window.API.login(email, pass);
          this.state.user = res.user;
          await this.loadInitialData();
          this.render();
        } catch (e) {
          alert(e.message);
        }
      });
    }

    const btnStudent = document.getElementById('quick-login-student');
    if (btnStudent) {
      btnStudent.addEventListener('click', async () => {
        document.getElementById('login-email').value = 'estudiante@ucsc.cl';
        document.getElementById('login-pass').value = 'practica2026';
        form.dispatchEvent(new Event('submit'));
      });
    }

    const btnTutor = document.getElementById('quick-login-tutor');
    if (btnTutor) {
      btnTutor.addEventListener('click', async () => {
        document.getElementById('login-email').value = 'tutor@ucsc.cl';
        document.getElementById('login-pass').value = 'tutor2026';
        form.dispatchEvent(new Event('submit'));
      });
    }
  },

  bindAppEvents() {
    // Logout
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', async () => {
        await window.API.logout();
        this.state.user = null;
        this.render();
      });
    }

    // Role switcher
    const btnSwitch = document.getElementById('btn-quick-switch-role');
    if (btnSwitch) {
      btnSwitch.addEventListener('click', async () => {
        const targetEmail = this.state.user.role === 'tutor' ? 'estudiante@ucsc.cl' : 'tutor@ucsc.cl';
        const targetPass = this.state.user.role === 'tutor' ? 'practica2026' : 'tutor2026';
        const res = await window.API.login(targetEmail, targetPass);
        this.state.user = res.user;
        this.state.view = 'dashboard';
        await this.loadInitialData();
        this.render();
      });
    }

    // Modal de configuración de Transcripción con IA
    const btnConfigIA = document.getElementById('btn-config-ia-modal');
    if (btnConfigIA) {
      btnConfigIA.addEventListener('click', () => this.openConfigModal());
    }

    // Navegación Sidebar
    document.querySelectorAll('[data-nav-int]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.abrirIntervencion(btn.dataset.navInt);
      });
    });

    const btnNueva = document.getElementById('btn-nav-nueva') || document.getElementById('btn-dash-nueva');
    if (btnNueva) btnNueva.addEventListener('click', () => { this.state.view = 'nueva'; this.render(); });

    const btnDash = document.getElementById('btn-nav-dashboard');
    if (btnDash) btnDash.addEventListener('click', () => { this.state.view = 'dashboard'; this.render(); });

    const btnTray = document.getElementById('btn-nav-trayectoria');
    if (btnTray) btnTray.addEventListener('click', () => { this.state.view = 'trayectoria'; this.render(); });

    const btnAvance = document.getElementById('btn-nav-avance-ref');
    if (btnAvance) btnAvance.addEventListener('click', () => { this.state.view = 'avance_reflexivo'; this.render(); });

    const btnMarco = document.getElementById('btn-nav-marco');
    if (btnMarco) btnMarco.addEventListener('click', () => { this.state.view = 'marco'; this.render(); });

    // Selector de estudiante para tutores
    const selStudent = document.getElementById('select-active-student');
    if (selStudent) {
      selStudent.addEventListener('change', async () => {
        this.state.selectedStudentId = selStudent.value;
        await this.cargarIntervenciones();
        this.render();
      });
    }

    // Intervención Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.tab = btn.dataset.tab;
        this.render();
      });
    });

    // Abrir intervención desde tabla
    document.querySelectorAll('[data-open-int]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.abrirIntervencion(btn.dataset.openInt);
      });
    });

    // Formulario Nueva Intervención
    const formNueva = document.getElementById('form-nueva-intervencion');
    if (formNueva) {
      this.bindNuevaIntervencionEvents();
    }

    // Botones de salto temporal en transcripción
    document.querySelectorAll('[data-seek-time]').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = Number(btn.dataset.seekTime);
        if (!isNaN(t) && t >= 0) window.AudioPlayer.seekTo(t);
      });
    });

    document.querySelectorAll('[data-seek-line]').forEach(btn => {
      btn.addEventListener('click', () => {
        const lineNum = Number(btn.dataset.seekLine);
        const line = (this.state.currentInterv.lineas || [])[lineNum - 1];
        if (line && line.t != null) window.AudioPlayer.seekTo(line.t);
        const el = document.getElementById(`line-${lineNum}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    // Análisis de Evidencias
    const btnAnalizar = document.getElementById('btn-ejecutar-analisis') || document.getElementById('btn-re-analizar');
    if (btnAnalizar) {
      btnAnalizar.addEventListener('click', async () => {
        btnAnalizar.disabled = true;
        btnAnalizar.textContent = 'Analizando evidencias pedagógicas...';
        try {
          await window.API.analizar(this.state.currentInterv.intervencion.id);
          await this.abrirIntervencion(this.state.currentInterv.intervencion.id);
        } catch (e) {
          alert(e.message);
        }
      });
    }

    // Chatbot Reflexivo
    this.bindChatEvents();

    // Guardado de Evaluación Reflexiva del Tutor
    const btnGuardarEvalRef = document.getElementById('btn-guardar-eval-reflexiva');
    if (btnGuardarEvalRef) {
      btnGuardarEvalRef.addEventListener('click', async () => {
        btnGuardarEvalRef.disabled = true;
        btnGuardarEvalRef.textContent = 'Guardando...';
        const dimensiones = {};
        document.querySelectorAll('input[type="radio"]:checked[data-dim]').forEach(r => {
          const dimId = r.dataset.dim;
          const justEl = document.querySelector(`[data-dim-justif="${dimId}"]`);
          dimensiones[dimId] = {
            nivel: r.value,
            justificacion: justEl ? justEl.value : ''
          };
        });

        const fortalezas = (document.getElementById('eval-ref-fortalezas') || {}).value || '';
        const areasMejora = (document.getElementById('eval-ref-areas') || {}).value || '';
        const metasProximaClase = (document.getElementById('eval-ref-metas') || {}).value || '';

        try {
          await window.API.guardarEvaluacionReflexiva(this.state.currentInterv.intervencion.id, {
            dimensiones,
            fortalezas,
            areasMejora,
            metasProximaClase
          });
          this.state.notice = 'Evaluación del avance reflexivo guardada exitosamente.';
          await this.abrirIntervencion(this.state.currentInterv.intervencion.id);
          this.state.tab = 'eval_reflexiva';
          this.render();
        } catch (e) {
          alert(e.message);
        }
      });
    }

    // Acciones de Intervención: Eliminar, Adjuntar audio y Transcribir con IA
    const btnEliminar = document.getElementById('btn-eliminar-intervencion');
    if (btnEliminar) {
      btnEliminar.addEventListener('click', async () => {
        if (!confirm('¿Estás seguro de eliminar esta intervención? Esta acción no se puede deshacer.')) return;
        try {
          await window.API.deleteIntervencion(btnEliminar.dataset.id);
          this.state.currentInterv = null;
          this.state.view = 'dashboard';
          await this.cargarIntervenciones();
          this.render();
        } catch (e) {
          alert(`Error al eliminar: ${e.message}`);
        }
      });
    }

    const inputAdjuntarAudio = document.getElementById('btn-adjuntar-audio-rapido') || document.getElementById('btn-adjuntar-audio-tab');
    if (inputAdjuntarAudio) {
      inputAdjuntarAudio.addEventListener('change', async () => {
        if (!inputAdjuntarAudio.files[0]) return;
        const file = inputAdjuntarAudio.files[0];
        try {
          await window.API.uploadAudio(this.state.currentInterv.intervencion.id, file);
          this.state.notice = `✓ Audio "${file.name}" vinculado a la intervención exitosamente.`;
          await this.abrirIntervencion(this.state.currentInterv.intervencion.id);
        } catch (e) {
          alert(`Error al subir audio: ${e.message}`);
        }
      });
    }

    const btnRetranscribir = document.getElementById('btn-retranscribir-audio') || document.getElementById('btn-transcribir-desde-tab');
    if (btnRetranscribir) {
      btnRetranscribir.addEventListener('click', async () => {
        if (!confirm('¿Deseas iniciar la transcripción automática de esta grabación con IA?')) return;
        btnRetranscribir.disabled = true;
        const prevText = btnRetranscribir.textContent;
        btnRetranscribir.textContent = '⏳ Transcribiendo clase completa con IA en pases continuos...';
        try {
          const res = await window.API.transcribirIntervencionAudio(this.state.currentInterv.intervencion.id);
          if (res.error_code === 'NO_API_KEY') {
            this.openConfigModal(res.message);
            return;
          }
          if (res.error_code === 'TRANSCRIPTION_BUSY') {
            alert(res.message);
            return;
          }
          const pasesInfo = res.pases ? ` en ${res.pases} pases continuos` : '';
          this.state.notice = `✓ Transcripción completada: se generaron ${res.lineas ? res.lineas.length : 0} turnos con marcas de tiempo${pasesInfo}.`;
          await this.abrirIntervencion(this.state.currentInterv.intervencion.id);
        } catch (err) {
          alert(`Error al transcribir: ${err.message}`);
        } finally {
          btnRetranscribir.disabled = false;
          btnRetranscribir.textContent = prevText;
        }
      });
    }
  },

  bindNuevaIntervencionEvents() {
    let audioFilePending = null;
    let selectedAudioPrueba = null;
    let parsedLines = [];

    // Botones de audios de prueba del proyecto
    document.querySelectorAll('.btn-audio-prueba-tag').forEach(btn => {
      btn.addEventListener('click', () => {
        const file = btn.dataset.file;
        selectedAudioPrueba = file;
        audioFilePending = null;
        document.querySelectorAll('.btn-audio-prueba-tag').forEach(b => {
          b.style.background = '';
          b.style.color = '';
        });
        btn.style.background = 'var(--board)';
        btn.style.color = '#fff';
        const st = document.getElementById('audio-upload-status');
        if (st) st.innerHTML = `✓ <b>Audio del proyecto seleccionado:</b> ${file}`;
        const rowTrans = document.getElementById('row-transcribir-audio');
        if (rowTrans) rowTrans.style.display = 'flex';
      });
    });

    const inputAudio = document.getElementById('input-audio-file');
    if (inputAudio) {
      inputAudio.addEventListener('change', () => {
        if (inputAudio.files[0]) {
          audioFilePending = inputAudio.files[0];
          selectedAudioPrueba = null;
          document.querySelectorAll('.btn-audio-prueba-tag').forEach(b => {
            b.style.background = '';
            b.style.color = '';
          });
          document.getElementById('audio-upload-status').textContent = `Audio seleccionado: ${audioFilePending.name}`;
          const rowTrans = document.getElementById('row-transcribir-audio');
          if (rowTrans) rowTrans.style.display = 'flex';
        }
      });
    }

    const btnTransIA = document.getElementById('btn-transcribir-audio-ia');
    if (btnTransIA) {
      btnTransIA.addEventListener('click', async () => {
        if (!audioFilePending && !selectedAudioPrueba) {
          alert('Por favor selecciona primero un archivo de audio (.mp3, .m4a, .wav) o haz clic en uno de los audios de prueba.');
          return;
        }
        const spinner = document.getElementById('transcribiendo-spinner');
        spinner.textContent = '⏳ Transcribiendo clase completa con IA (analizando en pases continuos)...';
        btnTransIA.disabled = true;

        try {
          let result;
          if (selectedAudioPrueba) {
            result = await window.API.transcribirAudioPrueba(selectedAudioPrueba);
          } else {
            result = await window.API.transcribirAudioFile(audioFilePending);
          }

          if (result.error_code === 'NO_API_KEY') {
            spinner.textContent = '';
            this.openConfigModal(result.message);
            return;
          }
          if (result.error_code === 'TRANSCRIPTION_BUSY') {
            spinner.textContent = `⏳ ${result.message}`;
            alert(result.message);
            return;
          }
          if (result.texto) {
            document.getElementById('input-trans-text').value = result.texto;
            this.procesarTextoTranscripcion(result.texto);
            const pasesInfo = result.pases ? ` en ${result.pases} pases continuos` : '';
            spinner.textContent = `✓ Transcripción completada (${result.modelo || result.proveedor}): ${result.lineas ? result.lineas.length : 0} turnos generados${pasesInfo}.`;
          }
        } catch (e) {
          spinner.textContent = `Error: ${e.message}`;
        } finally {
          btnTransIA.disabled = false;
        }
      });
    }

    const btnConfigIA = document.getElementById('btn-config-ia-shortcut');
    if (btnConfigIA) {
      btnConfigIA.addEventListener('click', () => this.openConfigModal());
    }

    const inputTransFile = document.getElementById('input-trans-file');
    if (inputTransFile) {
      inputTransFile.addEventListener('change', async () => {
        if (inputTransFile.files[0]) {
          const file = inputTransFile.files[0];
          document.getElementById('trans-file-status').textContent = 'Procesando archivo...';
          try {
            const data = await window.API.uploadDocumento(file);
            document.getElementById('input-trans-text').value = data.text;
            document.getElementById('trans-file-status').textContent = `Archivo cargado: ${file.name}`;
            this.procesarTextoTranscripcion(data.text);
          } catch (e) {
            document.getElementById('trans-file-status').textContent = `Error: ${e.message}`;
          }
        }
      });
    }

    const btnParseText = document.getElementById('btn-parse-text');
    if (btnParseText) {
      btnParseText.addEventListener('click', () => {
        const text = document.getElementById('input-trans-text').value;
        this.procesarTextoTranscripcion(text);
      });
    }

    const btnEjemplo1 = document.getElementById('btn-cargar-ejemplo-1');
    if (btnEjemplo1) {
      btnEjemplo1.addEventListener('click', async () => {
        document.getElementById('input-contenido').value = "Raíz enésima: conceptos y propiedades";
        document.getElementById('input-curso').value = "2° medio A";
        document.getElementById('input-proposito').value = "Recordar el concepto de raíz enésima a partir del origen del término y diferenciar raíces exactas e inexactas.";
        document.getElementById('input-contexto').value = "Alumnos de segundo medio que revisaron raíces en semanas previas.";
        // Cargar texto de Ejemplo 1
        const res = await fetch('/Transcripción/Ejemplo 1.docx');
        if (res.ok) {
          const blob = await res.blob();
          const file = new File([blob], 'Ejemplo 1.docx');
          const data = await window.API.uploadDocumento(file);
          document.getElementById('input-trans-text').value = data.text;
          this.procesarTextoTranscripcion(data.text);
        }
      });
    }

    const form = document.getElementById('form-nueva-intervencion');
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const text = document.getElementById('input-trans-text').value;
      const lines = this.parseTranscriptText(text);

      if (!lines.length) {
        alert('Por favor agrega o pega la transcripción de la clase.');
        return;
      }

      const payload = {
        fecha: document.getElementById('input-fecha').value,
        curso: document.getElementById('input-curso').value,
        contenido: document.getElementById('input-contenido').value,
        proposito: document.getElementById('input-proposito').value,
        contexto: document.getElementById('input-contexto').value,
        planificacion: document.getElementById('input-planificacion').value,
        tipoRegistro: document.getElementById('input-tipo-registro').value,
        lineas: lines
      };

      try {
        const res = await window.API.createIntervencion(payload);
        if (selectedAudioPrueba) {
          await window.API.cargarAudioPrueba(selectedAudioPrueba, res.id);
        } else if (audioFilePending) {
          await window.API.uploadAudio(res.id, audioFilePending);
        }
        await this.cargarIntervenciones();
        await this.abrirIntervencion(res.id);
      } catch (e) {
        alert(e.message);
      }
    });

    const btnCancel = document.getElementById('btn-cancel-nueva');
    if (btnCancel) btnCancel.addEventListener('click', () => { this.state.view = 'dashboard'; this.render(); });
  },

  procesarTextoTranscripcion(text) {
    const lines = this.parseTranscriptText(text);
    const countEl = document.getElementById('trans-parse-count');
    if (countEl) countEl.textContent = `${lines.length} turnos detectados`;
    return lines;
  },

  parseTranscriptText(text) {
    if (!text) return [];
    const lines = [];
    const rawLines = text.split('\n');

    rawLines.forEach(l => {
      const line = l.trim();
      if (!line) return;
      let t = null;
      let h = '';
      let x = line;

      // Detectar timestamp tipo [00:12:30] o (01:45)
      const mTime = line.match(/^[\[(]?(\d{1,2}:\d{2}(?::\d{2})?)[\])]?\s*[-–:]?\s*(.*)$/);
      if (mTime) {
        t = this.parseSeconds(mTime[1]);
        x = mTime[2].trim();
      }

      // Detectar hablante tipo "Practicante: ..." o "E1: ..."
      const mSpeaker = x.match(/^([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ ._-]{1,30}):\s*(.*)$/);
      if (mSpeaker) {
        h = mSpeaker[1].trim();
        x = mSpeaker[2].trim();
      }

      lines.push({ t, h, x });
    });

    // Si el texto vino sin saltos de línea (como dictado continuo), dividir por oraciones
    if (lines.length <= 1 && text.length > 200) {
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      return sentences.map((s, i) => ({
        t: i * 8, // marcas estimadas cada 8 segundos
        h: i % 3 === 0 ? "Practicante" : "Estudiante",
        x: s.trim()
      }));
    }

    return lines;
  },

  parseSeconds(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.split(':').map(Number);
    if (parts.some(isNaN)) return null;
    return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  },

  bindChatEvents() {
    const btnIniciar = document.getElementById('btn-iniciar-chat-reflexion');
    if (btnIniciar) {
      btnIniciar.addEventListener('click', async () => {
        btnIniciar.disabled = true;
        try {
          await window.API.enviarTurnoReflexion(this.state.currentInterv.intervencion.id, '');
          await this.abrirIntervencion(this.state.currentInterv.intervencion.id);
          this.state.tab = 'reflexion';
          this.render();
        } catch (e) {
          alert(e.message);
        }
      });
    }

    const btnEnviar = document.getElementById('btn-enviar-chat-reflexion');
    const input = document.getElementById('chat-input-text');
    if (btnEnviar && input) {
      const enviar = async () => {
        const text = input.value.trim();
        if (!text) return;
        btnEnviar.disabled = true;
        input.value = '';
        try {
          await window.API.enviarTurnoReflexion(this.state.currentInterv.intervencion.id, text);
          await this.abrirIntervencion(this.state.currentInterv.intervencion.id);
          this.state.tab = 'reflexion';
          this.render();
          const box = document.getElementById('chat-messages-container');
          if (box) box.scrollTop = box.scrollHeight;
        } catch (e) {
          alert(e.message);
        }
      };

      btnEnviar.addEventListener('click', enviar);
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault();
          enviar();
        }
      });
    }

    // Botón para citar minuto de audio
    const btnCitarMinuto = document.getElementById('btn-citar-minuto-audio');
    if (btnCitarMinuto && input) {
      btnCitarMinuto.addEventListener('click', () => {
        const time = window.AudioPlayer.getCurrentTimeFormatted();
        input.value += ` en el minuto ${time} `;
        input.focus();
      });
    }

    // Generar y Aprobar Borrador
    const btnGenBorrador = document.getElementById('btn-generar-borrador-reflexion');
    if (btnGenBorrador) {
      btnGenBorrador.addEventListener('click', async () => {
        btnGenBorrador.disabled = true;
        try {
          await window.API.generarBorrador(this.state.currentInterv.intervencion.id);
          await this.abrirIntervencion(this.state.currentInterv.intervencion.id);
          this.state.tab = 'reflexion';
          this.render();
        } catch (e) {
          alert(e.message);
        }
      });
    }

    const btnAprobarBorrador = document.getElementById('btn-aprobar-borrador-reflexion');
    if (btnAprobarBorrador) {
      btnAprobarBorrador.addEventListener('click', async () => {
        btnAprobarBorrador.disabled = true;
        const borrador = [];
        document.querySelectorAll('[data-borrador-idx]').forEach(ta => {
          borrador[Number(ta.dataset.borradorIdx)] = ta.value;
        });
        try {
          await window.API.aprobarBorrador(this.state.currentInterv.intervencion.id, borrador);
          this.state.notice = '¡Borrador de reflexión aprobado exitosamente! Quedó anclado en tu reporte para la revisión del formador.';
          await this.abrirIntervencion(this.state.currentInterv.intervencion.id);
          this.state.tab = 'reflexion';
          this.render();
        } catch (e) {
          alert(e.message);
        }
      });
    }
  },

  async openConfigModal(customMessage = null) {
    const modalContainer = document.getElementById('modal-container');
    if (!modalContainer) return;

    let currentCfg = { provider: 'gemini', configured: false, maskedKey: '' };
    try {
      currentCfg = await window.API.getTranscriptionSettings();
    } catch (e) {
      console.error('Error al cargar configuración de transcripción', e);
    }

    modalContainer.innerHTML = `
      <div class="modal-overlay" id="modal-config-ia-overlay">
        <div class="modal-card" style="max-width: 620px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h2 style="font-size:1.35rem; margin:0; color:var(--board);">⚙️ Configuración de Transcripción con IA</h2>
            <button class="btn secondary min" id="btn-close-modal-config" style="padding:4px 10px; font-weight:700;">✕</button>
          </div>

          ${customMessage ? `
            <div style="background:#FFF9E6; border-left:4px solid var(--marker); padding:12px 16px; border-radius:4px; font-size:0.9rem; color:#785800;">
              <b>Información:</b> ${this.escapeHtml(customMessage)}
            </div>
          ` : `
            <p style="font-size:0.92rem; color:var(--muted); margin:0;">
              Observa-Retro permite transcribir automáticamente grabaciones de aula (.mp3, .m4a, .wav) detectando turnos de habla, marcas de tiempo [mm:ss] y discriminación docente/estudiante.
            </p>
          `}

          <form id="form-config-ia" style="display:grid; gap:16px;">
            <label style="font-weight:600; font-size:0.9rem;">
              Motor de Transcripción
              <select id="cfg-provider" class="form-control" style="margin-top:6px;">
                <option value="gemini" ${currentCfg.provider === 'gemini' ? 'selected' : ''}>Google Gemini 2.0 Flash (Multimodal nativo, recomendado)</option>
                <option value="whisper_groq" ${currentCfg.provider === 'whisper_groq' || currentCfg.provider === 'groq' ? 'selected' : ''}>Groq Whisper-large-v3 (Ultra alta velocidad)</option>
                <option value="whisper_openai" ${currentCfg.provider === 'whisper_openai' || currentCfg.provider === 'openai' ? 'selected' : ''}>OpenAI Whisper-1 (Estándar OpenAI)</option>
                <option value="demo" ${currentCfg.provider === 'demo' ? 'selected' : ''}>Modo Demostración / Simulación de aula (Sin API Key)</option>
              </select>
            </label>

            <label style="font-weight:600; font-size:0.9rem;" id="cfg-key-label">
              Clave API (API Key)
              <div style="font-size:0.8rem; font-weight:normal; color:var(--muted); margin-bottom:4px;">
                ${currentCfg.configured ? `Estado actual: <b style="color:var(--success);">Configurada</b> (${currentCfg.maskedKey})` : '<b style="color:var(--contra);">No configurada aún</b>'}
              </div>
              <input type="password" id="cfg-api-key" class="form-control" placeholder="${currentCfg.configured ? 'Escribe una nueva clave solo si deseas cambiarla' : 'Pega tu API Key aquí'}" autocomplete="off">
            </label>

            <div style="background:var(--board-soft); border:1px solid rgba(27,73,67,0.15); border-radius:6px; padding:12px; font-size:0.84rem; line-height:1.45; color:var(--board);">
              <b>💡 ¿Cómo funciona la transcripción automática?</b>
              <ul style="margin:6px 0 0 18px; padding:0;">
                <li><b>Gemini (Recomendado):</b> Admite el archivo de audio directamente sin necesidad de preprocesamiento, identificando turnos de habla y marcas de tiempo exactas. Clave gratuita en <a href="https://aistudio.google.com" target="_blank" rel="noopener" style="color:var(--board); text-decoration:underline;">Google AI Studio</a>.</li>
                <li><b>Groq Whisper:</b> Ofrece velocidad casi instantánea con el modelo Whisper-large-v3 (claves gratuitas en <a href="https://console.groq.com" target="_blank" rel="noopener" style="color:var(--board); text-decoration:underline;">console.groq.com</a>).</li>
                <li><b>Modo Demostración:</b> Permite probar todo el flujo pedagógico (audio, sincronización de reproductor, citas y análisis) sin requerir ninguna clave externa.</li>
              </ul>
            </div>

            <div id="cfg-status-msg" style="font-size:0.9rem; font-weight:600;"></div>

            <div class="row" style="justify-content:flex-end; gap:10px; margin-top:6px;">
              <button type="button" class="btn secondary" id="btn-cancel-modal-config">Cerrar</button>
              <button type="submit" class="btn" id="btn-save-modal-config">Guardar configuración</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const overlay = document.getElementById('modal-config-ia-overlay');
    const closeBtn = document.getElementById('btn-close-modal-config');
    const cancelBtn = document.getElementById('btn-cancel-modal-config');
    const form = document.getElementById('form-config-ia');
    const statusMsg = document.getElementById('cfg-status-msg');

    const closeModal = () => {
      modalContainer.innerHTML = '';
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const provider = document.getElementById('cfg-provider').value;
      const apiKey = document.getElementById('cfg-api-key').value.trim();

      if (provider !== 'demo' && !apiKey && !currentCfg.configured) {
        statusMsg.style.color = 'var(--contra)';
        statusMsg.textContent = 'Por favor ingresa una API Key válida o selecciona el "Modo Demostración".';
        return;
      }

      statusMsg.style.color = 'var(--board)';
      statusMsg.textContent = 'Guardando configuración...';

      try {
        await window.API.saveTranscriptionSettings(provider, apiKey || (currentCfg.configured ? currentCfg.maskedKey : ''));
        statusMsg.style.color = 'var(--success)';
        statusMsg.textContent = '✓ Configuración guardada correctamente.';
        setTimeout(() => {
          closeModal();
        }, 1000);
      } catch (err) {
        statusMsg.style.color = 'var(--contra)';
        statusMsg.textContent = `Error: ${err.message}`;
      }
    });
  },

  getEpColor(tipo) {
    const map = {
      presentacion_tarea: '#3E7CB1',
      explicacion: '#2F6F64',
      discusion: '#C9A227',
      trabajo_estudiantes: '#86A98B',
      error: '#8E5572',
      retroalimentacion: '#4F5FA8',
      cierre: '#1D3B4F'
    };
    return map[tipo] || '#8A9695';
  },

  formatFecha(d) {
    if (!d) return 'Sin fecha';
    const [y, m, day] = d.slice(0, 10).split('-');
    return `${day}/${m}/${y}`;
  },

  escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
