/* ============================================================
 * CBR-Mobile · PT Putra Perkasa Abadi · Geoteknik
 * Aplikasi perhitungan California Bearing Ratio dari Uji DCP
 * ============================================================ */

(function() {
  'use strict';

  /* ================== CONSTANTS ================== */
  const STORAGE_KEYS = {
    HISTORY: 'cbr_mobile_history_v1',
    SETTINGS: 'cbr_mobile_settings_v1',
    DRAFT: 'cbr_mobile_draft_v1'
  };

  const DEFAULT_SETTINGS = {
    acuanAvg: 21.60,
    acuanMin: 16.40,
    qFactor: 6.9,
    projName: 'EVALUASI DAYA DUKUNG TANAH',
    projLoc: 'TIMBUNAN BANKO BARAT PIT 1',
    docCode: 'PPA-BA-F-ENG-40B'
  };

  /* ================== STATE ================== */
  let state = {
    page: 'new',
    settings: loadSettings(),
    rows: [], // [{ tumbukan, penetrasi, isInitial }] - penetrasi adalah incremental
    header: defaultHeader(),
    lastResult: null,
    lastChart: null,
    logos: { ba: null, ppa: null } // base64 cache for PDF
  };

  /* ================== LOGO LOADER ================== */
  function loadLogoAsBase64(url) {
    return new Promise((resolve) => {
      fetch(url)
        .then(r => r.blob())
        .then(blob => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        })
        .catch(() => resolve(null));
    });
  }

  async function preloadLogos() {
    const [ba, ppa] = await Promise.all([
      loadLogoAsBase64('logo-bukit-asam.png'),
      loadLogoAsBase64('logo-ppa.png')
    ]);
    state.logos.ba = ba;
    state.logos.ppa = ppa;
  }

  function defaultHeader() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return {
      lokasi: '',
      easting: '',
      northing: '',
      tanggal: `${yyyy}-${mm}-${dd}`,
      konus: '60',
      dikerjakan: 'Geoteknik PPA',
      dihitung: 'Geoteknik PPA',
      keterangan: ''
    };
  }

  function defaultRows() {
    return [
      { tumbukan: 0, penetrasi: 0, isInitial: true, __v: 2 },
      { tumbukan: 10, penetrasi: 0, isInitial: false, __v: 2 }
    ];
  }

  /* ================== STORAGE ================== */
  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (e) { return { ...DEFAULT_SETTINGS }; }
  }
  function saveSettings(s) {
    state.settings = s;
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(s));
  }
  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function saveHistory(arr) {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(arr));
  }
  function saveDraft() {
    try {
      localStorage.setItem(STORAGE_KEYS.DRAFT, JSON.stringify({
        header: state.header,
        rows: state.rows
      }));
    } catch (e) {}
  }
  function loadDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.DRAFT);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  /* ================== CALCULATIONS ================== */
  function calcDCP(kumPenetrasi, kumTumbukan) {
    if (!kumTumbukan || kumTumbukan <= 0) return null;
    if (kumPenetrasi == null) return null;
    return kumPenetrasi / kumTumbukan;
  }

  // Konus 60° (default): log CBR = 2.8135 - 1.313 * log DCP
  // Konus 30°: log CBR = 1.352 - 1.125 * log(DCP/10) [DCP dalam cm/tumbukan]
  function calcCBR(dcp, konus) {
    if (!dcp || dcp <= 0) return null;
    if (konus === '30' || konus === 30) {
      const dcpCm = dcp / 10;
      const logCBR = 1.352 - 1.125 * Math.log10(dcpCm);
      return Math.pow(10, logCBR);
    }
    // Default 60°
    const logCBR = 2.8135 - 1.313 * Math.log10(dcp);
    return Math.pow(10, logCBR);
  }

  function computeAll(rows, konus) {
    let kumTumb = 0;
    // Initial reading dari row 0 (E13 = D13). Semua KumPen[i>0] = E13 + D[i]
    const initialPen = rows.length > 0 ? (Number(rows[0].penetrasi) || 0) : 0;

    const computed = rows.map((r, i) => {
      const tumbukan = Number(r.tumbukan) || 0;
      const penetrasi = Number(r.penetrasi) || 0;
      const out = {
        idx: i,
        tumbukan: tumbukan,
        penetrasi: penetrasi,
        isInitial: !!r.isInitial || i === 0,
        kumTumbukan: 0,
        kumPenetrasi: 0,
        dcp: null,
        logDCP: null,
        cbr: null
      };
      if (i === 0) {
        // Row 0 (initial reading): E13 = D13
        out.kumTumbukan = 0;
        out.kumPenetrasi = penetrasi;
        kumTumb = 0;
      } else {
        // Sesuai formula Excel: C[i] = B[i] + C[i-1], E[i] = $E$13 + D[i]
        kumTumb += tumbukan;
        out.kumTumbukan = kumTumb;
        out.kumPenetrasi = initialPen + penetrasi;
        out.dcp = calcDCP(out.kumPenetrasi, out.kumTumbukan);
        if (out.dcp != null && out.dcp > 0) {
          out.logDCP = Math.log10(out.dcp);
          out.cbr = calcCBR(out.dcp, konus);
        }
      }
      return out;
    });

    // Calculate avg CBR (excluding row 0)
    const validCBRs = computed.slice(1).filter(c => c.cbr != null && !isNaN(c.cbr));
    const validDCPs = computed.slice(1).filter(c => c.dcp != null && !isNaN(c.dcp));
    const avgCBR = validCBRs.length > 0 ? validCBRs.reduce((s, c) => s + c.cbr, 0) / validCBRs.length : null;
    const avgDCP = validDCPs.length > 0 ? validDCPs.reduce((s, c) => s + c.dcp, 0) / validDCPs.length : null;
    const minCBR = validCBRs.length > 0 ? Math.min(...validCBRs.map(c => c.cbr)) : null;
    const maxCBR = validCBRs.length > 0 ? Math.max(...validCBRs.map(c => c.cbr)) : null;

    return {
      computed,
      avgCBR,
      avgDCP,
      minCBR,
      maxCBR,
      validCount: validCBRs.length
    };
  }

  // Migrate old row format (penetrasi incremental) ke format baru (penetrasi total)
  function migrateRows(rows) {
    if (!rows || !rows.length) return rows;
    // Detect old incremental format vs new total format using version marker
    if (rows[0] && rows[0].__v === 2) {
      // Already new format (v2)
      return rows.map(r => ({
        tumbukan: Number(r.tumbukan) || 0,
        penetrasi: Number(r.penetrasi) || 0,
        isInitial: !!r.isInitial,
        __v: 2
      }));
    }
    // Old format detected: penetrasi was incremental per interval. Convert to total.
    let cumulativePen = 0;
    const initial = Number(rows[0]?.penetrasi) || 0;
    return rows.map((r, i) => {
      if (i === 0) {
        return { tumbukan: 0, penetrasi: initial, isInitial: true, __v: 2 };
      }
      // In old format, sum the incrementals (excluding initial) to get total
      cumulativePen += Number(r.penetrasi) || 0;
      return {
        tumbukan: Number(r.tumbukan) || 0,
        penetrasi: cumulativePen, // TOTAL penetrasi sejak start, sesuai formula Excel
        isInitial: false,
        __v: 2
      };
    });
  }

  function evalCompliance(result, settings) {
    if (!result.avgCBR) return { sesuai: false, reason: 'Data belum cukup' };
    // Sesuai formula Excel: IF(H44<H45, "Perlu Pemadatan", "Sesuai")
    // Hanya 1 kriteria: rata-rata CBR vs acuan rata-rata
    const passAvg = result.avgCBR >= settings.acuanAvg;
    const passMin = result.minCBR != null && result.minCBR >= settings.acuanMin;
    return {
      sesuai: passAvg,
      passAvg,
      passMin,
      reason: passAvg
        ? 'Sesuai dengan Acuan Rekomendasi Geoteknik'
        : 'Perlu Dilakukan Rekomendasi Pemadatan Material Lebih Lanjut Sesuai Dengan Rekomendasi Geoteknik'
    };
  }

  /* ================== TOAST ================== */
  const toastIcons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    danger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  function toast(msg, type = 'info', duration = 2500) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<div class="toast-icon">${toastIcons[type] || toastIcons.info}</div><div class="toast-msg">${msg}</div>`;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s, transform 0.3s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-12px)';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  /* ================== MODAL ================== */
  function showModal(title, desc, onConfirm, opts = {}) {
    const modal = document.getElementById('modal');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-desc').textContent = desc;
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');
    confirmBtn.textContent = opts.confirmText || 'Ya, Lanjutkan';
    cancelBtn.textContent = opts.cancelText || 'Batal';
    confirmBtn.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');
    modal.classList.add('show');
    const cleanup = () => {
      modal.classList.remove('show');
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
    };
    confirmBtn.onclick = () => { cleanup(); if (onConfirm) onConfirm(); };
    cancelBtn.onclick = cleanup;
  }

  /* ================== NAVIGATION ================== */
  function navigateTo(page) {
    state.page = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navBtn) navBtn.classList.add('active');
    document.getElementById('main').scrollTop = 0;

    if (page === 'history') renderHistory();
    if (page === 'result') renderResult();
    if (page === 'settings') populateSettings();
  }

  /* ================== RENDERERS ================== */
  function renderRows() {
    const wrap = document.getElementById('dcp-rows');
    wrap.innerHTML = '';
    const result = computeAll(state.rows, state.header.konus);
    state.rows.forEach((row, i) => {
      const c = result.computed[i];
      const div = document.createElement('div');
      div.className = 'dcp-row' + (c.isInitial ? ' initial' : '');
      div.innerHTML = `
        <div class="dcp-rownum">${i}</div>
        <input class="dcp-input" type="number" inputmode="decimal" data-i="${i}" data-f="tumbukan" value="${row.tumbukan || ''}" ${c.isInitial ? 'readonly' : ''}>
        <input class="dcp-input" type="number" inputmode="decimal" data-i="${i}" data-f="penetrasi" value="${row.penetrasi || ''}" placeholder="${c.isInitial ? 'awal' : ''}">
        <div class="dcp-calc">${c.kumPenetrasi || (i === 0 && !row.penetrasi ? '—' : c.kumPenetrasi)}</div>
        <div class="dcp-calc">${c.dcp ? c.dcp.toFixed(2) : '—'}</div>
        <div class="dcp-calc cbr ${cbrClass(c.cbr)}">${c.cbr ? c.cbr.toFixed(2) : '—'}</div>
        <button class="dcp-row-del" data-del="${i}" title="Hapus baris">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      `;
      wrap.appendChild(div);
    });

    // Bind input events
    wrap.querySelectorAll('.dcp-input').forEach(inp => {
      inp.addEventListener('input', e => {
        const i = parseInt(e.target.dataset.i, 10);
        const f = e.target.dataset.f;
        const v = e.target.value === '' ? 0 : Number(e.target.value);
        if (state.rows[i]) {
          state.rows[i][f] = v;
          updateSummary();
          saveDraft();
        }
      });
      inp.addEventListener('blur', () => renderRows());
    });

    // Bind delete
    wrap.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.del, 10);
        if (state.rows[i] && !state.rows[i].isInitial) {
          state.rows.splice(i, 1);
          renderRows();
          updateSummary();
          saveDraft();
        }
      });
    });

    updateSummary();
  }

  function cbrClass(cbr) {
    if (cbr == null) return '';
    if (cbr < state.settings.acuanMin) return 'danger';
    if (cbr < state.settings.acuanAvg) return 'warn';
    return '';
  }

  function updateSummary() {
    const result = computeAll(state.rows, state.header.konus);
    const compliance = evalCompliance(result, state.settings);
    const elDCP = document.getElementById('sum-dcp');
    const elCBR = document.getElementById('sum-cbr');
    const elStatus = document.getElementById('sum-status');

    elDCP.innerHTML = (result.avgDCP ? result.avgDCP.toFixed(2) : '—') + '<span class="dcp-summary-unit"> mm/pen</span>';
    elCBR.innerHTML = (result.avgCBR ? result.avgCBR.toFixed(2) : '—') + '<span class="dcp-summary-unit"> %</span>';

    if (result.avgCBR == null) {
      elStatus.textContent = '—';
      elStatus.className = 'dcp-summary-val';
    } else if (compliance.sesuai) {
      elStatus.textContent = 'SESUAI';
      elStatus.className = 'dcp-summary-val success';
    } else {
      elStatus.textContent = 'TIDAK SESUAI';
      elStatus.className = 'dcp-summary-val danger';
    }
  }

  /* ============= ADD ROW ============= */
  function addRow() {
    // Default tumbukan = 10, penetrasi = 0 (user input pembacaan mistar TOTAL dari titik start)
    state.rows.push({
      tumbukan: 10,
      penetrasi: 0,
      isInitial: false,
      __v: 2
    });
    renderRows();
    saveDraft();
    // Focus the new row's penetration input
    setTimeout(() => {
      const inputs = document.querySelectorAll('.dcp-input[data-f="penetrasi"]');
      const newInput = inputs[inputs.length - 1];
      if (newInput) newInput.focus();
    }, 50);
  }

  /* ================== HEADER FORM ================== */
  function bindHeaderForm() {
    const map = {
      'f-lokasi': 'lokasi',
      'f-easting': 'easting',
      'f-northing': 'northing',
      'f-tanggal': 'tanggal',
      'f-konus': 'konus',
      'f-dikerjakan': 'dikerjakan',
      'f-dihitung': 'dihitung',
      'f-keterangan': 'keterangan'
    };
    Object.keys(map).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        state.header[map[id]] = el.value;
        if (map[id] === 'konus') {
          renderRows();
        }
        saveDraft();
      });
    });
  }

  function populateHeader() {
    const map = {
      'f-lokasi': 'lokasi',
      'f-easting': 'easting',
      'f-northing': 'northing',
      'f-tanggal': 'tanggal',
      'f-konus': 'konus',
      'f-dikerjakan': 'dikerjakan',
      'f-dihitung': 'dihitung',
      'f-keterangan': 'keterangan'
    };
    Object.keys(map).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = state.header[map[id]] || '';
    });
  }

  /* ================== RESULT VIEW ================== */
  function renderResult() {
    const wrap = document.getElementById('result-content');
    if (state.rows.length < 2 || !state.rows[1].penetrasi) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/>
              <line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          </div>
          <div class="empty-state-title">Belum Ada Hasil</div>
          <div class="empty-state-desc">Silakan input data pengujian DCP terlebih dahulu pada tab "Uji Baru" untuk melihat hasil perhitungan CBR.</div>
        </div>
      `;
      return;
    }

    const result = computeAll(state.rows, state.header.konus);
    const compliance = evalCompliance(result, state.settings);
    state.lastResult = { result, compliance, header: { ...state.header }, rows: [...state.rows] };

    const statusType = compliance.sesuai ? 'success' : 'danger';
    const qUlt = result.avgCBR ? result.avgCBR * state.settings.qFactor : null;

    wrap.innerHTML = `
      <div class="hero">
        <div class="hero-eyebrow">Test Result · ${state.header.konus}°</div>
        <div class="hero-title">${escapeHtml(state.header.lokasi || 'Hasil Pengujian DCP')}</div>
        <div class="hero-desc">${escapeHtml(state.header.keterangan || 'Hasil perhitungan CBR berdasarkan korelasi DCP-CBR Webster (1992).')}</div>
      </div>

      <div class="status-card ${statusType}">
        <div class="status-head ${statusType}">
          <div class="status-icon ${statusType}">
            ${compliance.sesuai
              ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
              : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>'
            }
          </div>
          <div>
            <div class="status-text-eye">Kesimpulan</div>
            <div class="status-text-main">${compliance.sesuai ? 'Sesuai Acuan Geoteknik' : 'Tidak Sesuai Acuan'}</div>
          </div>
        </div>
        <div class="metric-grid">
          <div class="metric">
            <div class="metric-label">Rata-Rata CBR</div>
            <div class="metric-val ${compliance.passAvg ? 'success' : 'danger'}">${result.avgCBR.toFixed(2)}<span class="metric-unit"> %</span></div>
          </div>
          <div class="metric">
            <div class="metric-label">Rata-Rata DCP</div>
            <div class="metric-val">${result.avgDCP.toFixed(2)}<span class="metric-unit"> mm/pen</span></div>
          </div>
          <div class="metric">
            <div class="metric-label">CBR Min Layer</div>
            <div class="metric-val ${compliance.passMin ? 'success' : 'danger'}">${result.minCBR.toFixed(2)}<span class="metric-unit"> %</span></div>
          </div>
          <div class="metric">
            <div class="metric-label">q Ultimate</div>
            <div class="metric-val">${qUlt.toFixed(2)}<span class="metric-unit"> kPa</span></div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <div class="section-title">Informasi Pengujian</div>
          <div class="section-num">01</div>
        </div>
        <div class="card">
          <div class="info-list">
            <div class="info-row"><div class="info-key">Lokasi</div><div class="info-val">${escapeHtml(state.header.lokasi || '—')}</div></div>
            <div class="info-row"><div class="info-key">Easting</div><div class="info-val">${escapeHtml(state.header.easting || '—')}</div></div>
            <div class="info-row"><div class="info-key">Northing</div><div class="info-val">${escapeHtml(state.header.northing || '—')}</div></div>
            <div class="info-row"><div class="info-key">Tanggal</div><div class="info-val">${formatDateID(state.header.tanggal)}</div></div>
            <div class="info-row"><div class="info-key">Konus</div><div class="info-val">${state.header.konus}-derajat</div></div>
            <div class="info-row"><div class="info-key">Dikerjakan</div><div class="info-val">${escapeHtml(state.header.dikerjakan || '—')}</div></div>
            <div class="info-row"><div class="info-key">Acuan CBR</div><div class="info-val">${state.settings.acuanAvg.toFixed(2)}% (min ${state.settings.acuanMin.toFixed(2)}%)</div></div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <div class="section-title">Grafik Hubungan Kumulatif</div>
          <div class="section-num">02</div>
        </div>
        <div class="chart-wrap">
          <div class="chart-title">Hubungan Kumulatif Tumbukan dan Kumulatif Penetrasi</div>
          <div class="chart-canvas-wrap">
            <canvas id="result-chart"></canvas>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <div class="section-title">Tabel Hasil Perhitungan</div>
          <div class="section-num">03</div>
        </div>
        <div class="result-table-wrap">
          <div class="result-table-scroll">
            <table class="result-table">
              <thead>
                <tr>
                  <th>#</th><th>Tumb</th><th>K.Tumb</th><th>Pen</th><th>K.Pen</th><th>DCP</th><th>Log DCP</th><th>CBR%</th>
                </tr>
              </thead>
              <tbody>
                ${result.computed.map(c => `
                  <tr>
                    <td class="col-num">${c.idx}</td>
                    <td>${c.tumbukan || '—'}</td>
                    <td>${c.kumTumbukan}</td>
                    <td>${c.penetrasi}</td>
                    <td>${c.kumPenetrasi}</td>
                    <td>${c.dcp != null ? c.dcp.toFixed(2) : '—'}</td>
                    <td>${c.logDCP != null ? c.logDCP.toFixed(2) : '—'}</td>
                    <td class="${c.cbr != null ? (c.cbr >= state.settings.acuanMin ? 'col-cbr-ok' : 'col-cbr-bad') : ''}">${c.cbr != null ? c.cbr.toFixed(2) : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-success" id="btn-save-history">
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          Simpan Riwayat
        </button>
        <button class="btn btn-primary" id="btn-export-pdf">
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export PDF
        </button>
      </div>
      <div class="spacer-sm"></div>
      <button class="btn btn-ghost btn-block" id="btn-back-edit">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Kembali Edit Data
      </button>
    `;

    // Render chart
    setTimeout(() => renderResultChart(result.computed), 50);

    // Bind buttons
    document.getElementById('btn-save-history').onclick = () => saveCurrentToHistory();
    document.getElementById('btn-export-pdf').onclick = () => exportPDF(state.lastResult);
    document.getElementById('btn-back-edit').onclick = () => navigateTo('new');
  }

  function renderResultChart(computed) {
    const canvas = document.getElementById('result-chart');
    if (!canvas) return;
    if (state.lastChart) state.lastChart.destroy();

    const data = computed.map(c => ({ x: c.kumTumbukan, y: c.kumPenetrasi }));

    state.lastChart = new Chart(canvas, {
      type: 'line',
      data: {
        datasets: [{
          label: 'Penetrasi',
          data: data,
          borderColor: '#3b7ddd',
          backgroundColor: '#3b7ddd',
          borderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: '#fef08a',
          pointBorderColor: '#3b7ddd',
          pointBorderWidth: 2,
          tension: 0,
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a2033',
            titleColor: '#f0f2f7',
            bodyColor: '#9ba3b8',
            borderColor: '#2a3349',
            borderWidth: 1,
            callbacks: {
              label: (ctx) => `Tumb: ${ctx.parsed.x}, Pen: ${ctx.parsed.y} mm`
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            position: 'top',
            title: { display: true, text: 'Kumulatif Tumbukan', color: '#9ba3b8', font: { size: 11, weight: '600' } },
            grid: { color: 'rgba(42,51,73,0.5)' },
            ticks: { color: '#9ba3b8', font: { family: 'JetBrains Mono', size: 10 } }
          },
          y: {
            reverse: true,
            title: { display: true, text: 'Kumulatif Penetrasi (mm)', color: '#9ba3b8', font: { size: 11, weight: '600' } },
            grid: { color: 'rgba(42,51,73,0.5)' },
            ticks: { color: '#9ba3b8', font: { family: 'JetBrains Mono', size: 10 } }
          }
        }
      }
    });
  }

  /* ================== HISTORY ================== */
  function saveCurrentToHistory() {
    if (!state.lastResult) return;
    const history = loadHistory();
    const id = 'cbr_' + Date.now();
    const entry = {
      id,
      savedAt: new Date().toISOString(),
      header: state.lastResult.header,
      rows: state.lastResult.rows,
      settings: { ...state.settings }
    };
    history.unshift(entry);
    saveHistory(history);
    toast('Hasil berhasil disimpan ke riwayat', 'success');
  }

  function renderHistory() {
    const wrap = document.getElementById('history-content');
    const history = loadHistory();
    if (!history.length) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div class="empty-state-title">Belum Ada Riwayat</div>
          <div class="empty-state-desc">Hasil perhitungan yang Anda simpan akan muncul di sini. Silakan lakukan pengujian baru terlebih dahulu.</div>
        </div>
      `;
      return;
    }
    const html = `<div class="history-list">${history.map(h => {
      const result = computeAll(migrateRows(h.rows), h.header.konus);
      const compliance = evalCompliance(result, h.settings || state.settings);
      return `
        <div class="history-item" data-id="${h.id}">
          <div class="history-item-head">
            <div style="flex:1; min-width: 0;">
              <div class="history-item-title">${escapeHtml(h.header.lokasi || 'Tanpa Lokasi')}</div>
              <div class="history-item-date">${formatDateTimeID(h.savedAt)}</div>
            </div>
            <div class="history-status ${compliance.sesuai ? 'success' : 'danger'}">${compliance.sesuai ? 'Sesuai' : 'Tidak'}</div>
          </div>
          <div class="history-item-meta">
            <div class="history-meta-item">
              <div class="history-meta-label">DCP avg</div>
              <div class="history-meta-val">${result.avgDCP ? result.avgDCP.toFixed(2) : '—'}</div>
            </div>
            <div class="history-meta-item">
              <div class="history-meta-label">CBR avg</div>
              <div class="history-meta-val">${result.avgCBR ? result.avgCBR.toFixed(2) + '%' : '—'}</div>
            </div>
            <div class="history-meta-item">
              <div class="history-meta-label">Konus</div>
              <div class="history-meta-val">${h.header.konus}°</div>
            </div>
          </div>
        </div>
      `;
    }).join('')}</div>`;
    wrap.innerHTML = html;

    wrap.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const entry = history.find(h => h.id === id);
        if (entry) openHistoryItem(entry);
      });
    });
  }

  function openHistoryItem(entry) {
    showModal(
      escapeHtml(entry.header.lokasi || 'Riwayat'),
      `Disimpan: ${formatDateTimeID(entry.savedAt)}\n\nApa yang ingin Anda lakukan dengan riwayat ini?`,
      null
    );
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');
    confirmBtn.textContent = 'Buka & Lihat';
    cancelBtn.textContent = 'Tutup';
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.onclick = () => {
      document.getElementById('modal').classList.remove('show');
      state.header = { ...entry.header };
      state.rows = migrateRows(entry.rows.map(r => ({ ...r })));
      populateHeader();
      renderRows();
      navigateTo('result');
    };

    // Add a delete option via long-press alternative — using a third button workaround
    // We'll re-add a delete action button below
    const modalActions = document.querySelector('.modal-actions');
    let delBtn = document.getElementById('modal-del');
    if (delBtn) delBtn.remove();
    delBtn = document.createElement('button');
    delBtn.id = 'modal-del';
    delBtn.className = 'btn btn-danger';
    delBtn.style.flex = '0 0 auto';
    delBtn.innerHTML = '<svg style="width:16px;height:16px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>';
    delBtn.onclick = () => {
      document.getElementById('modal').classList.remove('show');
      const history = loadHistory().filter(h => h.id !== entry.id);
      saveHistory(history);
      renderHistory();
      toast('Riwayat dihapus', 'info');
    };
    modalActions.appendChild(delBtn);

    // Cleanup the delete button when modal closes via cancel
    const origCancel = cancelBtn.onclick;
    cancelBtn.onclick = () => {
      if (origCancel) origCancel();
      delBtn.remove();
    };
  }

  /* ================== SETTINGS ================== */
  function populateSettings() {
    document.getElementById('set-acuan-avg').value = state.settings.acuanAvg;
    document.getElementById('set-acuan-min').value = state.settings.acuanMin;
    document.getElementById('set-q-factor').value = state.settings.qFactor;
    document.getElementById('set-proj-name').value = state.settings.projName;
    document.getElementById('set-proj-loc').value = state.settings.projLoc;
    document.getElementById('set-doc-code').value = state.settings.docCode;
  }

  function saveSettingsFromForm() {
    const newS = {
      acuanAvg: parseFloat(document.getElementById('set-acuan-avg').value) || DEFAULT_SETTINGS.acuanAvg,
      acuanMin: parseFloat(document.getElementById('set-acuan-min').value) || DEFAULT_SETTINGS.acuanMin,
      qFactor: parseFloat(document.getElementById('set-q-factor').value) || DEFAULT_SETTINGS.qFactor,
      projName: document.getElementById('set-proj-name').value || DEFAULT_SETTINGS.projName,
      projLoc: document.getElementById('set-proj-loc').value || DEFAULT_SETTINGS.projLoc,
      docCode: document.getElementById('set-doc-code').value || DEFAULT_SETTINGS.docCode
    };
    saveSettings(newS);
    toast('Pengaturan tersimpan', 'success');
    updateSummary();
  }

  /* ================== UTILS ================== */
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatDateID(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch (e) { return iso; }
  }

  function formatDateTimeID(iso) {
    try {
      const d = new Date(iso);
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth() + 1).padStart(2,'0');
      const yy = d.getFullYear();
      const HH = String(d.getHours()).padStart(2,'0');
      const MM = String(d.getMinutes()).padStart(2,'0');
      return `${dd}/${mm}/${yy} ${HH}:${MM}`;
    } catch (e) { return iso; }
  }

  /* ================== SAMPLE DATA ================== */
  function loadSample() {
    state.header = {
      lokasi: 'RL+32 #1',
      easting: '369925.032',
      northing: '9582350.754',
      tanggal: '2026-04-16',
      konus: '60',
      dikerjakan: 'Geoteknik PPA',
      dihitung: 'Geoteknik PPA',
      keterangan: 'RL+32 Timbunan Inpit 1 Selatan'
    };
    // Penetrasi = pembacaan mistar TOTAL dari titik start tumbukan (sesuai format Excel PPA)
    // Kum.Pen dihitung otomatis = Initial(10) + Penetrasi
    state.rows = [
      { tumbukan: 0,  penetrasi: 10,  isInitial: true,  __v: 2 }, // initial reading mistar
      { tumbukan: 10, penetrasi: 140, isInitial: false, __v: 2 }, // KumPen = 10+140 = 150
      { tumbukan: 10, penetrasi: 232, isInitial: false, __v: 2 }, // KumPen = 10+232 = 242
      { tumbukan: 10, penetrasi: 353, isInitial: false, __v: 2 }, // KumPen = 10+353 = 363
      { tumbukan: 10, penetrasi: 489, isInitial: false, __v: 2 }, // KumPen = 10+489 = 499
      { tumbukan: 10, penetrasi: 634, isInitial: false, __v: 2 }, // KumPen = 10+634 = 644
      { tumbukan: 10, penetrasi: 783, isInitial: false, __v: 2 }, // KumPen = 10+783 = 793
      { tumbukan: 10, penetrasi: 905, isInitial: false, __v: 2 }  // KumPen = 10+905 = 915
    ];
    populateHeader();
    renderRows();
    saveDraft();
    toast('Data contoh dimuat (RL+32 #1)', 'info');
  }

  function resetForm() {
    showModal('Reset Data?', 'Semua data form akan dihapus. Lanjutkan?', () => {
      state.header = defaultHeader();
      state.rows = defaultRows();
      populateHeader();
      renderRows();
      saveDraft();
      toast('Form direset', 'info');
    }, { danger: true, confirmText: 'Ya, Reset' });
  }

  function clearAllHistory() {
    showModal('Hapus Semua Riwayat?', 'Tindakan ini tidak dapat dibatalkan. Semua riwayat perhitungan akan dihapus permanen.', () => {
      saveHistory([]);
      toast('Semua riwayat dihapus', 'info');
      if (state.page === 'history') renderHistory();
    }, { danger: true, confirmText: 'Ya, Hapus Semua' });
  }

  /* ================== PDF EXPORT ================== */
  async function exportPDF(payload) {
    if (!payload || !payload.result) {
      toast('Tidak ada data untuk di-export', 'danger');
      return;
    }
    toast('Membuat PDF…', 'info', 1200);
    try {
      await generatePDF(payload);
    } catch (err) {
      console.error(err);
      toast('Gagal membuat PDF: ' + err.message, 'danger');
    }
  }

  async function generatePDF({ result, compliance, header, rows }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentW = pageW - (margin * 2);

    // ============ Build chart image first via offscreen canvas ============
    const chartImg = await renderChartForPDF(result.computed);

    // ============ PAGE 1 - Header + Table ============
    drawPDFHeader(doc, margin, contentW, pageW);
    let y = 42;

    // Lokasi info block
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    const dateID = formatDateID(header.tanggal);
    const leftCol = [
      ['Lokasi', ': ' + (header.lokasi || '-')],
      ['Koordinat', ': ' + (header.easting && header.northing ? `${header.easting}, ${header.northing}` : '-')],
      ['Ukuran Konus', ': ' + header.konus + '-derajat'],
    ];
    const rightCol = [
      ['Dikerjakan', ': ' + (header.dikerjakan || '-')],
      ['Dihitung', ': ' + (header.dihitung || '-')],
      ['Tanggal', ': ' + dateID]
    ];

    leftCol.forEach((row, i) => {
      doc.setFont('helvetica', 'normal');
      doc.text(row[0], margin, y + (i * 5));
      doc.text(row[1], margin + 28, y + (i * 5));
    });
    rightCol.forEach((row, i) => {
      doc.text(row[0], pageW / 2 + 5, y + (i * 5));
      doc.text(row[1], pageW / 2 + 5 + 28, y + (i * 5));
    });

    y += 22;

    // Build table data
    const tableHead = [['Jumlah\nTumbukan', 'Kumulatif\nTumbukan', 'Penetrasi', 'Kumulatif\nPenetrasi', 'DCP', 'LOG DCP', 'CBR (%)']];
    const tableBody = result.computed.map(c => [
      c.tumbukan != null ? String(c.tumbukan) : '',
      String(c.kumTumbukan),
      String(c.penetrasi),
      String(c.kumPenetrasi),
      c.dcp != null ? c.dcp.toFixed(2) : '',
      c.logDCP != null ? c.logDCP.toFixed(2) : '',
      c.cbr != null ? c.cbr.toFixed(2) : ''
    ]);

    // Add empty rows to fill table to look consistent (like the report)
    const minRows = 18;
    while (tableBody.length < minRows) {
      tableBody.push(['','','','','','','']);
    }

    doc.autoTable({
      head: tableHead,
      body: tableBody,
      startY: y,
      theme: 'grid',
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 8.5,
        cellPadding: 1.5,
        halign: 'center',
        valign: 'middle',
        lineColor: [120, 120, 120],
        lineWidth: 0.15
      },
      headStyles: {
        fillColor: [54, 96, 146],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 2
      },
      bodyStyles: {
        fillColor: [255, 255, 255]
      },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      didParseCell: (data) => {
        // Empty rows shaded gray like the report
        if (data.section === 'body' && (!data.row.raw[0] || data.row.raw[0] === '')) {
          if (data.row.raw[1] === '' || data.row.raw[1] == null || data.row.raw[1] === '0' && data.row.index !== 0) {
            // first row (index 0) has tumb=0, keep white
            if (data.row.index !== 0) {
              data.cell.styles.fillColor = [217, 217, 217];
            }
          }
        }
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 22 },
        2: { cellWidth: 22 },
        3: { cellWidth: 22 },
        4: { cellWidth: 22 },
        5: { cellWidth: 22 },
        6: { cellWidth: 'auto' }
      }
    });

    // After table - summary rows
    let endY = doc.lastAutoTable.finalY + 1;

    const sumRows = [
      ['RATA-RATA', result.avgCBR != null ? result.avgCBR.toFixed(2) : '—'],
      ['RATA-RATA ACUAN', state.settings.acuanAvg.toFixed(2)],
      ['RANGE MIN ACUAN', state.settings.acuanMin.toFixed(2)]
    ];
    doc.autoTable({
      body: sumRows,
      startY: endY,
      theme: 'grid',
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 9,
        cellPadding: 2,
        lineColor: [120, 120, 120],
        lineWidth: 0.15
      },
      columnStyles: {
        0: { cellWidth: contentW * 0.78, fontStyle: 'bold', halign: 'left' },
        1: { cellWidth: contentW * 0.22, halign: 'center', fontStyle: 'bold' }
      }
    });

    let csY = doc.lastAutoTable.finalY + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('KESIMPULAN', margin, csY);
    csY += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(compliance.sesuai
      ? 'Sesuai dengan Acuan Rekomendasi Geoteknik'
      : 'Tidak Sesuai dengan Acuan Rekomendasi Geoteknik', margin, csY);

    // ============ PAGE 2 - Chart ============
    doc.addPage();
    drawPDFHeader(doc, margin, contentW, pageW);
    let y2 = 42;

    leftCol.forEach((row, i) => {
      doc.text(row[0], margin, y2 + (i * 5));
      doc.text(row[1], margin + 28, y2 + (i * 5));
    });
    rightCol.forEach((row, i) => {
      doc.text(row[0], pageW / 2 + 5, y2 + (i * 5));
      doc.text(row[1], pageW / 2 + 5 + 28, y2 + (i * 5));
    });

    y2 += 22;

    // Chart title
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Hubungan Kumulatif Tumbukan dan Kumulatif Penetrasi', pageW / 2, y2, { align: 'center' });
    y2 += 5;

    // Insert chart image
    if (chartImg) {
      const imgW = contentW;
      const imgH = imgW * 0.65;
      doc.addImage(chartImg, 'PNG', margin, y2, imgW, imgH);
    }

    // Footer with file code
    addPDFFooter(doc, pageW, pageH, margin);

    // Save
    const filename = `CBR-${(header.lokasi || 'Test').replace(/[^a-zA-Z0-9_+#-]/g, '_')}-${(header.tanggal || 'date').replace(/-/g, '')}.pdf`;
    doc.save(filename);
    toast('PDF berhasil dibuat', 'success');
  }

  function drawPDFHeader(doc, margin, contentW, pageW) {
    // Top right document code
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.text(state.settings.docCode, pageW - margin, 10, { align: 'right' });

    // Top header table: Bukit Asam | Title | PPA
    const headerY = 13;
    const headerH = 20;
    const colBA = contentW * 0.30;
    const colTitle = contentW * 0.44;
    const colPPA = contentW * 0.26;

    // Border boxes
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(margin, headerY, colBA, headerH);
    doc.rect(margin + colBA, headerY, colTitle, headerH);
    doc.rect(margin + colBA + colTitle, headerY, colPPA, headerH);

    // === Bukit Asam logo (real PNG, ~5.24:1 aspect ratio landscape) ===
    let baLoaded = false;
    if (state.logos.ba) {
      const baMaxH = headerH - 4;
      const baMaxW = colBA - 4;
      const baAspect = 597 / 114;
      let baW = baMaxH * baAspect;
      let baH = baMaxH;
      if (baW > baMaxW) { baW = baMaxW; baH = baW / baAspect; }
      const baX = margin + (colBA - baW) / 2;
      const baY = headerY + (headerH - baH) / 2;
      try {
        doc.addImage(state.logos.ba, 'PNG', baX, baY, baW, baH, undefined, 'FAST');
        baLoaded = true;
      } catch (e) { console.warn('BA logo failed:', e); }
    }
    if (!baLoaded) {
      // Fallback text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text('Bukit', margin + colBA / 2 - 5, headerY + headerH / 2 + 1, { align: 'center' });
      doc.setTextColor(227, 6, 19);
      doc.text('Asam', margin + colBA / 2 + 6, headerY + headerH / 2 + 1, { align: 'center' });
    }

    // === Center title ===
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const titleX = margin + colBA + colTitle / 2;
    doc.text('FORMULIR PENGUJIAN', titleX, headerY + 7, { align: 'center' });
    doc.text('PENETROMETER KONUS', titleX, headerY + 12, { align: 'center' });
    doc.text('DINAMIS', titleX, headerY + 17, { align: 'center' });

    // === PPA logo (real PNG, includes "PPA" text below circle) - centered, no extra text ===
    const ppaColX = margin + colBA + colTitle;
    let ppaLoaded = false;
    if (state.logos.ppa) {
      const ppaAspect = 296 / 400; // W/H of resized logo
      const ppaMaxH = headerH - 3;
      const ppaMaxW = colPPA - 4;
      let ppaH = ppaMaxH;
      let ppaW = ppaH * ppaAspect;
      // Constrain by max width if needed
      if (ppaW > ppaMaxW) { ppaW = ppaMaxW; ppaH = ppaW / ppaAspect; }
      // Center in column
      const ppaX = ppaColX + (colPPA - ppaW) / 2;
      const ppaY = headerY + (headerH - ppaH) / 2;
      try {
        doc.addImage(state.logos.ppa, 'PNG', ppaX, ppaY, ppaW, ppaH, undefined, 'FAST');
        ppaLoaded = true;
      } catch (e) { console.warn('PPA logo failed:', e); }
    }
    if (!ppaLoaded) {
      // Fallback text only if logo fails to load
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('PPA', ppaColX + colPPA / 2, headerY + headerH / 2 + 2, { align: 'center' });
    }
  }

  function addPDFFooter(doc, pageW, pageH, margin) {
    const total = doc.internal.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`CBR-Mobile · Generated ${formatDateTimeID(new Date().toISOString())}`, margin, pageH - 7);
      doc.text(`${p} / ${total}`, pageW - margin, pageH - 7, { align: 'right' });
    }
  }

  /* ============ Render chart for PDF (offscreen) ============ */
  function renderChartForPDF(computed) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 520;
      canvas.style.position = 'absolute';
      canvas.style.left = '-9999px';
      canvas.style.top = '-9999px';
      document.body.appendChild(canvas);

      const data = computed.map(c => ({ x: c.kumTumbukan, y: c.kumPenetrasi }));

      const chart = new Chart(canvas, {
        type: 'line',
        data: {
          datasets: [{
            label: 'Penetrasi',
            data: data,
            borderColor: '#2563eb',
            backgroundColor: '#2563eb',
            borderWidth: 2,
            pointRadius: 5,
            pointBackgroundColor: '#2563eb',
            tension: 0,
            fill: false,
            datalabels: true
          }]
        },
        options: {
          responsive: false,
          animation: false,
          devicePixelRatio: 2,
          layout: { padding: 30 },
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: {
              type: 'linear',
              position: 'top',
              title: { display: true, text: 'Kumulatif Tumbukan', color: '#000', font: { size: 14, weight: 'bold' } },
              grid: { color: '#cccccc' },
              ticks: { color: '#000', font: { size: 11 } }
            },
            y: {
              reverse: true,
              title: { display: true, text: 'Kumulatif Penetrasi (mm)', color: '#000', font: { size: 13, weight: 'bold' } },
              grid: { color: '#cccccc' },
              ticks: { color: '#000', font: { size: 11 } }
            }
          }
        },
        plugins: [{
          id: 'datalabels-custom',
          afterDatasetsDraw(c) {
            const ctx = c.ctx;
            ctx.save();
            ctx.font = 'bold 11px Arial';
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const meta = c.getDatasetMeta(0);
            meta.data.forEach((point, i) => {
              const v = data[i].y;
              const label = String(v);
              const tw = ctx.measureText(label).width + 8;
              const th = 16;
              const x = point.x;
              const y = point.y - 14;
              ctx.fillStyle = '#fef08a';
              ctx.strokeStyle = '#000';
              ctx.lineWidth = 0.5;
              ctx.fillRect(x - tw/2, y - th/2, tw, th);
              ctx.strokeRect(x - tw/2, y - th/2, tw, th);
              ctx.fillStyle = '#000';
              ctx.fillText(label, x, y);
            });
            ctx.restore();
          }
        }]
      });

      // Wait one frame then capture
      requestAnimationFrame(() => {
        setTimeout(() => {
          const dataURL = canvas.toDataURL('image/png', 1.0);
          chart.destroy();
          canvas.remove();
          resolve(dataURL);
        }, 200);
      });
    });
  }

  /* ================== PWA INSTALL ================== */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('btn-install').style.display = 'flex';
  });
  document.getElementById('btn-install').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      toast('Aplikasi terinstall', 'success');
    }
    deferredPrompt = null;
    document.getElementById('btn-install').style.display = 'none';
  });

  /* ================== SERVICE WORKER ================== */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  /* ================== INIT ================== */
  function init() {
    // Bind nav
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.page));
    });

    // Bind buttons
    document.getElementById('btn-add-row').addEventListener('click', addRow);
    document.getElementById('btn-reset').addEventListener('click', resetForm);
    document.getElementById('btn-load-sample').addEventListener('click', loadSample);
    document.getElementById('btn-view-result').addEventListener('click', () => navigateTo('result'));
    document.getElementById('btn-save-settings').addEventListener('click', saveSettingsFromForm);
    document.getElementById('btn-clear-history').addEventListener('click', clearAllHistory);

    // Bind header form
    bindHeaderForm();

    // Modal close on backdrop click
    document.getElementById('modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal') {
        document.getElementById('modal').classList.remove('show');
      }
    });

    // Try to load draft
    const draft = loadDraft();
    if (draft && draft.rows && draft.rows.length) {
      state.header = { ...defaultHeader(), ...draft.header };
      state.rows = migrateRows(draft.rows);
    } else {
      state.rows = defaultRows();
    }

    populateHeader();
    renderRows();
    populateSettings();

    // Preload logos for PDF (cached after first load)
    preloadLogos();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
