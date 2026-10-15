import { createReadStream, statSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';

const MIME_TYPES = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac'
};

export function getAudioMimeType(filename) {
  const ext = extname(filename).toLowerCase();
  return MIME_TYPES[ext] || 'audio/mpeg';
}

export function streamAudioFile(filePath, req, res) {
  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Archivo de audio no encontrado' }));
    return;
  }

  const stat = statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const mimeType = getAudioMimeType(filePath);

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`
      });
      res.end();
      return;
    }

    const chunksize = (end - start) + 1;
    const stream = createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': mimeType,
      'Cache-Control': 'no-cache'
    });

    stream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes'
    });
    createReadStream(filePath).pipe(res);
  }
}
