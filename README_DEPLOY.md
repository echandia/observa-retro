# Guía de Despliegue en la Nube · Observa-Retro

## 1. ¿Por qué este proyecto no se puede subir únicamente a Netlify?

Tus otros proyectos en **Netlify** probablemente son páginas web estáticas (HTML, CSS y JavaScript frontend). 

**Observa-Retro**, en cambio, es una plataforma **Full-Stack completa** con requerimientos especiales:
1. **Base de Datos Persistente SQLite (`observa_retro.db`)**: En Netlify el sistema de archivos es efímero y de solo lectura. Netlify no tiene disco persistente; cualquier usuario registrado, audio subido o transcripción se borraría al recargar.
2. **Streaming de Audio con Rango HTTP (206 Partial Content)**: El reproductor de audio sincronizado necesita leer archivos de 20 a 40 MB en bloques por segundo.
3. **Transcripción Multi-Pase con Inteligencia Artificial**: Analizar una clase real de 45 a 86 minutos con Gemini toma entre 40 y 90 segundos. Las funciones gratuitas de Netlify tienen un límite estricto de **10 segundos**, por lo que fallarían por *timeout*.

---

## 2. La Solución Recomendada: Render.com (Gratuito y diseñado para Node.js)

**Render.com** es la alternativa moderna a Netlify para aplicaciones Node.js con base de datos:
- Es **100% gratuito**.
- Se conecta a tu cuenta de **GitHub** en 1 clic (igual que Netlify).
- Cada vez que hagas `git push`, Render recompila y actualiza tu sitio automáticamente.
- Ya dejamos preparado el archivo `render.yaml` y la configuración de `Node >= 22.5.0` en el proyecto.

### Pasos para desplegar en Render:

#### Paso 1: Subir el proyecto a tu GitHub
1. Abre tu terminal o GitHub Desktop.
2. Inicializa y sube el repositorio:
   ```bash
   git init
   git add .
   git commit -m "Plataforma Observa-Retro inicial"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/observa-retro.git
   git push -u origin main
   ```

#### Paso 2: Crear el servicio en Render
1. Entra a [render.com](https://render.com) e inicia sesión con tu cuenta de GitHub.
2. Haz clic en **"New +"** $\rightarrow$ **"Web Service"**.
3. Selecciona tu repositorio `observa-retro`.
4. Render detectará automáticamente la configuración:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. En **Environment Variables**, agrega:
   - `NODE_VERSION` = `22.12.0`
6. Haz clic en **"Create Web Service"**.
7. En unos 2 minutos tendrás tu enlace público activo, por ejemplo:
   👉 `https://observa-retro.onrender.com`

---

## 3. ¿Quieres tener el Frontend en Netlify y el Backend en Render? (Arquitectura Híbrida)

Si necesitas que tus usuarios ingresen a través de una URL de Netlify:
1. Despliegas el servidor en **Render** (para la base de datos SQLite y las transcripciones con IA).
2. En Netlify subes la carpeta `public/` y configuras un archivo `_redirects` para que las llamadas `/api/*` apunten a tu URL de Render:
   ```text
   /api/*  https://observa-retro.onrender.com/api/:splat  200
   /*      /index.html                                   200
   ```
De esta forma tus usuarios verán el dominio de Netlify mientras el servidor de Render se encarga del cómputo pesado.

---

## 4. Otra Alternativa Excelente: Railway.app
- Entra a [railway.app](https://railway.app).
- Haz clic en **"Deploy from GitHub repo"**.
- Detecta Node.js 22 automáticamente y te genera una URL pública en 1 clic.
