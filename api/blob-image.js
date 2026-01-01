module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const target = req.query.url || req.query.u;
  if (!target || typeof target !== 'string') {
    return res.status(400).json({ error: 'Missing url' });
  }

  // Only proxy Vercel Blob public URLs for safety.
  const allowedHost = '.public.blob.vercel-storage.com/';
  if (!target.startsWith('https://') || !target.includes(allowedHost)) {
    return res.status(400).json({ error: 'Invalid blob url' });
  }

  try {
    const upstream = await fetch(target);
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'Blob fetch failed' });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('Blob proxy failed', err);
    return res.status(500).json({ error: 'Proxy failed' });
  }
};
