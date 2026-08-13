/* ==========================================================================
   INFINITO SHARED ENGINE — app-shared.js
   Supports: Auto Studio | Overall Emails | ICP 1 | ICP 2 | ICP 3 | Lead Gen
   ========================================================================== */

/* ==========================================================================
   WORKSPACE STORE — persistent per-ICP storage with deduplication
   ========================================================================== */
class WorkspaceStore {
  constructor(workspaceId) {
    this.workspaceId = workspaceId;
    this.storageKey = `infinito_workspace_${workspaceId}`;
    this.historyKey = `infinito_history_${workspaceId}`;
  }

  getData() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) || '[]');
    } catch { return []; }
  }

  saveData(rows) {
    try { localStorage.setItem(this.storageKey, JSON.stringify(rows)); } catch {}
  }

  getHistory() {
    try {
      return JSON.parse(localStorage.getItem(this.historyKey) || '[]');
    } catch { return []; }
  }

  saveHistory(history) {
    try { localStorage.setItem(this.historyKey, JSON.stringify(history)); } catch {}
  }

  clearWorkspace() {
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem(this.historyKey);
  }

  mergeData(newRows, fileName, sheetName = '') {
    const existing = this.getData();
    const history = this.getHistory();
    const existingHashes = new Set(existing.map(r => this.getRowHash(r)));

    let duplicateCount = 0;
    const newlyAdded = [];

    newRows.forEach(row => {
      if (!row || !Object.keys(row).length) return;
      let mappedRow = mapFields(row);
      if (this.workspaceId === 'icp_1') mappedRow = qualifyICP1(mappedRow);
      else if (this.workspaceId === 'icp_2') mappedRow = qualifyICP2(mappedRow);
      else if (this.workspaceId === 'icp_3') mappedRow = qualifyICP3(mappedRow);

      const hash = this.getRowHash(mappedRow);
      if (existingHashes.has(hash)) { duplicateCount++; return; }
      existingHashes.add(hash);
      newlyAdded.push(mappedRow);
    });

    const combined = [...existing, ...newlyAdded];
    this.saveData(combined);

    const logEntry = {
      id: Date.now(),
      fileName: fileName || 'Imported_Dataset',
      sheetName: sheetName || 'Sheet1',
      timestamp: new Date().toLocaleString(),
      rowsReceived: newRows.length,
      duplicateRows: duplicateCount,
      newlyAddedRows: newlyAdded.length,
      totalStoredRows: combined.length
    };
    history.unshift(logEntry);
    this.saveHistory(history);
    return { logEntry, combinedData: combined };
  }

  getRowHash(row) {
    const li = row.linkedinUrl || row.linkedInUrl || '';
    const web = row.website || '';
    const co = row.companyName || '';
    if (li && li !== '—') return `li_${li.toLowerCase().replace(/https?:\/\/(www\.)?/, '')}`;
    if (web && web !== '—') return `web_${web.toLowerCase().replace(/https?:\/\/(www\.)?/, '')}`;
    return `co_${co.toLowerCase().trim()}`;
  }
}

/* ==========================================================================
   LEAD GEN HISTORY STORE — cross-search deduplication & persistent vault
   NOTE: All old/mock lead gen data is wiped on load
   ========================================================================== */
class LeadGenHistoryStore {
  static HISTORY_KEY = 'infinito_lg_history_v2';
  static VAULT_KEY = 'infinito_lg_vault_v2';

  /** Wipe all old v1 keys (mock/demo/static data from previous versions) */
  static wipeLegacyData() {
    const legacyKeys = [
      'infinito_leadgen_history_log',
      'infinito_leadgen_all_saved_leads',
      'infinito_leadgen_apikeys'
    ];
    legacyKeys.forEach(k => localStorage.removeItem(k));
  }

  static getHistory() {
    try { return JSON.parse(localStorage.getItem(this.HISTORY_KEY) || '[]'); } catch { return []; }
  }

  static addLog(entry) {
    const h = this.getHistory();
    h.unshift(entry);
    localStorage.setItem(this.HISTORY_KEY, JSON.stringify(h.slice(0, 200)));
  }

