/**
 * Reproductor de Audio Sincronizado para Observa-Retro
 */

const AudioPlayer = {
  element: null,
  container: null,
  currentId: null,
  activeLineIndex: null,

  init() {
    this.element = document.getElementById('global-audio');
    this.container = document.getElementById('audiobar-fixed');

    if (!this.element) return;

    this.element.addEventListener('timeupdate', () => {
      this.handleTimeUpdate();
    });

    this.element.addEventListener('error', () => {
      console.warn('Audio error o formato no soportado');
    });
  },

  loadAudio(intervencionId, filename) {
    if (!this.element) return;
    this.currentId = intervencionId;
    this.element.src = `/api/audio/${intervencionId}`;
    this.element.load();
    if (this.container) {
      this.container.hidden = false;
      const titleEl = document.getElementById('audio-title-display');
      if (titleEl) titleEl.textContent = filename || 'Grabación de aula';
    }
  },

  unloadAudio() {
    if (!this.element) return;
    this.element.pause();
    this.element.removeAttribute('src');
    this.element.load();
    if (this.container) this.container.hidden = true;
    this.currentId = null;
    this.clearHighlight();
  },

  seekTo(seconds) {
    if (!this.element || !this.element.src) return;
    try {
      this.element.currentTime = Math.max(0, seconds);
      this.element.play().catch(() => {});
    } catch (e) {}
  },

  getCurrentTimeFormatted() {
    if (!this.element) return '00:00';
    return this.formatSeconds(this.element.currentTime || 0);
  },

  formatSeconds(s) {
    s = Math.max(0, Math.floor(s || 0));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    const p = n => String(n).padStart(2, '0');
    return `${p(m)}:${p(sec)}`;
  },

  handleTimeUpdate() {
    const curTime = this.element.currentTime;
    if (window.currentInterventionLines && window.currentInterventionLines.length) {
      let activeIndex = -1;
      const lines = window.currentInterventionLines;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].t != null && lines[i].t <= curTime) {
          activeIndex = i;
        } else if (lines[i].t != null && lines[i].t > curTime) {
          break;
        }
      }
      if (activeIndex !== this.activeLineIndex) {
        this.highlightLine(activeIndex);
      }
    }
  },

  highlightLine(index) {
    this.clearHighlight();
    this.activeLineIndex = index;
    if (index >= 0) {
      const el = document.getElementById(`line-${index + 1}`);
      if (el) {
        el.classList.add('playing-now');
        const box = document.getElementById('transcript-box');
        if (box) {
          const top = el.offsetTop - box.offsetTop - 80;
          box.scrollTo({ top, behavior: 'smooth' });
        }
      }
    }
  },

  clearHighlight() {
    document.querySelectorAll('.trans-line.playing-now').forEach(el => {
      el.classList.remove('playing-now');
    });
    this.activeLineIndex = null;
  }
};

window.AudioPlayer = AudioPlayer;
