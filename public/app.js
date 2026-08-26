'use strict';

const storeInput = document.getElementById('storeInput');
const storeList = document.getElementById('storeList');
const storeBox = document.querySelector('.select-wrap');
const templateInfo = document.getElementById('templateInfo');
const generateBtn = document.getElementById('generateBtn');
const generateLabel = document.getElementById('generateLabel');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');

let resultCsv = null;
let stores = [];
let selectedStore = '';

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = 'status show ' + (type || 'info');
}

function clearStatus() {
  statusEl.className = 'status';
  statusEl.textContent = '';
}

function setResultsVisible(visible) {
  if (visible) {
    resultsEl.innerHTML = '';
  } else {
    resultsEl.innerHTML = '<p class="side-hint">Hasil ringkasan akan muncul di sini setelah menekan tombol Generate.</p>';
  }
}

/* ---------- Load stores & template info ---------- */
async function loadStores() {
  try {
    const res = await fetch('/api/stores');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal memuat toko');

    stores = data.stores || [];
    storeInput.value = '';
    storeInput.placeholder = 'Ketik nama toko… (misal: tebet)';
    storeInput.disabled = false;
    selectedStore = '';

    if (data.templateCount > 0) {
      templateInfo.innerHTML =
        '<span class="tpl-badge">AUTO</span>' +
        '<span><span class="tpl-title">Template otomatis siap</span> — ' +
        data.templateCount +
        ' produk dari database.</span>';
    } else {
      templateInfo.innerHTML =
        '<span class="tpl-badge" style="background:#fef2f2;color:#dc2626">! </span>' +
        '<span>Template otomatis tidak tersedia.</span>';
    }

    setStatus(
      `${data.storeCount} toko dimuat. Data produk (GDT): ${data.gdtIdCount} item.`,
      'success'
    );
    updateButton();
  } catch (e) {
    storeInput.disabled = false;
    storeInput.placeholder = '— gagal memuat —';
    setStatus('Gagal memuat toko: ' + e.message, 'error');
  }
}

/* ---------- Autocomplete toko ---------- */
function canGenerate() {
  return Boolean(selectedStore);
}

function updateButton() {
  const ready = canGenerate();
  generateBtn.disabled = !ready;
  if (!ready) generateBtn.classList.remove('loading');
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

let filteredStores = [];
let highlight = -1;

function clearList() {
  filteredStores = [];
  highlight = -1;
  storeList.hidden = true;
  storeList.innerHTML = '';
}

function renderList() {
  const q = storeInput.value.trim().toLowerCase();
  filteredStores = q
    ? stores.filter((s) => s.toLowerCase().includes(q))
    : stores;
  highlight = -1;

  if (!filteredStores.length) {
    storeList.innerHTML = '<li class="empty">Tidak ada toko cocok</li>';
  } else {
    storeList.innerHTML = filteredStores
      .map((s, i) => `<li data-idx="${i}">${escapeHtml(s)}</li>`)
      .join('');
  }
  storeList.hidden = false;
}

function chooseStore(name) {
  selectedStore = name;
  storeInput.value = name;
  clearList();
  updateButton();
}

storeInput.addEventListener('input', renderList);
storeInput.addEventListener('focus', renderList);

storeList.addEventListener('mousedown', (e) => {
  const li = e.target.closest('li[data-idx]');
  if (li) {
    e.preventDefault(); // jaga agar blur tidak menutup sebelum klik
    chooseStore(filteredStores[Number(li.dataset.idx)]);
  }
});

document.addEventListener('mousedown', (e) => {
  if (!storeBox.contains(e.target)) clearList();
});

document.addEventListener('keydown', (e) => {
  if (storeList.hidden || !storeList.childElementCount) return;
  const items = storeList.querySelectorAll('li[data-idx]');
  if (!items.length) return;

  const move = (diff) => {
    e.preventDefault();
    highlight = Math.min(items.length - 1, Math.max(0, highlight + diff));
    for (let i = 0; i < items.length; i++) {
      items[i].classList.toggle('active', i === highlight);
    }
  };

  if (e.key === 'ArrowDown') move(1);
  else if (e.key === 'ArrowUp') move(-1);
  else if (e.key === 'Enter' && highlight >= 0) {
    e.preventDefault();
    chooseStore(filteredStores[highlight]);
  }
});

/* ---------- Generate ---------- */
generateBtn.addEventListener('click', async () => {
  const store = selectedStore;
  if (!store) return;

  resultCsv = null;
  setResultsVisible(false);
  generateBtn.classList.add('loading');
  generateLabel.textContent = 'Memproses…';

  setStatus('Men-generate dari template otomatis…', 'info');

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal generate');

    resultCsv = data.csv;
    setResultsVisible(true);
    renderStats(data.stats);
    setStatus('Selesai! Hasil siap diunduh.', 'success');
  } catch (e) {
    setStatus('Error: ' + e.message, 'error');
  } finally {
    generateBtn.classList.remove('loading');
    generateLabel.textContent = 'Generate';
    updateButton();
  }
});

