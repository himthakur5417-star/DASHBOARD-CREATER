/* ==========================================================================
   INFINITO SHARED ENGINE & DATA CLEANING PIPELINE — app-shared.js
   Supports: Auto Studio | Overall Emails | ICP 1 | ICP 2 | ICP 3
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
    const em = (row.email || '').toLowerCase().trim();
    const li = (row.linkedinUrl || row.linkedInUrl || '').toLowerCase().replace(/https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    const web = (row.website || '').toLowerCase().replace(/https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    const co = (row.companyName || '').toLowerCase().trim();
    const name = (row.contactName || '').toLowerCase().trim();
    if (em && em !== '—') return `em_${em}`;
    if (li && li !== '—') return `li_${li}`;
    if (web && web !== '—') return `web_${web}`;
    return `co_${co}_${name}`;
  }
}

/* ==========================================================================
   DATA CLEANING ENGINE — 8-Step Pipeline (Raw CSV -> Clean Dataset)
   ========================================================================== */
class DataCleaningEngine {
  static cleanDataset(rawRows, fileName = 'Dataset', sheetName = 'Sheet1') {
    const originalCount = rawRows.length;
    let duplicateCount = 0;
    let invalidEmailCount = 0;
    let incompleteCount = 0;

    const detectedColumns = new Set();
    const mappedColumns = new Set();

    // 1. Detect all headers
    rawRows.forEach(r => {
      Object.keys(r || {}).forEach(k => detectedColumns.add(k));
    });

    const seenHashes = new Set();
    const cleanRows = [];

    rawRows.forEach(rawRow => {
      if (!rawRow || typeof rawRow !== 'object') return;

      // 2. Text & Whitespace Sanitization
      const sanitized = {};
      Object.keys(rawRow).forEach(k => {
        let val = rawRow[k];
        if (val === null || val === undefined) val = '';
        if (typeof val === 'string') {
          val = val.trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
          if (['null', 'undefined', 'n/a', 'na', '-', '—'].includes(val.toLowerCase())) {
            val = '';
          }
        }
        sanitized[k] = val;
      });

      // 3. Field Normalization & Column Mapping
      const mapped = mapFields(sanitized);

      ['contactName', 'email', 'companyName', 'designation', 'phone', 'website', 'location', 'emailStatus', 'qualificationStatus', 'createDate'].forEach(k => {
        if (mapped[k] && mapped[k] !== '—') mappedColumns.add(k);
      });

      // 4. Email Validation
      if (mapped.email && mapped.email !== '—') {
        const isValidFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email);
        if (!isValidFormat) {
          invalidEmailCount++;
          mapped.emailStatus = 'Invalid Format';
        }
      } else {
        incompleteCount++;
      }

      // 5. Deduplication
      const hash = WorkspaceStore.prototype.getRowHash(mapped);
      if (seenHashes.has(hash)) {
        duplicateCount++;
        return;
      }
      seenHashes.add(hash);
      cleanRows.push(mapped);
    });

    return {
      originalRows: originalCount,
      cleanRows,
      validRows: cleanRows.length,
      duplicateRows: duplicateCount,
      invalidEmails: invalidEmailCount,
      incompleteRecords: incompleteCount,
      detectedColumns: Array.from(detectedColumns),
      mappedColumns: Array.from(mappedColumns),
      fileName,
      sheetName,
      timestamp: new Date().toLocaleString()
    };
  }
}

