const {
  geocodeAddress,
  readRequestBuffer,
  parseMultipart,
  mimeFromFilename,
  loadUploadsFromBlob,
  saveUploadsToBlob
} = require('./utils');

function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch) {
    return sendJson(res, 400, { error: 'Missing multipart boundary' });
  }
  const boundaryValue = boundaryMatch[1].replace(/^"|"$/g, '');
  const boundary = `--${boundaryValue}`;

  try {
    const buffer = await readRequestBuffer(req);
    const { fields, fileName, fileContent } = parseMultipart(buffer, boundary);

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

    if (!uploader || !fileContent) {
      return sendJson(res, 400, { error: 'Missing uploader or file' });
    }

    async function resolveLocation() {
      if (!Number.isNaN(latField) && !Number.isNaN(lngField)) {
        return { lat: latField, lng: lngField, address: address || '' };
      }
      return geocodeAddress(address);
    }

    const { lat, lng, address: resolvedAddress } = await resolveLocation();
    const safeName = fileName ? fileName.replace(/\s+/g, '_') : 'upload.bin';
    const destName = `${Date.now()}_${safeName}`;
    const mimeType = mimeFromFilename(fileName);

    const { put } = await import('@vercel/blob');
    const uploaded = await put(`uploads/${destName}`, fileContent, {
      access: 'public',
      contentType: mimeType
    });

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      uploader: normalizedUploader,
      lat,
      lng,
      address: resolvedAddress || address || '',
      image: uploaded.url,
      originalPath: `(browser-uploaded) ${fileName || 'upload.bin'}`,
      createdAt: new Date().toISOString()
    };

    const uploads = await loadUploadsFromBlob();
    uploads.push(entry);
    await saveUploadsToBlob(uploads);
    return sendJson(res, 200, entry);
  } catch (err) {
    console.error('Upload failed', err);
    const message = err && err.message ? err.message : 'Upload failed';
    return sendJson(res, 400, { error: message });
  }
};
