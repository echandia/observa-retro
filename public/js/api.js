/**
 * API Client para Observa-Retro
 */

const API = {
  token: localStorage.getItem('observa_token') || '',

  setToken(t) {
    this.token = t || '';
    if (t) localStorage.setItem('observa_token', t);
    else localStorage.removeItem('observa_token');
  },

  async request(endpoint, options = {}) {
    const headers = options.headers || {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    if (!(options.body instanceof FormData) && !(options.body instanceof Blob) && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    options.headers = headers;

    const res = await fetch(endpoint, options);
    if (res.status === 401 && !endpoint.includes('/api/auth/login')) {
      this.setToken('');
      window.dispatchEvent(new CustomEvent('auth-expired'));
      throw new Error('Sesión expirada');
    }
    if (!res.ok) {
      let msg = 'Error en el servidor';
      try {
        const errJson = await res.json();
        msg = errJson.error || msg;
      } catch (e) {}
      throw new Error(msg);
    }
    return await res.json();
  },

  // Auth
  async login(email, password) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    this.setToken(data.token);
    return data;
  },

  async logout() {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    this.setToken('');
  },

  async getMe() {
    return await this.request('/api/auth/me');
  },

  async getPracticantes() {
    return await this.request('/api/users/practicantes');
  },

  async getCursosEstudiantes() {
    return await this.request('/api/cursos/estudiantes');
  },

  async subirListaExcel(file) {
    const headers = {
      'x-filename': encodeURIComponent(file.name)
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch('/api/cursos/subir-excel', {
      method: 'POST',
      headers,
      body: file
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al subir nómina de curso');
    }
    return await res.json();
  },

  // Intervenciones
  async getIntervenciones(studentId) {
    const url = studentId ? `/api/intervenciones?studentId=${encodeURIComponent(studentId)}` : '/api/intervenciones';
    return await this.request(url);
  },

  async getIntervencion(id) {
    return await this.request(`/api/intervenciones/${id}`);
  },

  async createIntervencion(payload) {
    return await this.request('/api/intervenciones', {
      method: 'POST',
      body: payload
    });
  },

  async deleteIntervencion(id) {
    return await this.request(`/api/intervenciones/${id}`, {
      method: 'DELETE'
    });
  },

  // Subida de Archivos
  async uploadAudio(intervencionId, file) {
    const headers = {
      'Content-Type': file.type || 'audio/mpeg',
      'x-filename': encodeURIComponent(file.name)
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch(`/api/upload/audio/${intervencionId}`, {
      method: 'POST',
      headers,
      body: file
    });
    if (!res.ok) throw new Error('Error al subir archivo de audio');
    return await res.json();
  },

  async uploadDocumento(file) {
    const headers = {
      'x-filename': encodeURIComponent(file.name)
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch('/api/upload/documento', {
      method: 'POST',
      headers,
      body: file
    });
    if (!res.ok) throw new Error('Error al procesar documento');
    return await res.json();
  },

  // Transcripción Automática de Audio
  async getTranscriptionSettings() {
    return await this.request('/api/settings/transcription');
  },

  async saveTranscriptionSettings(provider, apiKey) {
    return await this.request('/api/settings/transcription', {
      method: 'POST',
      body: { provider, apiKey }
    });
  },

  async transcribirAudioFile(file) {
    const headers = {
      'Content-Type': file.type || 'audio/mpeg',
      'x-filename': encodeURIComponent(file.name)
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch('/api/transcribir-audio', {
      method: 'POST',
      headers,
      body: file
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al transcribir audio');
    }
    return await res.json();
  },

  async transcribirIntervencionAudio(intervencionId) {
    return await this.request('/api/transcribir-audio', {
      method: 'POST',
      body: { intervencionId }
    });
  },

  // Audios de Prueba del Proyecto
  async getAudiosPrueba() {
    return await this.request('/api/audios-prueba');
  },

  async cargarAudioPrueba(filename, intervencionId = null) {
    return await this.request('/api/audios-prueba/cargar', {
      method: 'POST',
      body: { filename, intervencionId }
    });
  },

  async transcribirAudioPrueba(filename) {
    return await this.request('/api/transcribir-audio', {
      method: 'POST',
      body: { audioPrueba: filename }
    });
  },

  // Análisis
  async analizar(id) {
    return await this.request(`/api/intervenciones/${id}/analizar`, {
      method: 'POST'
    });
  },

  // Reflexión con Chatbot
  async enviarTurnoReflexion(id, mensaje) {
    return await this.request(`/api/intervenciones/${id}/reflexion/turno`, {
      method: 'POST',
      body: { mensaje }
    });
  },

  async generarBorrador(id) {
    return await this.request(`/api/intervenciones/${id}/reflexion/borrador`, {
      method: 'POST'
    });
  },

  async aprobarBorrador(id, borrador) {
    return await this.request(`/api/intervenciones/${id}/reflexion/aprobar`, {
      method: 'POST',
      body: { borrador }
    });
  },

  // Revisión Académica
  async guardarRevision(id, payload) {
    return await this.request(`/api/intervenciones/${id}/revision`, {
      method: 'POST',
      body: payload
    });
  },

  async guardarComentarioEstudiante(id, comentario) {
    return await this.request(`/api/intervenciones/${id}/comentario-estudiante`, {
      method: 'POST',
      body: { comentario }
    });
  },

  // Evaluación del Avance Reflexivo
  async getRubricaReflexion() {
    return await this.request('/api/evaluacion-reflexiva/rubrica');
  },

  async guardarEvaluacionReflexiva(id, payload) {
    return await this.request(`/api/intervenciones/${id}/evaluacion-reflexiva`, {
      method: 'POST',
      body: payload
    });
  },

  async getTrayectoriaReflexiva(studentId) {
    return await this.request(`/api/estudiantes/${studentId}/trayectoria-reflexiva`);
  }
};

window.API = API;