/* ---------- Stats ---------- */
function renderStats(s) {
  const items = [
    { n: s.totalRows, label: 'Baris diproses', cls: '' },
    { n: s.matchedGdt, label: 'Cocok di GDT (ID)', cls: 'good' },
    { n: s.matchedStock, label: 'Stok ada di toko', cls: 'good' },
    { n: s.computed, label: 'Stok dihitung (qty ÷ faktor)', cls: 'good' },
    { n: s.noGdt, label: 'Tidak ada di GDT', cls: s.noGdt ? 'warn' : 'good' },
    { n: s.noStock, label: 'Stok tidak ada di toko', cls: s.noStock ? 'warn' : 'good' },
    { n: s.notApprove, label: 'Status Jual bukan approve', cls: s.notApprove ? 'warn' : 'good' },
    { n: s.zeroFactor, label: 'Faktor = 0 (tak dibagi)', cls: s.zeroFactor ? 'bad' : 'good' },
  ];

  const grid = document.createElement('div');
  grid.className = 'stat-grid';
  grid.innerHTML = items
    .map(
      (it) =>
        `<div class="stat"><div class="num ${it.cls}">${it.n}</div><div class="lbl">${it.label}</div></div>`
    )
    .join('');

  const dlRow = document.createElement('div');
  dlRow.className = 'download-row';
  dlRow.innerHTML =
    '<div class="dz-hint">Baris yang cocok & masuk akal — siap dipakai untuk update stok.</div>' +
    '<button class="btn btn-download" id="downloadBtn">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />' +
    '<path d="m7 10 5 5 5-5" />' +
    '<path d="M12 15V3" />' +
    '</svg>Download Hasil CSV</button>';

  resultsEl.innerHTML = '';
  resultsEl.appendChild(grid);
  resultsEl.appendChild(dlRow);
}