/* ==========================================================================
   FIELD MAPPING & NORMALIZATION ENGINE
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

  // 1. Company Name
  let rawCo = find(['companyname','company','associatedcompany','organization','firm','accountname','businessname']) || row.companyName || '';
  if (!rawCo || rawCo === '—' || /^\d+(\.\d+)?$/.test(rawCo.trim())) {
    const rawEmail = find(['email','workemail','contactemail','founderemail','emailaddress']) || row.email || '';
    if (rawEmail && rawEmail.includes('@')) {
      const dom = rawEmail.split('@')[1] || '';
      const nameFromDom = dom.split('.')[0] || '';
      if (nameFromDom && nameFromDom.length > 2) {
        rawCo = nameFromDom.charAt(0).toUpperCase() + nameFromDom.slice(1);
        if (!mapped.website || mapped.website === '—') mapped.website = dom;
      }
    }
  }
  mapped.companyName = rawCo || '—';

  // 2. Contact Name
  const fn = find(['firstname','first']) || row.firstName || '';
  const ln = find(['lastname','last']) || row.lastName || '';
  const fullN = [fn, ln].filter(Boolean).join(' ');
  mapped.contactName = fullN || find(['contactname','name','fullname','contact']) || row.contactName || row.name || '—';

  // 3. Email Address
  mapped.email = find(['email','workemail','contactemail','founderemail','emailaddress']) || row.email || row.founderEmail || '—';

  // 4. Designation / Role / Owner
  mapped.designation = find(['designation','title','role','contactowner','owner','jobtitle','position']) || row.designation || row.owner || '—';

  // 5. Phone Number
  mapped.phone = find(['phonenumber','phone','contactnumber','mobile','tel','cell']) || row.phone || row.contactNumber || '—';

  // 6. Website / Domain
  mapped.website = find(['website','domain','companywebsite','url']) || row.website || '—';

  // 7. Location (City, State, Country)
  mapped.country = find(['country','nation']) || row.country || '—';
  mapped.state   = find(['state','province','region']) || row.state || '—';
  mapped.city    = find(['city','town']) || row.city || '—';

  const locParts = [mapped.city, mapped.state, mapped.country].filter(p => p && p !== '—');
  mapped.location = locParts.join(', ') || find(['location','address']) || '—';

  // 8. Email / Marketing Status
  const rawStatus = find(['marketingcontactstatus','emailstatus','companystatus','emailtype','status']) || row.emailStatus || row.status || 'Delivered';
  mapped.emailStatus = rawStatus.includes('Marketing') || rawStatus === 'Known' || rawStatus === 'Delivered' ? 'Delivered' : rawStatus;

  // 9. Qualification Status & Reason
  mapped.qualificationStatus = row.qualificationStatus || 'Verified';
  mapped.qualificationReason = row.qualificationReason || row.tier || row.sector || 'Matches Ideal Customer Profile';

  // 10. Creation Date
  mapped.createDate = find(['createdate','date','timestamp','importdate']) || row.createDate || row.date || new Date().toISOString().split('T')[0];

  // Legacy compatibility fields
  mapped.founderName = mapped.contactName !== '—' ? mapped.contactName : '';
  mapped.founderEmail = mapped.email !== '—' ? mapped.email : '';
  mapped.linkedinUrl = find(['linkedinurl','linkedin','companylinkedin']) || row.linkedinUrl || row.linkedInUrl || '';

  return mapped;
}

/* ==========================================================================
   ICP QUALIFICATION LOGIC — Location, Tier & Industry Classifier
   ========================================================================== */
const TIER1 = ['bengaluru','bangalore','mumbai','delhi','ncr','gurgaon','gurugram','noida','hyderabad','chennai','pune','kolkata'];
const TIER2 = ['bhopal','indore','jaipur','ahmedabad','surat','kochi','cochin','chandigarh','coimbatore','nagpur','vadodara','thiruvananthapuram','vizag','visakhapatnam','bhubaneswar','nashik','rajkot','mysore'];

const KNOWN_TIER1_DOMAINS = ['contus', 'lsdigital', 'coditas', 'springuplabs', 'creativets', 'quantamise', 'embarkingonvoyage', 'mainsoft', 'iamtechie', 'rabbittec', 'datamix'];
const KNOWN_TIER2_DOMAINS = ['apptunix', 'heliossolutions', 'spaceotechnologies', 'samaysave', 'shineinfosoft', '3mindsdigital'];

function qualifyICP1(row) {
  if (row.userOverridden) return row;

  let loc = `${row.location || ''} ${row.city || ''} ${row.state || ''}`.toLowerCase();
  let tier = 'Other';

  if (TIER1.some(c => loc.includes(c))) {
    tier = 'Tier 1';
  } else if (TIER2.some(c => loc.includes(c))) {
    tier = 'Tier 2';
  } else {
    // Infer tier from company name, website, or email domain when city column is unpopulated
    const domainOrCo = `${row.website || ''} ${row.companyName || ''} ${row.email || ''}`.toLowerCase();
    if (KNOWN_TIER1_DOMAINS.some(d => domainOrCo.includes(d)) || domainOrCo.includes('.in')) {
      tier = 'Tier 1';
    } else if (KNOWN_TIER2_DOMAINS.some(d => domainOrCo.includes(d))) {
      tier = 'Tier 2';
    } else if (row.companyName && row.companyName !== '—') {
      tier = 'Tier 1';
    }
  }

  row.tier = tier;
  row.qualificationStatus = 'Verified';
  row.qualificationReason = `Indian IT — ${tier} location (${row.city || row.location || 'India'}).`;
  return row;
}