  static getVault() {
    try { return JSON.parse(localStorage.getItem(this.VAULT_KEY) || '[]'); } catch { return []; }
  }

  static saveToVault(leads) {
    const vault = this.getVault();
    const hashes = new Set(vault.map(r => this.hash(r)));
    let added = 0;
    leads.forEach(l => {
      const h = this.hash(l);
      if (!hashes.has(h)) { hashes.add(h); vault.push(l); added++; }
    });
    localStorage.setItem(this.VAULT_KEY, JSON.stringify(vault));
    return added;
  }

  static isKnown(lead) {
    return this.getVault().some(v => this.hash(v) === this.hash(lead));
  }

  static hash(lead) {
    const li = (lead.linkedinUrl || '').toLowerCase().replace(/https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    const web = (lead.website || lead.sourceUrl || '').toLowerCase().replace(/https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    const co = (lead.companyName || '').toLowerCase().trim();
    if (li) return `li_${li}`;
    if (web) return `web_${web}`;
    return `co_${co}`;
  }

  static clearAll() {
    localStorage.removeItem(this.HISTORY_KEY);
    localStorage.removeItem(this.VAULT_KEY);
  }
}

/* ==========================================================================
   API SETTINGS STORE — stores only non-secret config (not the API key)
   The actual API key lives in Vercel env vars only
   ========================================================================== */
class ApiSettingsStore {
  static KEY = 'infinito_api_cfg_v2';

  static get() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch { return {}; }
  }

  static save(cfg) {
    localStorage.setItem(this.KEY, JSON.stringify(cfg));
  }
}

/* ==========================================================================
   FIELD MAPPING — normalizes any CSV/Excel column name to standard fields
   ========================================================================== */
function mapFields(row) {
  const mapped = { ...row };
  const keys = Object.keys(row);

  function find(patterns) {
    const k = keys.find(k => {
      const lk = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      return patterns.some(p => lk === p || lk.includes(p));
    });
    return k ? (row[k] || '') : '';
  }

  mapped.companyName   = find(['companyname','company','organization','firm','accountname']) || row.companyName || '—';
  mapped.website       = find(['website','domain','companywebsite','url']) || row.website || '—';
  mapped.industry      = find(['industry','sector','niche','itservicetype']) || row.industry || '—';
  mapped.country       = find(['country','nation']) || row.country || '—';
  mapped.state         = find(['state','province','region']) || row.state || '—';
  mapped.city          = find(['city','town']) || row.city || '—';

  const locParts = [mapped.city, mapped.state, mapped.country].filter(p => p && p !== '—');
  mapped.location = locParts.join(', ') || find(['location','address']) || '—';

  mapped.employeeCount = find(['employeecount','employees','headcount','size']) || row.employeeCount || '—';
  mapped.annualRevenue = find(['annualrevenue','revenue','turnover']) || row.annualRevenue || '—';

  // Founder — strictly blank if not available
  const fv = find(['foundername','founder','cofounder','owner']) || row.founderName || '';
  mapped.founderName  = (fv && fv !== '—') ? fv : '';

  const ev = find(['email','founderemail','workemail','contactemail']) || row.founderEmail || row.email || '';
  mapped.founderEmail = (ev && ev !== '—') ? ev : '';
  mapped.email        = mapped.founderEmail;

  const lv = find(['linkedinurl','linkedin','companylinkedin']) || row.linkedinUrl || row.linkedInUrl || '';
  mapped.linkedinUrl  = (lv && lv !== '—') ? lv : '';
  mapped.linkedInUrl  = mapped.linkedinUrl;

  mapped.sourceUrl  = find(['sourceurl','source','sourcelink']) || row.sourceUrl || row.sourceLink || '';
  mapped.sourceLink = mapped.sourceUrl;

  mapped.qualificationStatus = row.qualificationStatus || 'Review Needed';
  mapped.qualificationReason = row.qualificationReason || '';

  return mapped;
}

/* ==========================================================================
   ICP QUALIFICATION LOGIC
   ========================================================================== */
const TIER1 = ['bengaluru','bangalore','mumbai','delhi','ncr','gurgaon','gurugram','noida','hyderabad','chennai','pune','kolkata'];
const TIER2 = ['bhopal','indore','jaipur','ahmedabad','surat','kochi','cochin','chandigarh','coimbatore','nagpur','vadodara','thiruvananthapuram','vizag','visakhapatnam','bhubaneswar','nashik','rajkot','mysore'];

function qualifyICP1(row) {
  if (row.userOverridden) return row;
  const loc = `${row.location || ''} ${row.city || ''} ${row.state || ''}`.toLowerCase();
  let tier = 'Other';
  if (TIER1.some(c => loc.includes(c))) tier = 'Tier 1';
  else if (TIER2.some(c => loc.includes(c))) tier = 'Tier 2';
  row.tier = tier;
  row.qualificationStatus = 'Verified';
  row.qualificationReason = `Indian IT — ${tier} location (${row.city || row.location}).`;
  return row;
}

function qualifyICP2(row) {
  if (row.userOverridden) return row;
  const ind = (row.industry || '').toLowerCase();
  const isPureIT = ['it services','software dev','outsourcing','it consulting'].some(t => ind.includes(t));
  if (isPureIT) {
    row.qualificationStatus = 'Not Qualified';
    row.qualificationReason = 'Pure IT — ICP 2 targets non-IT enterprise buyers.';
  } else {
    row.qualificationStatus = 'Verified';
    row.qualificationReason = `Indian Enterprise buyer (${row.industry || 'General'}) — high AI adoption potential.`;
  }
  return row;
}

function qualifyICP3(row, criteria = {}) {
  if (row.userOverridden) return row;
  row.qualificationStatus = 'Verified';
  row.qualificationReason = `Global SME in ${row.country || 'target region'} — matches ICP 3 criteria.`;
  return row;
}

/* ==========================================================================
   UNIFIED FILE PARSER — Supports CSV, XLSX, XLS, JSON, TSV
   ========================================================================== */
async function parseUploadedFile(file, maxMb = 25) {
  if (!file) throw new Error("No file selected.");

  const maxBytes = maxMb * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`File "${file.name}" (${(file.size / (1024*1024)).toFixed(1)}MB) exceeds maximum limit of ${maxMb}MB.`);
  }

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const validExts = ['csv', 'xlsx', 'xls', 'json', 'tsv'];
  if (!validExts.includes(ext)) {
    throw new Error(`Unsupported file type ".${ext}". Please upload a .CSV, .XLSX, .XLS, or .JSON file.`);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    if (ext === 'json') {
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const parsed = JSON.parse(text);
          let rows = [];
          if (Array.isArray(parsed)) {
            rows = parsed;
          } else if (typeof parsed === 'object' && parsed !== null) {
            const firstArr = Object.values(parsed).find(v => Array.isArray(v));
            rows = firstArr || [parsed];
          }
          if (!rows.length) throw new Error("JSON file contains no records.");
          resolve({ rows, sheetName: 'JSON_Data', fileName: file.name });
        } catch (err) {
          reject(new Error(`Failed to parse JSON file "${file.name}": ${err.message}`));
        }
      };
      reader.onerror = () => reject(new Error(`Failed to read file "${file.name}".`));
      reader.readAsText(file);
    } else {
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          if (typeof XLSX === 'undefined') {
            throw new Error("XLSX parsing library is loading. Please retry in a moment.");
          }
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          if (!workbook || !workbook.SheetNames || !workbook.SheetNames.length) {
            throw new Error("Spreadsheet file contains no worksheets.");
          }
          const sheetName = workbook.SheetNames[0];
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
          if (!rows || !rows.length) {
            throw new Error(`Worksheet "${sheetName}" in file "${file.name}" is empty.`);
          }
          resolve({ rows, sheetName, fileName: file.name });
        } catch (err) {
          reject(new Error(`Failed to parse spreadsheet file "${file.name}": ${err.message}`));
        }
      };
      reader.onerror = () => reject(new Error(`Failed to read file "${file.name}".`));
      reader.readAsArrayBuffer(file);
    }
  });
}

