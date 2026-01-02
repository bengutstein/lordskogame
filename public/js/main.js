const NYC_COORDS = [40.7128, -74.006];
const markersLayer = L.layerGroup();

const map = L.map('map', {
  zoomControl: true
}).setView(NYC_COORDS, 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

markersLayer.addTo(map);

const refreshBtn = document.getElementById('refresh-btn');
const leaderboardContent = document.getElementById('leaderboard-content');
const recentList = document.getElementById('recent-list');
const recentEmpty = document.getElementById('recent-empty');
const uploadForm = document.getElementById('upload-form');
const uploadBtn = document.getElementById('upload-btn');
const uploadStatus = document.getElementById('upload-status');

function formatDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function popupTemplate(upload) {
  const time = formatDate(upload.createdAt);
  const locationText = upload.address && upload.address.trim().length
    ? upload.address
    : `Lat ${Number(upload.lat).toFixed(4)}, Lng ${Number(upload.lng).toFixed(4)}`;
  return `
    <div>
      <img class="popup-image" src="${upload.image}" alt="Uploaded by ${upload.uploader}" />
      <div class="popup-meta">
        <strong>${upload.uploader || 'Unknown'}</strong>
        <span>${time}</span>
        <span>${locationText}</span>
      </div>
    </div>
  `;
}

function renderMarkers(uploads) {
  markersLayer.clearLayers();

  if (!uploads || uploads.length === 0) {
    return;
  }

  uploads.forEach((upload) => {
    const lower = (upload.uploader || '').toLowerCase();
    const pinClass = lower === 'ben' ? 'ben' : lower === 'jake' ? 'jake' : 'other';
    const imgSrc = upload.imageProxy || upload.image;
    const icon = L.divIcon({
      className: 'photo-marker',
      html: `<div class="photo-pin ${pinClass}"><img src="${imgSrc}" alt="${upload.uploader || 'Upload'}" /></div>`,
      iconSize: [42, 42],
      iconAnchor: [21, 21],
      popupAnchor: [0, -16]
    });
    const marker = L.marker([upload.lat, upload.lng], { icon });
    marker.bindPopup(popupTemplate(upload));
    markersLayer.addLayer(marker);
  });
}

function buildSummary(uploads) {
  const summary = {};
  uploads.forEach((upload) => {
    const name = upload.uploader || 'Unknown';
    if (!summary[name]) {
      summary[name] = { name, count: 0, uploads: [] };
    }
    summary[name].count += 1;
    summary[name].uploads.push(upload);
  });
  return Object.values(summary).sort((a, b) => b.count - a.count);
}

function renderLeaderboard(uploads) {
  const groups = buildSummary(uploads);
  if (!groups.length) {
    leaderboardContent.textContent = 'No uploads yet.';
    leaderboardContent.className = 'empty';
    return;
  }

  leaderboardContent.innerHTML = '';
  leaderboardContent.className = '';

  groups.forEach((group, idx) => {
    const row = document.createElement('div');
    row.className = 'stat';
    const badge = document.createElement('span');
    const lowered = group.name.toLowerCase();
    badge.className = `badge ${lowered === 'ben' ? 'ben' : lowered === 'jake' ? 'jake' : 'other'}`;
    badge.textContent = group.name;

    const count = document.createElement('span');
    count.textContent = `${group.count} upload${group.count === 1 ? '' : 's'}`;

    const position = document.createElement('span');
    position.className = 'pill';
    position.textContent = idx === 0 ? 'Leading' : ' ';
    if (idx !== 0) {
      position.style.visibility = 'hidden';
    }
    row.appendChild(position);

    row.appendChild(badge);
    row.appendChild(count);
    leaderboardContent.appendChild(row);
  });
}

function renderRecents(uploads) {
  const sorted = [...uploads].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4);
  recentList.innerHTML = '';

  if (!sorted.length) {
    recentEmpty.style.display = 'block';
    return;
  }

  recentEmpty.style.display = 'none';

  sorted.forEach((upload) => {
    const item = document.createElement('li');
    item.className = 'recent-item';

    const meta = document.createElement('div');
    meta.className = 'recent-meta';

    const badge = document.createElement('span');
    const lowered = (upload.uploader || '').toLowerCase();
    badge.className = `badge ${lowered === 'ben' ? 'ben' : lowered === 'jake' ? 'jake' : 'other'}`;
    badge.textContent = upload.uploader || 'Unknown';

    const time = document.createElement('span');
    time.className = 'pill';
    time.textContent = formatDate(upload.createdAt);

    meta.appendChild(badge);
    meta.appendChild(time);

    const location = document.createElement('div');
    location.className = 'recent-location';
    if (upload.address && upload.address.trim().length) {
      location.textContent = upload.address;
    } else {
      location.textContent = `Lat ${Number(upload.lat).toFixed(4)}, Lng ${Number(upload.lng).toFixed(4)}`;
    }

    item.appendChild(meta);
    item.appendChild(location);
    recentList.appendChild(item);
  });
}

async function loadUploads() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Loading...';
  try {
    const res = await fetch('/api/uploads');
    if (!res.ok) {
      throw new Error('Failed to load uploads');
    }
    const uploads = await res.json();
    renderMarkers(uploads);
    renderLeaderboard(uploads);
    renderRecents(uploads);
  } catch (err) {
    console.error(err);
    leaderboardContent.textContent = 'Could not load uploads.';
    leaderboardContent.className = 'empty';
    recentEmpty.textContent = 'Could not load uploads.';
    recentEmpty.style.display = 'block';
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh uploads';
  }
}

refreshBtn.addEventListener('click', loadUploads);

if (uploadForm) {
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';
    uploadStatus.textContent = '';

    const formData = new FormData(uploadForm);
    const fileInput = uploadForm.querySelector('input[name="photo"]');
    const file = fileInput && fileInput.files && fileInput.files[0];
    const maxBytes = 4 * 1024 * 1024; // 4 MB safety limit for Vercel serverless.
    if (file && file.size > maxBytes) {
      uploadStatus.textContent = 'File too large (max 4MB). Choose a smaller image.';
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload';
      return;
    }
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      uploadStatus.textContent = 'Uploaded. Refreshing...';
      uploadForm.reset();
      await loadUploads();
      uploadStatus.textContent = 'Uploaded!';
    } catch (err) {
      console.error(err);
      uploadStatus.textContent = err.message || 'Upload failed';
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload';
    }
  });
}

loadUploads();
