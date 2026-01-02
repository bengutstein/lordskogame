const path = require('path');

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
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif'
};

function mimeFromFilename(name) {
  const ext = path.extname(name || '').toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
}

function isHeic(name, mimeType) {
  const ext = (path.extname(name || '') || '').toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();
  return ext === '.heic' || ext === '.heif' || lowerMime.includes('heic') || lowerMime.includes('heif');
}

async function convertHeicToJpeg(buffer) {
  try {
    const convert = require('heic-convert');
    const out = await convert({
      buffer,
      format: 'JPEG',
      quality: 0.85
    });
    return Buffer.from(out);
  } catch (err) {
    const sharp = require('sharp');
    return sharp(buffer, { limitInputPixels: false }).jpeg({ quality: 85 }).toBuffer();
  }
}

function isWithinNYC(lat, lng) {
  // Rough NYC bounding box to avoid obviously wrong geocodes.
  return lat >= 40.4774 && lat <= 40.9176 && lng >= -74.2591 && lng <= -73.7004;
}

function normalizeAddress(address) {
  const trimmed = (address || '').trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed) return '';
  if (lower.includes('ny') || lower.includes('new york')) {
    return trimmed;
  }
  return `${trimmed}, New York City, NY`;
}

async function geocodeAddress(address) {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    throw new Error('Missing address');
  }
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

async function readRequestBuffer(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function parseMultipart(buffer, boundary) {
  const parts = buffer
    .toString('binary')
    .split(boundary)
    .filter((p) => p.trim() && p.trim() !== '--');

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

  return { fields, fileName, fileContent };
}

async function loadUploadsFromBlob() {
  const { head, list } = await import('@vercel/blob');
  const fetchBlob = async (blob) => {
    if (!blob || !blob.url) return [];
    const res = await fetch(blob.url);
    if (!res.ok) throw new Error('Failed to read uploads data');
    return res.json();
  };

  try {
    const { blob } = await head('data/uploads.json');
    if (blob) {
      return fetchBlob(blob);
    }
  } catch (err) {
    const status = err && (err.status || err.statusCode);
    const message = err && err.message ? err.message.toLowerCase() : '';
    const notFound =
      err &&
      (err.code === 'not_found' ||
        status === 404 ||
        message.includes('not found') ||
        message.includes('does not exist'));
    if (!notFound) {
      throw err;
    }
  }

  // Fallback: if the file had a random suffix from earlier writes, grab the latest.
  const { blobs } = await list({ prefix: 'data/uploads.json' });
  const latest = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
  if (!latest) return [];
  return fetchBlob(latest);
}

async function saveUploadsToBlob(uploads) {
  const { put } = await import('@vercel/blob');
  await put('data/uploads.json', JSON.stringify(uploads, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false
  });
}

module.exports = {
  geocodeAddress,
  normalizeAddress,
  readRequestBuffer,
  parseMultipart,
  mimeFromFilename,
  isHeic,
  convertHeicToJpeg,
  loadUploadsFromBlob,
  saveUploadsToBlob
};
