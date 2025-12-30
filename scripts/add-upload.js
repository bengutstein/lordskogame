const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const dataFile = path.join(rootDir, 'data', 'uploads.json');
const uploadsDir = path.join(rootDir, 'public', 'uploads');

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) return null;
  return process.argv[index + 1];
}

function exitWithMessage(message) {
  console.error(message);
  process.exit(1);
}

function normalizeUploader(name) {
  if (!name) return null;
  const lowered = name.trim().toLowerCase();
  if (lowered === 'ben' || lowered === 'jake') return lowered[0].toUpperCase() + lowered.slice(1);
  return name.trim();
}

function ensureDataFile() {
  if (!fs.existsSync(dataFile)) {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(dataFile, '[]', 'utf8');
  }
}

function ensureUploadsDir() {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

function parseArgs() {
  const uploaderRaw = getArg('--uploader') || getArg('-u');
  const latRaw = getArg('--lat') || getArg('--latitude') || getArg('-lat');
  const lngRaw = getArg('--lng') || getArg('--lon') || getArg('--longitude') || getArg('-lng');
  const photoPath = getArg('--photo') || getArg('--path') || getArg('-p');

  const uploader = normalizeUploader(uploaderRaw);
  if (!uploader) exitWithMessage('Missing uploader. Pass --uploader Ben|Jake');

  const lat = parseFloat(latRaw);
  const lng = parseFloat(lngRaw);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    exitWithMessage('Latitude and longitude must be numbers. Example: --lat 40.7128 --lng -74.0060');
  }

  if (!photoPath) exitWithMessage('Missing photo path. Pass --photo /full/path/to/image.jpg');

  const resolvedPhoto = path.resolve(photoPath);
  if (!fs.existsSync(resolvedPhoto)) {
    exitWithMessage(`Photo not found at ${resolvedPhoto}`);
  }

  return { uploader, lat, lng, photoPath: resolvedPhoto };
}

function loadUploads() {
  ensureDataFile();
  const raw = fs.readFileSync(dataFile, 'utf8');
  try {
    return JSON.parse(raw || '[]');
  } catch (err) {
    exitWithMessage('uploads.json is corrupted. Please fix or reset it.');
  }
}

function saveUploads(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
}

function addUpload({ uploader, lat, lng, photoPath }) {
  ensureUploadsDir();

  const ext = path.extname(photoPath);
  const destName = `${Date.now()}_${path.basename(photoPath).replace(/\s+/g, '_')}`;
  const destPath = path.join(uploadsDir, destName);

  fs.copyFileSync(photoPath, destPath);

  const uploads = loadUploads();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    uploader,
    lat,
    lng,
    address: '',
    image: `/uploads/${destName}`,
    originalPath: photoPath,
    createdAt: new Date().toISOString()
  };

  uploads.push(entry);
  saveUploads(uploads);

  console.log(`Added upload for ${uploader} at (${lat}, ${lng}) -> ${entry.image}`);
}

addUpload(parseArgs());
