const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const dataFile = path.join(__dirname, 'data', 'uploads.json');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function isWithinNYC(lat, lng) {
  // Rough NYC bounding box to avoid obviously wrong geocodes.
  return lat >= 40.4774 && lat <= 40.9176 && lng >= -74.2591 && lng <= -73.7004;
}

function normalizeAddress(address) {
  const trimmed = address.trim();
  const lower = trimmed.toLowerCase();
  if (lower.includes('ny') || lower.includes('new york')) {
    return trimmed;
  }
  return `${trimmed}, New York City, NY`;
}

async function geocodeAddress(address) {
  const normalized = normalizeAddress(address);
  const encoded = encodeURIComponent(normalized);
  const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encoded}`;
  const res = await fetch(geoUrl, {
    headers: { 'User-Agent': 'lordsko-game/1.0' }
  });
  if (!res.ok) throw new Error('Geocoding failed');
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('No results for that address');
  }
  const { lat, lon } = data[0];
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lon);
  if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
    throw new Error('Invalid geocode result');
  }
  if (!isWithinNYC(latNum, lngNum)) {
    throw new Error('Address appears outside NYC');
  }
  return { lat: latNum, lng: lngNum, address: normalized };
}

function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/uploads') {
    fs.readFile(dataFile, 'utf8', (err, data) => {
      if (err) {
        console.error('Failed to read uploads data', err);
        return sendJson(res, 500, { error: 'Failed to read uploads data' });
      }

      try {
        const parsed = JSON.parse(data || '[]');
        return sendJson(res, 200, parsed);
      } catch (parseErr) {
        console.error('Invalid uploads data', parseErr);
        return sendJson(res, 500, { error: 'Uploads data is corrupted' });
      }
    });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/upload') {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    if (!boundaryMatch) {
      return sendJson(res, 400, { error: 'Missing multipart boundary' });
    }
    const boundary = `--${boundaryMatch[1]}`;
    const chunks = [];

    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const parts = buffer.toString('binary').split(boundary).filter((p) => p.trim() && p.trim() !== '--');

      const fields = {};
      let fileContent = null;
      let fileName = null;

      parts.forEach((part) => {
        const [rawHeaders, rawBody] = part.split('\r\n\r\n');
        if (!rawBody) return;
        const body = rawBody.replace(/\r\n$/, '');
        const headerLines = rawHeaders.split('\r\n').filter(Boolean);
        const dispoLine = headerLines.find((h) => h.toLowerCase().startsWith('content-disposition'));
        if (!dispoLine) return;
        const nameMatch = dispoLine.match(/name="([^"]+)"/);
        if (!nameMatch) return;
        const fieldName = nameMatch[1];
        const filenameMatch = dispoLine.match(/filename="([^"]*)"/);

        if (filenameMatch && filenameMatch[1]) {
          fileName = filenameMatch[1] || 'upload.bin';
          fileContent = Buffer.from(body, 'binary');
        } else {
          fields[fieldName] = body;
        }
      });

      const uploader = (fields.uploader || '').trim();
      const address = (fields.address || '').trim();
      const latField = fields.lat ? parseFloat(fields.lat) : NaN;
      const lngField = fields.lng ? parseFloat(fields.lng) : NaN;

      const normalizedUploader = (() => {
        const lower = uploader.toLowerCase();
        if (lower === 'ben') return 'Ben';
        if (lower === 'jake') return 'Jake';
        return uploader;
      })();

      async function resolveLocation() {
        if (!Number.isNaN(latField) && !Number.isNaN(lngField)) {
          return { lat: latField, lng: lngField, address: address || '' };
        }
        if (!address) {
          throw new Error('Missing address');
        }
        return geocodeAddress(address);
      }

      if (!uploader || !fileContent) {
        return sendJson(res, 400, { error: 'Missing uploader or file' });
      }

      const ext = path.extname(fileName) || '.jpg';
      const destName = `${Date.now()}_${fileName.replace(/\s+/g, '_')}`;
      const destPath = path.join(publicDir, 'uploads', destName);

      resolveLocation()
        .then(({ lat, lng, address: resolvedAddress }) => {
          fs.mkdir(path.dirname(destPath), { recursive: true }, (dirErr) => {
            if (dirErr) {
              console.error('Failed to ensure uploads dir', dirErr);
              return sendJson(res, 500, { error: 'Failed to save file' });
            }

            fs.writeFile(destPath, fileContent, (writeErr) => {
              if (writeErr) {
                console.error('Failed to write upload', writeErr);
                return sendJson(res, 500, { error: 'Failed to save file' });
              }

              fs.readFile(dataFile, 'utf8', (readErr, data) => {
                if (readErr) {
                  console.error('Failed to read uploads', readErr);
                  return sendJson(res, 500, { error: 'Failed to read uploads' });
                }
                let uploads = [];
                try {
                  uploads = JSON.parse(data || '[]');
                } catch (parseErr) {
                  console.error('Uploads JSON corrupted', parseErr);
                  return sendJson(res, 500, { error: 'Uploads data is corrupted' });
                }

                const entry = {
                  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  uploader: normalizedUploader,
                  lat,
                  lng,
                  address: resolvedAddress || address || '',
                  image: `/uploads/${destName}`,
                  originalPath: `(browser-uploaded) ${fileName}`,
                  createdAt: new Date().toISOString()
                };

                uploads.push(entry);
                fs.writeFile(dataFile, JSON.stringify(uploads, null, 2), 'utf8', (saveErr) => {
                  if (saveErr) {
                    console.error('Failed to save uploads', saveErr);
                    return sendJson(res, 500, { error: 'Failed to persist upload' });
                  }
                  return sendJson(res, 200, entry);
                });
              });
            });
          });
        })
        .catch((err) => {
          console.error('Geocode error', err);
          return sendJson(res, 400, { error: err.message || 'Failed to locate address' });
        });
    });

    req.on('error', (err) => {
      console.error('Upload request error', err);
      sendJson(res, 500, { error: 'Upload failed' });
    });
    return true;
  }

  return false;
}

function serveStatic(res, pathname) {
  const safePath = path.normalize(path.join(publicDir, pathname));
  if (!safePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  let filePath = safePath;
  if (pathname === '/') {
    filePath = path.join(publicDir, 'index.html');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mimeType });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  const pathname = parsedUrl.pathname || '/';

  if (handleApi(req, res, pathname)) {
    return;
  }

  serveStatic(res, pathname);
});

server.listen(PORT, () => {
  console.log(`NYC photo map running at http://localhost:${PORT}`);
});