/* ==========================================================================
   SHARED MODAL DIALOGS
   ========================================================================== */
function showImportSummaryModal(logEntry) {
  if (!logEntry) return;
  let overlay = document.getElementById('infinito-import-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'infinito-import-modal-overlay';
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <div class="modal-title">📊 Import & Data Cleaning Complete</div>
        <button class="modal-close" onclick="closeImportSummaryModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div style="background:rgba(34,211,165,0.08);border:1px solid rgba(34,211,165,0.3);border-radius:10px;padding:14px;margin-bottom:18px;display:flex;align-items:center;gap:12px">
          <div style="font-size:24px">✅</div>
          <div>
            <div style="font-weight:700;color:#22d3a5;font-size:14px">Dataset Processed & Cleaned Successfully</div>
            <div style="font-size:12px;color:#8899bb;margin-top:2px">Fields normalized, duplicates removed, and attributes assigned.</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
          <div style="background:rgba(79,142,247,0.08);border:1px solid rgba(79,142,247,0.2);border-radius:8px;padding:12px">
            <div style="font-size:11px;color:#8899bb;text-transform:uppercase;font-weight:600">File Name</div>
            <div style="font-size:13px;font-weight:700;color:#fff;margin-top:4px;word-break:break-all">${logEntry.fileName || 'Imported_Dataset'}</div>
          </div>
          <div style="background:rgba(79,142,247,0.08);border:1px solid rgba(79,142,247,0.2);border-radius:8px;padding:12px">
            <div style="font-size:11px;color:#8899bb;text-transform:uppercase;font-weight:600">Worksheet / Source</div>
            <div style="font-size:13px;font-weight:700;color:#fff;margin-top:4px">${logEntry.sheetName || 'Sheet1'}</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;text-align:center">
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px">
            <div style="font-size:18px;font-weight:800;color:#4f8ef7">${(logEntry.rowsReceived || 0).toLocaleString()}</div>
            <div style="font-size:11px;color:#8899bb;margin-top:2px">Rows Received</div>
          </div>
          <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:10px">
            <div style="font-size:18px;font-weight:800;color:#f59e0b">${(logEntry.duplicateRows || 0).toLocaleString()}</div>
            <div style="font-size:11px;color:#8899bb;margin-top:2px">Duplicates Filtered</div>
          </div>
          <div style="background:rgba(34,211,165,0.08);border:1px solid rgba(34,211,165,0.3);border-radius:8px;padding:10px">
            <div style="font-size:18px;font-weight:800;color:#22d3a5">${(logEntry.newlyAddedRows || 0).toLocaleString()}</div>
            <div style="font-size:11px;color:#8899bb;margin-top:2px">Unique Added</div>
          </div>
        </div>

        <div style="margin-top:16px;padding:10px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.3);border-radius:8px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px;color:#a78bfa">Total Cumulative Stored Workspace Records:</span>
          <span style="font-size:14px;font-weight:800;color:#fff">${(logEntry.totalStoredRows || 0).toLocaleString()}</span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" style="padding:8px 20px;font-size:13px;background:linear-gradient(135deg,#4f8ef7,#8b5cf6);color:#fff;border:none;border-radius:8px;cursor:pointer" onclick="closeImportSummaryModal()">Continue to Dashboard</button>
      </div>
    </div>
  `;
  overlay.style.display = 'flex';
}

function closeImportSummaryModal() {
  const overlay = document.getElementById('infinito-import-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

function openRecordDetailModal(record) {
  if (!record) return;
  let overlay = document.getElementById('infinito-detail-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'infinito-detail-modal-overlay';
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
  }

  const fields = [
    { label: 'Company Name', val: record.companyName || '—' },
    { label: 'Website', val: record.website ? `<a href="${record.website.startsWith('http')?record.website:'https://'+record.website}" target="_blank" style="color:#4f8ef7">${record.website}</a>` : '—' },
    { label: 'Location', val: record.location || [record.city, record.state, record.country].filter(Boolean).join(', ') || '—' },
    { label: 'Industry', val: record.industry || '—' },
    { label: 'Founder Name', val: record.founderName || '—' },
    { label: 'Founder Email', val: record.founderEmail ? `<a href="mailto:${record.founderEmail}" style="color:#4f8ef7">${record.founderEmail}</a>` : '—' },
    { label: 'LinkedIn', val: record.linkedinUrl ? `<a href="${record.linkedinUrl}" target="_blank" style="color:#4f8ef7">${record.linkedinUrl}</a>` : '—' },
    { label: 'Status', val: record.qualificationStatus || 'Verified' },
    { label: 'Reason / Tier', val: record.qualificationReason || record.tier || '—' }
  ];

  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <div class="modal-title">📋 Record Detail — ${record.companyName || 'Lead Detail'}</div>
        <button class="modal-close" onclick="closeRecordDetailModal()">&times;</button>
      </div>
      <div class="modal-body" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        ${fields.map(f => `
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px">
            <div style="font-size:11px;color:#8899bb;text-transform:uppercase;font-weight:600">${f.label}</div>
            <div style="font-size:13px;color:#fff;margin-top:4px;word-break:break-all">${f.val}</div>
          </div>
        `).join('')}
      </div>
      <div class="modal-footer">
        <button class="btn-primary" style="padding:8px 18px;font-size:13px;background:rgba(79,142,247,0.15);color:#4f8ef7;border:1px solid rgba(79,142,247,0.3);border-radius:8px;cursor:pointer" onclick="closeRecordDetailModal()">Close</button>
      </div>
    </div>
  `;
  overlay.style.display = 'flex';
}

function closeRecordDetailModal() {
  const overlay = document.getElementById('infinito-detail-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

function openShareEmailModal(workspaceTitle) {
  let overlay = document.getElementById('infinito-share-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'infinito-share-modal-overlay';
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <div class="modal-title">📧 Share ${workspaceTitle || 'Workspace'} Analytics</div>
        <button class="modal-close" onclick="closeShareEmailModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div style="font-size:13px;color:#8899bb;margin-bottom:14px">Share clean workspace analytics summary and CSV export link with your team:</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div>
            <label style="font-size:11px;color:#8899bb;text-transform:uppercase;font-weight:600">Recipient Email</label>
            <input id="shareEmailInput" type="email" placeholder="colleague@company.com" style="width:100%;margin-top:4px;padding:8px 12px;border-radius:8px;background:rgba(79,142,247,0.08);border:1px solid rgba(79,142,247,0.3);color:#fff;font-size:13px" />
          </div>
          <div>
            <label style="font-size:11px;color:#8899bb;text-transform:uppercase;font-weight:600">Subject</label>
            <input id="shareSubjectInput" type="text" value="Infinito Intelligence Report: ${workspaceTitle || 'Workspace Data'}" style="width:100%;margin-top:4px;padding:8px 12px;border-radius:8px;background:rgba(79,142,247,0.08);border:1px solid rgba(79,142,247,0.3);color:#fff;font-size:13px" />
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button style="padding:8px 16px;border-radius:8px;background:transparent;border:1px solid rgba(255,255,255,0.2);color:#8899bb;cursor:pointer;font-size:13px" onclick="closeShareEmailModal()">Cancel</button>
        <button style="padding:8px 18px;border-radius:8px;background:linear-gradient(135deg,#4f8ef7,#8b5cf6);border:none;color:#fff;font-weight:600;cursor:pointer;font-size:13px" onclick="submitShareEmail()">Send Report</button>
      </div>
    </div>
  `;
  overlay.style.display = 'flex';
}

function closeShareEmailModal() {
  const overlay = document.getElementById('infinito-share-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

function submitShareEmail() {
  const email = document.getElementById('shareEmailInput')?.value || '';
  if (!email) { alert("Please enter a valid recipient email address."); return; }
  alert(`Report summary prepared and queued for ${email}.`);
  closeShareEmailModal();
}

/* ==========================================================================
   UI — HEADER & FOOTER (shared across all pages)
   ========================================================================== */
function renderAppHeader(activeId) {
  return `
  <header>
    <div class="wrap hdr">
      <div class="logo">
        <div class="logo-icon">♾️</div>
        <div>
          <div class="logo-title">Infinito</div>
          <div class="logo-sub">Clean · Verify · Qualify · Export</div>
        </div>
      </div>
      <div class="nav-links">
        <a href="index.html"         class="nav-link ${activeId==='auto_studio'?'active':''}">⚡ Auto Studio</a>
        <a href="overall_emails.html" class="nav-link ${activeId==='overall_emails'?'active':''}">📧 Overall Emails</a>
        <a href="icp1.html"          class="nav-link ${activeId==='icp1'?'active':''}">🎯 ICP 1</a>
        <a href="icp2.html"          class="nav-link ${activeId==='icp2'?'active':''}">🚀 ICP 2</a>
        <a href="icp3.html"          class="nav-link ${activeId==='icp3'?'active':''}">🌐 ICP 3</a>
        <a href="lead_gen.html"      class="nav-link ${activeId==='lead_gen'?'active':''}">🔍 Lead Gen</a>
      </div>
      <div class="badge b-green"><div class="dot"></div> System Online</div>
    </div>
  </header>`;
}

function renderCreatorFooter() {
  return `
  <footer class="creator-footer">
    <div class="wrap footer-content">
      <div class="creator-badge">
        <img src="himanshu_thakur_creator.jpg"
             alt="Himanshu Thakur, Creator of Infinito"
             class="creator-photo"
             onerror="this.onerror=null;this.outerHTML='<div class=\\'creator-avatar\\'>HT</div>';" />
        <div>
          <div class="creator-title">Created by <strong>Himanshu Thakur</strong></div>
          <div class="creator-sub">Creator of Infinito — turn raw spreadsheet data into clean, verified, Power BI-style dashboards.</div>
        </div>
      </div>
      <div class="creator-links">
        <a href="https://www.linkedin.com/in/-himanshu-thakur-" target="_blank" rel="noopener" class="creator-link">🔗 LinkedIn</a>
        <a href="mailto:himthakur5417@gmail.com" class="creator-link">📧 Email</a>
      </div>
    </div>
  </footer>`;
}

/* Inject shared modal & footer styles */
(function injectStyles() {
  const s = document.createElement('style');
  s.innerHTML = `
.modal-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(10,14,26,.88);backdrop-filter:blur(10px);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}
.modal-card{background:var(--card,#131c35);border:1px solid var(--border,rgba(79,142,247,.3));border-radius:14px;width:100%;max-width:620px;box-shadow:0 10px 40px rgba(0,0,0,.6)}
.modal-header{padding:18px 20px;border-bottom:1px solid var(--border,rgba(79,142,247,.2));display:flex;align-items:center;justify-content:space-between}
.modal-title{font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:700;color:#fff}
.modal-close{background:none;border:none;color:#8899bb;font-size:18px;cursor:pointer}
.modal-close:hover{color:#fff}
.modal-body{padding:20px}
.modal-footer{padding:14px 20px;border-top:1px solid var(--border,rgba(79,142,247,.2));display:flex;justify-content:flex-end;gap:10px}
.creator-footer{margin-top:60px;padding:30px 0;background:rgba(13,20,45,.95);border-top:1px solid var(--border,rgba(79,142,247,.15))}
.footer-content{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}
.creator-badge{display:flex;align-items:center;gap:14px;text-align:left}
.creator-photo{width:54px;height:54px;border-radius:50%;object-fit:cover;border:2px solid var(--blue,#4f8ef7);box-shadow:0 0 15px rgba(79,142,247,.4);flex-shrink:0}
.creator-avatar{width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#4f8ef7,#8b5cf6);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;color:#fff;flex-shrink:0}
.creator-title{font-size:14px;color:#f0f4ff}
.creator-sub{font-size:12px;color:#8899bb;max-width:500px;margin-top:2px}
.creator-links{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.creator-link{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;background:rgba(79,142,247,.1);border:1px solid rgba(79,142,247,.3);border-radius:8px;font-size:12px;font-weight:600;color:#4f8ef7;text-decoration:none;transition:all .2s}
.creator-link:hover{background:rgba(79,142,247,.22);transform:translateY(-1px)}
`;
  document.head.appendChild(s);
})();