/* ---------- Download ---------- */
resultsEl.addEventListener('click', (e) => {
  if (!e.target.closest('#downloadBtn')) return;
  if (!resultCsv) return;

  // Catat aktivitas download ke sheet LOG (fire-and-forget).
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ namaToko: selectedStore }),
  }).catch(() => {});

  const storeName = (selectedStore || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const fileName =
    'generated good doctor' + (storeName ? ' - ' + storeName : '') + '.csv';

  const blob = new Blob([resultCsv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

/* ---------- Admin: lock widget, modal & dashboard log ---------- */
const adminLock = document.getElementById('adminLock');
const adminModal = document.getElementById('adminModal');
const adminPass = document.getElementById('adminPass');
const adminLoginBtn = document.getElementById('adminLoginBtn');
const adminCancelBtn = document.getElementById('adminCancelBtn');
const adminStatus = document.getElementById('adminStatus');
const adminDash = document.getElementById('adminDash');
const adminDashClose = document.getElementById('adminDashClose');
const adminLogout = document.getElementById('adminLogout');
const adminLogRefresh = document.getElementById('adminLogRefresh');
const adminLogCount = document.getElementById('adminLogCount');
const logTableBody = document.getElementById('logTableBody');
const logEmpty = document.getElementById('logEmpty');
const logSearch = document.getElementById('logSearch');
const logDateFrom = document.getElementById('logDateFrom');
const logDateTo = document.getElementById('logDateTo');
const statTotal = document.getElementById('statTotal');
const statToko = document.getElementById('statToko');
const statHariIni = document.getElementById('statHariIni');
const statTerakhir = document.getElementById('statTerakhir');

let adminToken = sessionStorage.getItem('adminToken') || '';
let logEntries = [];

function setAdminStatus(msg, type) {
  adminStatus.textContent = msg;
  adminStatus.className = 'status show ' + (type || 'info');
}

function clearAdminStatus() {
  adminStatus.className = 'status';
  adminStatus.textContent = '';
}

function openAdminModal() {
  clearAdminStatus();
  adminPass.value = '';
  adminModal.hidden = false;
  adminPass.focus();
}

function closeAdminModal() {
  adminModal.hidden = true;
}

function openDashboard() {
  adminDash.hidden = false;
  loadAdminLog();
}

function closeDashboard() {
  adminDash.hidden = true;
}

function logout() {
  adminToken = '';
  sessionStorage.removeItem('adminToken');
  closeDashboard();
}

async function loadAdminLog() {
  statTotal.textContent = '…';
  try {
    const res = await fetch('/api/admin/log?token=' + encodeURIComponent(adminToken));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal memuat log');
    logEntries = data.entries || [];
    renderAdminLog();
  } catch (e) {
    logTableBody.innerHTML = '';
    logEmpty.hidden = false;
    logEmpty.textContent = e.message;
    adminLogCount.textContent = '';
  }
}

function renderAdminLog() {
  const q = logSearch.value.trim().toLowerCase();
  const from = logDateFrom.value;
  const to = logDateTo.value;

  const filtered = logEntries.filter((e) => {
    if (q && !e.namaToko.toLowerCase().includes(q)) return false;
    // Tanggal format dd/mm/yyyy -> yyyy-mm-dd untuk dibandingkan
    const d = e.tanggal.split('/');
    const iso = d.length === 3 ? `${d[2]}-${d[1]}-${d[0]}` : '';
    if (from && iso < from) return false;
    if (to && iso > to) return false;
    return true;
  });

  // Statistik
  const uniqueToko = new Set(logEntries.map((e) => e.namaToko));
  statTotal.textContent = logEntries.length;
  statToko.textContent = uniqueToko.size;
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${today.getFullYear()}`;
  statHariIni.textContent = logEntries.filter((e) => e.tanggal === todayStr).length;
  statTerakhir.textContent = logEntries.length
    ? logEntries[0].jam
    : '-';

  adminLogCount.textContent = filtered.length + ' dari ' + logEntries.length + ' entri';

  if (!filtered.length) {
    logTableBody.innerHTML = '';
    logEmpty.hidden = false;
    logEmpty.textContent = logEntries.length
      ? 'Tidak ada log yang cocok dengan filter.'
      : 'Belum ada log.';
    return;
  }
  logEmpty.hidden = true;
  logTableBody.innerHTML = filtered
    .map(
      (e) =>
        `<tr>` +
        `<td class="tgl">${escapeHtml(e.tanggal)}</td>` +
        `<td class="jam">${escapeHtml(e.jam)}</td>` +
        `<td>${escapeHtml(e.namaToko)}</td>` +
        `</tr>`
    )
    .join('');
}

adminLock.addEventListener('click', () => {
  openAdminModal();
});

adminCancelBtn.addEventListener('click', closeAdminModal);

adminModal.addEventListener('click', (e) => {
  if (e.target === adminModal) closeAdminModal();
});

adminLoginBtn.addEventListener('click', async () => {
  const password = adminPass.value;
  if (!password) {
    setAdminStatus('Masukkan password terlebih dahulu.', 'error');
    return;
  }
  adminLoginBtn.disabled = true;
  setAdminStatus('Memeriksa…', 'info');
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login gagal');
    adminToken = data.token;
    sessionStorage.setItem('adminToken', adminToken);
    closeAdminModal();
    openDashboard();
  } catch (e) {
    setAdminStatus(e.message, 'error');
  } finally {
    adminLoginBtn.disabled = false;
  }
});

adminPass.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') adminLoginBtn.click();
});

adminDashClose.addEventListener('click', closeDashboard);
adminLogout.addEventListener('click', logout);
adminLogRefresh.addEventListener('click', loadAdminLog);
logSearch.addEventListener('input', renderAdminLog);
logDateFrom.addEventListener('change', renderAdminLog);
logDateTo.addEventListener('change', renderAdminLog);

loadStores();
