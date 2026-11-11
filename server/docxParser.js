import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const scriptPath = join(__dirname, '..', 'scripts', 'extract_docx.py');

export function extractTextFromDocument(filePath) {
  return new Promise((resolve, reject) => {
    execFile('python3', [scriptPath, filePath], { maxBuffer: 15 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (!error && stdout && stdout.trim().length > 0) {
        return resolve(stdout.trim());
      }

      // Fallback nativo Node en caso de que python falle
      try {
        const ext = extname(filePath).toLowerCase();
        if (ext === '.pdf') {
          const buf = readFileSync(filePath);
          const pdfText = extractTextFromPdfBuffer(buf);
          if (pdfText) return resolve(pdfText);
        } else if (ext === '.txt' || ext === '.md') {
          return resolve(readFileSync(filePath, 'utf-8'));
        }
      } catch (_) {}

      if (error) {
        return reject(new Error(`Error al procesar documento: ${stderr || error.message}`));
      }
      resolve((stdout || '').trim());
    });
  });
}

function extractTextFromPdfBuffer(buffer) {
  let text = '';
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  const raw = buffer.toString('binary');
  let match;
  while ((match = streamRegex.exec(raw)) !== null) {
    const streamData = Buffer.from(match[1], 'binary');
    let uncompressed;
    try {
      uncompressed = inflateSync(streamData).toString('latin1');
    } catch (_) {
      try { uncompressed = streamData.toString('latin1'); } catch (_) { continue; }
    }
    if (!uncompressed) continue;

    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let m;
    while ((m = tjRegex.exec(uncompressed)) !== null) {
      text += m[1] + ' ';
    }
    const tjArrRegex = /\[(.*?)\]\s*TJ/g;
    while ((m = tjArrRegex.exec(uncompressed)) !== null) {
      const parts = m[1].match(/\(([^)]*)\)/g);
      if (parts) {
        text += parts.map(p => p.slice(1, -1)).join('') + ' ';
      }
    }
    text += '\n';
  }
  return text
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\')
    .trim();
}

export const extractTextFromDocx = extractTextFromDocument;