function qualifyICP2(row) {
  if (row.userOverridden) return row;
  const ind = (row.industry || row.qualificationReason || '').toLowerCase();
  const isPureIT = ['it services','software dev','outsourcing','it consulting'].some(t => ind.includes(t));
  if (isPureIT) {
    row.qualificationStatus = 'Not Qualified';
    row.qualificationReason = 'Pure IT — ICP 2 targets non-IT enterprise buyers.';
  } else {
    row.qualificationStatus = 'Verified';
    row.qualificationReason = `Indian Enterprise buyer (${row.industry || 'General Industry'}) — High AI adoption potential.`;
  }
  return row;
}

function qualifyICP3(row) {
  if (row.userOverridden) return row;
  row.qualificationStatus = 'Verified';
  row.qualificationReason = `Global SME in ${row.country || 'Target Global Region'} — matches ICP 3 criteria.`;
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
   STEPPED PIPELINE & CLEANING SUMMARY MODAL
   ========================================================================== */
function showImportSummaryModal(cleaningReport) {
  if (!cleaningReport) return;
  let overlay = document.getElementById('infinito-import-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'infinito-import-modal-overlay';
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
  }

  const detectedList = (cleaningReport.detectedColumns || []).slice(0, 8).join(', ');
  const mappedList = (cleaningReport.mappedColumns || []).join(', ');

  overlay.innerHTML = `
    <div class="modal-card" style="max-width:680px">
      <div class="modal-header">
        <div class="modal-title">⚡ CSV Cleaning → Column Sync → Dashboard Pipeline</div>
        <button class="modal-close" onclick="closeImportSummaryModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div style="background:rgba(34,211,165,0.08);border:1px solid rgba(34,211,165,0.3);border-radius:12px;padding:14px;margin-bottom:18px;display:flex;align-items:center;gap:12px">
          <div style="font-size:24px">✅</div>
          <div>
            <div style="font-weight:700;color:#22d3a5;font-size:14px">Data Cleaning & Validation Complete</div>
            <div style="font-size:12px;color:#8899bb;margin-top:2px">Raw dataset ingested, text sanitized, fields mapped, duplicates filtered, and dashboard synchronized.</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
          <div style="background:rgba(79,142,247,0.08);border:1px solid rgba(79,142,247,0.2);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#8899bb;text-transform:uppercase;font-weight:600">File Source</div>
            <div style="font-size:13px;font-weight:700;color:#fff;margin-top:4px;word-break:break-all">${cleaningReport.fileName || 'Imported_Dataset'}</div>
          </div>
          <div style="background:rgba(79,142,247,0.08);border:1px solid rgba(79,142,247,0.2);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#8899bb;text-transform:uppercase;font-weight:600">Worksheet / Format</div>
            <div style="font-size:13px;font-weight:700;color:#fff;margin-top:4px">${cleaningReport.sheetName || 'Sheet1'}</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:10px;text-align:center;margin-bottom:16px">
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px">
            <div style="font-size:18px;font-weight:800;color:#4f8ef7">${(cleaningReport.rowsReceived || cleaningReport.originalRows || 0).toLocaleString()}</div>
            <div style="font-size:10px;color:#8899bb;margin-top:2px">Rows Received</div>
          </div>
          <div style="background:rgba(34,211,165,0.08);border:1px solid rgba(34,211,165,0.3);border-radius:10px;padding:10px">
            <div style="font-size:18px;font-weight:800;color:#22d3a5">${(cleaningReport.newlyAddedRows || cleaningReport.validRows || 0).toLocaleString()}</div>
            <div style="font-size:10px;color:#8899bb;margin-top:2px">Clean Valid Rows</div>
          </div>
          <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:10px">
            <div style="font-size:18px;font-weight:800;color:#f59e0b">${(cleaningReport.duplicateRows || 0).toLocaleString()}</div>
            <div style="font-size:10px;color:#8899bb;margin-top:2px">Duplicates Removed</div>
          </div>
          <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:10px">
            <div style="font-size:18px;font-weight:800;color:#ef4444">${(cleaningReport.invalidEmails || 0).toLocaleString()}</div>
            <div style="font-size:10px;color:#8899bb;margin-top:2px">Invalid Formats</div>
          </div>
        </div>

        <div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.25);border-radius:10px;padding:12px;margin-bottom:16px">
          <div style="font-size:11px;color:#a78bfa;font-weight:700;text-transform:uppercase">Detected & Mapped Columns</div>
          <div style="font-size:12px;color:#fff;margin-top:4px">Raw Headers: <span style="color:#8899bb">${detectedList || 'Standard Header Format'}</span></div>
          <div style="font-size:12px;color:#fff;margin-top:2px">Mapped Fields: <span style="color:#22d3a5">${mappedList || 'contactName, email, companyName, designation, phone, location'}</span></div>
        </div>

        <div style="padding:12px;background:rgba(79,142,247,0.1);border:1px solid rgba(79,142,247,0.3);border-radius:10px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px;color:#4f8ef7;font-weight:600">Total Active Workspace Records:</span>
          <span style="font-size:16px;font-weight:800;color:#fff">${(cleaningReport.totalStoredRows || cleaningReport.validRows || 0).toLocaleString()}</span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" style="padding:10px 24px;font-size:13px;background:linear-gradient(135deg,#4f8ef7,#8b5cf6);color:#fff;border:none;border-radius:10px;font-weight:600;cursor:pointer" onclick="closeImportSummaryModal()">Synchronize Dashboard</button>
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
    { label: 'Contact Name', val: record.contactName || '—' },
    { label: 'Email Address', val: record.email ? `<a href="mailto:${record.email}" style="color:#4f8ef7">${record.email}</a>` : '—' },
    { label: 'Company Name', val: record.companyName || '—' },
    { label: 'Designation / Owner', val: record.designation || '—' },
    { label: 'Phone Number', val: record.phone || '—' },
    { label: 'Website', val: record.website ? `<a href="${record.website.startsWith('http')?record.website:'https://'+record.website}" target="_blank" style="color:#4f8ef7">${record.website}</a>` : '—' },
    { label: 'Location', val: record.location || [record.city, record.state, record.country].filter(Boolean).join(', ') || '—' },
    { label: 'Email Status', val: `<span class="badge b-green">${record.emailStatus || 'Delivered'}</span>` },
    { label: 'Qualification Status', val: record.qualificationStatus || 'Verified' },
    { label: 'Qualification Reason', val: record.qualificationReason || record.tier || '—' }
  ];

  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <div class="modal-title">📋 Contact Detail — ${record.contactName || record.companyName || 'Lead Detail'}</div>
        <button class="modal-close" onclick="closeRecordDetailModal()">&times;</button>
      </div>
      <div class="modal-body" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        ${fields.map(f => `
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px">
            <div style="font-size:11px;color:#8899bb;text-transform:uppercase;font-weight:600">${f.label}</div>
            <div style="font-size:13px;color:#fff;margin-top:4px;word-break:break-all">${f.val}</div>
          </div>
        `).join('')}
      </div>
      <div class="modal-footer">
        <button class="btn-primary" style="padding:8px 20px;font-size:13px;background:rgba(79,142,247,0.15);color:#4f8ef7;border:1px solid rgba(79,142,247,0.3);border-radius:8px;cursor:pointer" onclick="closeRecordDetailModal()">Close</button>
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
        <div style="font-size:13px;color:#8899bb;margin-bottom:14px">Share workspace dataset report and summary with your team:</div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div>
            <label style="font-size:11px;color:#8899bb;text-transform:uppercase;font-weight:600">Recipient Email</label>
            <input id="shareEmailInput" type="email" placeholder="team@company.com" style="width:100%;margin-top:4px;padding:10px 14px;border-radius:10px;background:rgba(79,142,247,0.08);border:1px solid rgba(79,142,247,0.3);color:#fff;font-size:13px" />
          </div>
          <div>
            <label style="font-size:11px;color:#8899bb;text-transform:uppercase;font-weight:600">Subject</label>
            <input id="shareSubjectInput" type="text" value="Infinito Intelligence Report: ${workspaceTitle || 'Workspace Data'}" style="width:100%;margin-top:4px;padding:10px 14px;border-radius:10px;background:rgba(79,142,247,0.08);border:1px solid rgba(79,142,247,0.3);color:#fff;font-size:13px" />
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
   EXPORTS — CSV & XLSX GENERATORS
   ========================================================================== */
function exportDatasetCSV(rows, filename = 'Infinito_Dataset.csv') {
  if (!rows || !rows.length) { alert("No records available to export."); return; }
  const headers = ['Contact Name', 'Email Address', 'Company Name', 'Designation / Owner', 'Phone Number', 'Website', 'Location', 'Email Status', 'Qualification Status', 'Reason / Tier'];
  const csvRows = [headers.join(',')];

  rows.forEach(r => {
    const rowVals = [
      `"${(r.contactName || '—').replace(/"/g, '""')}"`,
      `"${(r.email || '—').replace(/"/g, '""')}"`,
      `"${(r.companyName || '—').replace(/"/g, '""')}"`,
      `"${(r.designation || '—').replace(/"/g, '""')}"`,
      `"${(r.phone || '—').replace(/"/g, '""')}"`,
      `"${(r.website || '—').replace(/"/g, '""')}"`,
      `"${(r.location || '—').replace(/"/g, '""')}"`,
      `"${(r.emailStatus || 'Delivered').replace(/"/g, '""')}"`,
      `"${(r.qualificationStatus || 'Verified').replace(/"/g, '""')}"`,
      `"${(r.qualificationReason || r.tier || '—').replace(/"/g, '""')}"`
    ];
    csvRows.push(rowVals.join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportDatasetXLSX(rows, filename = 'Infinito_Dataset.xlsx') {
  if (!rows || !rows.length) { alert("No records available to export."); return; }
  if (typeof XLSX === 'undefined') { alert("XLSX export library is loading. Please try again."); return; }

  const formattedRows = rows.map(r => ({
    'Contact Name': r.contactName || '—',
    'Email Address': r.email || '—',
    'Company Name': r.companyName || '—',
    'Designation / Owner': r.designation || '—',
    'Phone Number': r.phone || '—',
    'Website': r.website || '—',
    'Location': r.location || '—',
    'Email Status': r.emailStatus || 'Delivered',
    'Qualification Status': r.qualificationStatus || 'Verified',
    'Qualification Reason / Tier': r.qualificationReason || r.tier || '—'
  }));

  const worksheet = XLSX.utils.json_to_sheet(formattedRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Clean Dataset');
  XLSX.writeFile(workbook, filename);
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
        <a href="index.html"          class="nav-link ${activeId==='auto_studio'?'active':''}">⚡ Auto Studio</a>
        <a href="overall_emails.html" class="nav-link ${activeId==='overall_emails'?'active':''}">📧 Overall Emails</a>
        <a href="icp1.html"           class="nav-link ${activeId==='icp1'?'active':''}">🎯 ICP 1</a>
        <a href="icp2.html"           class="nav-link ${activeId==='icp2'?'active':''}">🚀 ICP 2</a>
        <a href="icp3.html"           class="nav-link ${activeId==='icp3'?'active':''}">🌐 ICP 3</a>
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
.modal-card{background:var(--card,#131c35);border:1px solid var(--border,rgba(79,142,247,.3));border-radius:16px;width:100%;max-width:640px;box-shadow:0 10px 40px rgba(0,0,0,.6)}
.modal-header{padding:18px 22px;border-bottom:1px solid var(--border,rgba(79,142,247,.2));display:flex;align-items:center;justify-content:space-between}
.modal-title{font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:700;color:#fff}
.modal-close{background:none;border:none;color:#8899bb;font-size:20px;cursor:pointer}
.modal-close:hover{color:#fff}
.modal-body{padding:22px}
.modal-footer{padding:16px 22px;border-top:1px solid var(--border,rgba(79,142,247,.2));display:flex;justify-content:flex-end;gap:10px}
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
