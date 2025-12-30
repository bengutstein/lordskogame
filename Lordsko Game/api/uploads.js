const { loadUploadsFromBlob } = require('./utils');

function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  try {
    const uploads = await loadUploadsFromBlob();
    return sendJson(res, 200, uploads);
  } catch (err) {
    console.error('Failed to load uploads', err);
    return sendJson(res, 500, { error: 'Failed to load uploads' });
  }
};
