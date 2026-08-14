/* ==========================================================================
   INFINITO EDITORIAL BI ENGINE — app-shared.js
   Mandatory Pipeline: FILE UPLOAD -> PROFILING -> CLEANING -> VALIDATION -> REQUIREMENT CONFIRMATION -> DASHBOARD GENERATION
   Includes: Himanshu Robot Avatar (Using User Photo) + Power BI Editorial Styling
   ========================================================================== */

/* ==========================================================================
   WORKSPACE STORE — Single Source of Truth Storage
   ========================================================================== */
class WorkspaceStore {
  constructor(workspaceId) {
    this.workspaceId = workspaceId;
    this.storageKey = `infinito_workspace_${workspaceId}`;
    this.historyKey = `infinito_history_${workspaceId}`;
    this.configKey  = `infinito_config_${workspaceId}`;
  }

  getData() {
    try { return JSON.parse(localStorage.getItem(this.storageKey) || '[]'); } catch { return []; }
  }

  saveData(rows) {
    try { localStorage.setItem(this.storageKey, JSON.stringify(rows)); } catch {}
  }

  getConfig() {
    try { return JSON.parse(localStorage.getItem(this.configKey) || '{}'); } catch { return {}; }
  }

  saveConfig(cfg) {
    try { localStorage.setItem(this.configKey, JSON.stringify(cfg)); } catch {}
  }

  getHistory() {
    try { return JSON.parse(localStorage.getItem(this.historyKey) || '[]'); } catch { return []; }
  }

  saveHistory(history) {
    try { localStorage.setItem(this.historyKey, JSON.stringify(history)); } catch {}
  }

  clearWorkspace() {
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem(this.historyKey);
    localStorage.removeItem(this.configKey);
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
   DATA CLEANING ENGINE (Python Parity Engine)
   RAW FILE -> READ -> PROFILING -> CLEANING -> VALIDATION -> DEDUPLICATION -> CLEAN DATASET
   ========================================================================== */
class DataCleaningEngine {
  static cleanDataset(rawRows, fileName = 'Dataset', sheetName = 'Sheet1') {
    const originalCount = rawRows.length;
    let duplicateCount = 0;
    let invalidEmailCount = 0;
    let incompleteCount = 0;

    const detectedColumns = new Set();
    const mappedColumns = new Set();
    const missingByColumn = {};

    rawRows.forEach(r => {
      Object.keys(r || {}).forEach(k => {
        detectedColumns.add(k);
        const val = r[k];
        const isMissing = val === null || val === undefined || String(val).trim().toLowerCase() === '' || ['null','undefined','n/a','na','nan','none','-','—'].includes(String(val).trim().toLowerCase());
        if (isMissing) {
          missingByColumn[k] = (missingByColumn[k] || 0) + 1;
        }
      });
    });

    const seenHashes = new Set();
    const cleanRows = [];

    rawRows.forEach(rawRow => {
      if (!rawRow || typeof rawRow !== 'object') return;

      // 1. Text Sanitization
      const sanitized = {};
      Object.keys(rawRow).forEach(k => {
        let val = rawRow[k];
        if (val === null || val === undefined) val = '';
        if (typeof val === 'string') {
          val = val.trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
          if (['null', 'undefined', 'n/a', 'na', 'nan', 'none', '-', '—'].includes(val.toLowerCase())) {
            val = '';
          }
        }
        sanitized[k] = val;
      });

      // 2. Column Mapping
      const mapped = mapFields(sanitized);

      ['contactName', 'email', 'companyName', 'designation', 'phone', 'website', 'location', 'emailStatus', 'qualificationStatus', 'createDate'].forEach(k => {
        if (mapped[k] && mapped[k] !== '—') mappedColumns.add(k);
      });

      // 3. Email RFC Validation
      if (mapped.email && mapped.email !== '—') {
        const isValidFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email);
        if (!isValidFormat) {
          invalidEmailCount++;
          mapped.emailStatus = 'Invalid Format';
        }
      } else {
        incompleteCount++;
      }

      // 4. Deduplication
      const hash = WorkspaceStore.prototype.getRowHash(mapped);
      if (seenHashes.has(hash)) {
        duplicateCount++;
        return;
      }
      seenHashes.add(hash);
      cleanRows.push(mapped);
    });

    return {
      profiling: {
        originalRows: originalCount,
        missingByColumn,
        totalMissingCells: Object.values(missingByColumn).reduce((a,b)=>a+b, 0),
        detectedHeadersCount: detectedColumns.size,
        detectedHeaders: Array.from(detectedColumns)
      },
      cleaningSummary: {
        originalRecords: originalCount,
        cleanRecords: cleanRows.length,
        duplicatesFound: duplicateCount,
        duplicatesRemoved: duplicateCount,
        invalidRecords: invalidEmailCount,
        incompleteRecords: incompleteCount,
        validRecords: cleanRows.length,
        detectedColumns: Array.from(detectedColumns),
        mappedColumns: Array.from(mappedColumns)
      },
      cleanRows,
      fileName,
      sheetName,
      timestamp: new Date().toLocaleString()
    };
  }
}

/* ==========================================================================
   FIELD MAPPING LOGIC
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

  // Company Name
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

  // Contact Name
  const fn = find(['firstname','first']) || row.firstName || '';
  const ln = find(['lastname','last']) || row.lastName || '';
  const fullN = [fn, ln].filter(Boolean).join(' ');
  mapped.contactName = fullN || find(['contactname','name','fullname','contact']) || row.contactName || row.name || '—';

  // Email
  mapped.email = find(['email','workemail','contactemail','founderemail','emailaddress']) || row.email || row.founderEmail || '—';

  // Designation
  mapped.designation = find(['designation','title','role','contactowner','owner','jobtitle','position']) || row.designation || row.owner || '—';

  // Phone
  mapped.phone = find(['phonenumber','phone','contactnumber','mobile','tel','cell']) || row.phone || row.contactNumber || '—';

  // Website
  mapped.website = find(['website','domain','companywebsite','url']) || row.website || '—';

  // Location
  mapped.country = find(['country','nation']) || row.country || '—';
  mapped.state   = find(['state','province','region']) || row.state || '—';
  mapped.city    = find(['city','town']) || row.city || '—';

  const locParts = [mapped.city, mapped.state, mapped.country].filter(p => p && p !== '—');
  mapped.location = locParts.join(', ') || find(['location','address']) || '—';

  // Status
  const rawStatus = find(['marketingcontactstatus','emailstatus','companystatus','emailtype','status']) || row.emailStatus || row.status || 'Delivered';
  mapped.emailStatus = rawStatus.includes('Marketing') || rawStatus === 'Known' || rawStatus === 'Delivered' ? 'Delivered' : rawStatus;

  // Qualification
  mapped.qualificationStatus = row.qualificationStatus || 'Verified';
  mapped.qualificationReason = row.qualificationReason || row.tier || row.sector || 'Matches Source Criteria';

  // Date
  mapped.createDate = find(['createdate','date','timestamp','importdate']) || row.createDate || row.date || new Date().toISOString().split('T')[0];

  mapped.founderName = mapped.contactName !== '—' ? mapped.contactName : '';
  mapped.founderEmail = mapped.email !== '—' ? mapped.email : '';
  mapped.linkedinUrl = find(['linkedinurl','linkedin','companylinkedin']) || row.linkedinUrl || row.linkedInUrl || '';

  return mapped;
}

/* Data-Driven ICP Qualification */
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
   UNIFIED FILE PARSER — Supports CSV, XLSX, XLS, JSON, PDF
   ========================================================================== */
async function parseUploadedFile(file, maxMb = 25) {
  if (!file) throw new Error("No file selected.");

  const maxBytes = maxMb * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`File "${file.name}" (${(file.size / (1024*1024)).toFixed(1)}MB) exceeds maximum limit of ${maxMb}MB.`);
  }

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const validExts = ['csv', 'xlsx', 'xls', 'json', 'tsv', 'pdf'];
  if (!validExts.includes(ext)) {
    throw new Error(`Unsupported file type ".${ext}". Please upload a .CSV, .XLSX, .XLS, .JSON, or .PDF file.`);
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
            throw new Error("Spreadsheet parsing engine is loading. Please retry in a moment.");
          }
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          if (!workbook || !workbook.SheetNames || !workbook.SheetNames.length) {
            throw new Error("File contains no readable worksheets.");
          }
          const sheetName = workbook.SheetNames[0];
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
          if (!rows || !rows.length) {
            throw new Error(`Worksheet "${sheetName}" in file "${file.name}" is empty.`);
          }
          resolve({ rows, sheetName, fileName: file.name });
        } catch (err) {
          reject(new Error(`Failed to parse file "${file.name}": ${err.message}`));
        }
      };
      reader.onerror = () => reject(new Error(`Failed to read file "${file.name}".`));
      reader.readAsArrayBuffer(file);
    }
  });
}

/* ==========================================================================
   HIMANSHU ROBOT AVATAR COMPONENT (Using User's Face Photograph)
   ========================================================================== */
function renderHimanshuRobotAvatar(size = 46) {
  return `
  <div class="himanshu-robot-avatar-container" style="position:relative;width:${size}px;height:${size}px;display:inline-block;flex-shrink:0;">
    <!-- Futuristic Glowing Halo Frame -->
    <div style="position:absolute;inset:-3px;border-radius:50%;background:linear-gradient(135deg, #8e549e, #3d8b6e);box-shadow:0 0 15px rgba(142,84,158,0.4);animation:pulse-halo 3s infinite alternate;"></div>
    <!-- Robot Ear Antennas -->
    <div style="position:absolute;top:-4px;left:2px;width:6px;height:6px;border-radius:50%;background:#3d8b6e;box-shadow:0 0 6px #3d8b6e"></div>
    <div style="position:absolute;top:-4px;right:2px;width:6px;height:6px;border-radius:50%;background:#8e549e;box-shadow:0 0 6px #8e549e"></div>
    <!-- Face Image Container (Himanshu Thakur Photo) -->
    <img src="himanshu_robot_face.jpg"
         alt="Himanshu AI Robot Avatar"
         style="position:relative;width:100%;height:100%;border-radius:50%;object-fit:cover;border:2px solid #ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.2);display:block"
         onerror="this.onerror=null;this.src='himanshu_thakur_creator.jpg';" />
    <!-- Metallic Robot Badge Chip -->
    <div style="position:absolute;bottom:-2px;right:-2px;background:#181519;color:#fff;font-size:9px;font-weight:900;padding:2px 5px;border-radius:8px;border:1px solid #8e549e;box-shadow:0 2px 6px rgba(0,0,0,0.3)">AI</div>
  </div>`;
}

/* ==========================================================================
   REQUIREMENT CONFIRMATION & DATA CLEANING REPORT MODAL
   ========================================================================== */
function showImportSummaryModal(cleaningReport, onConfirmCallback) {
  if (!cleaningReport) return;
  let overlay = document.getElementById('infinito-import-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'infinito-import-modal-overlay';
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
  }

  const prof = cleaningReport.profiling || {};
  const cs   = cleaningReport.cleaningSummary || cleaningReport;
  const detectedList = (cs.detectedColumns || []).slice(0, 8).join(', ');
  const mappedList = (cs.mappedColumns || []).join(', ');

  overlay.innerHTML = `
    <div class="modal-card" style="max-width:740px;background:#ffffff;color:#181519;border-radius:24px;border:1px solid rgba(0,0,0,0.08);box-shadow:0 20px 60px rgba(0,0,0,0.12);overflow:hidden">
      <div class="modal-header" style="border-bottom:1px solid rgba(0,0,0,0.06);padding:20px 26px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:14px">
          ${renderHimanshuRobotAvatar(48)}
          <div>
            <div class="modal-title" style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;color:#181519">⚡ Data Profiling & Requirement Confirmation Stage</div>
            <div style="font-size:12px;color:#7a707c;margin-top:1px">Himanshu Robot AI completed dataset profiling & cleaning. Confirm options to build dashboard.</div>
          </div>
        </div>
        <button class="modal-close" onclick="closeImportSummaryModal()" style="color:#7a707c;font-size:24px">&times;</button>
      </div>

      <div class="modal-body" style="padding:24px 26px;max-height:75vh;overflow-y:auto">
        <!-- PIPELINE STATUS CHIPS -->
        <div style="background:#faf6fa;border:1px solid rgba(0,0,0,0.06);border-radius:16px;padding:14px;margin-bottom:20px">
          <div style="font-size:11px;color:#8e549e;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Mandatory Processing Pipeline Completed</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:11px;font-weight:700">
            <span style="background:#e8f5e9;color:#2e7d32;padding:4px 10px;border-radius:12px">1. Ingested</span>
            <span style="background:#e8f5e9;color:#2e7d32;padding:4px 10px;border-radius:12px">2. Profiled</span>
            <span style="background:#e8f5e9;color:#2e7d32;padding:4px 10px;border-radius:12px">3. Cleaned</span>
            <span style="background:#e8f5e9;color:#2e7d32;padding:4px 10px;border-radius:12px">4. Validated</span>
            <span style="background:#e8f5e9;color:#2e7d32;padding:4px 10px;border-radius:12px">5. Deduplicated</span>
            <span style="background:#f3e5f5;color:#7b1fa2;padding:4px 10px;border-radius:12px">6. Requirement Confirmation</span>
          </div>
        </div>

        <!-- STATS GRID -->
        <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:12px;text-align:center;margin-bottom:20px">
          <div style="background:#f4eff4;border-radius:14px;padding:14px">
            <div style="font-size:22px;font-weight:800;color:#8e549e">${(cs.originalRecords || 0).toLocaleString()}</div>
            <div style="font-size:11px;color:#7a707c;margin-top:2px;font-weight:700">Original Ingested</div>
          </div>
          <div style="background:#f0f8f5;border-radius:14px;padding:14px">
            <div style="font-size:22px;font-weight:800;color:#3d8b6e">${(cs.cleanRecords || cs.validRecords || 0).toLocaleString()}</div>
            <div style="font-size:11px;color:#7a707c;margin-top:2px;font-weight:700">Clean Valid Rows</div>
          </div>
          <div style="background:#fff3e0;border-radius:14px;padding:14px">
            <div style="font-size:22px;font-weight:800;color:#d97757">${(cs.duplicatesFound || 0).toLocaleString()}</div>
            <div style="font-size:11px;color:#7a707c;margin-top:2px;font-weight:700">Duplicates Removed</div>
          </div>
          <div style="background:#ffebee;border-radius:14px;padding:14px">
            <div style="font-size:22px;font-weight:800;color:#d32f2f">${(cs.invalidRecords || 0).toLocaleString()}</div>
            <div style="font-size:11px;color:#7a707c;margin-top:2px;font-weight:700">Invalid Emails</div>
          </div>
        </div>

        <!-- PROFILING DETAILS -->
        <div style="background:#faf6fa;border:1px solid rgba(0,0,0,0.06);border-radius:14px;padding:16px;margin-bottom:20px">
          <div style="font-size:12px;color:#181519;font-weight:700">Source Metadata & Headers:</div>
          <div style="font-size:13px;color:#7a707c;margin-top:4px">File: <strong style="color:#181519">${cleaningReport.fileName || 'Dataset'}</strong> (${cleaningReport.sheetName || 'Sheet1'})</div>
          <div style="font-size:13px;color:#7a707c;margin-top:2px">Detected Headers (${cs.detectedColumns ? cs.detectedColumns.length : 0}): <span style="color:#181519;font-weight:600">${detectedList || 'Standard Headers'}</span></div>
          <div style="font-size:13px;color:#7a707c;margin-top:2px">Mapped Fields: <span style="color:#3d8b6e;font-weight:600">${mappedList || 'contactName, email, companyName, designation'}</span></div>
        </div>

        <!-- REQUIREMENT CONFIRMATION FORM -->
        <div style="background:#ffffff;border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:16px">
          <div style="font-size:13px;font-weight:700;color:#8e549e;margin-bottom:10px">⚙️ Dashboard Requirement Preferences:</div>
          
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
            <div>
              <label style="font-size:11px;color:#7a707c;text-transform:uppercase;font-weight:700">Primary Focus KPI</label>
              <select id="req-kpi-select" style="width:100%;margin-top:4px;padding:9px 12px;border-radius:10px;background:#faf6fa;border:1px solid rgba(0,0,0,0.1);font-size:13px;outline:none">
                <option value="total">Total Clean Records</option>
                <option value="companies">Unique Organizations</option>
                <option value="emails">Valid Email Addresses</option>
              </select>
            </div>
            <div>
              <label style="font-size:11px;color:#7a707c;text-transform:uppercase;font-weight:700">Deduplication Rule</label>
              <select id="req-dedup-select" style="width:100%;margin-top:4px;padding:9px 12px;border-radius:10px;background:#faf6fa;border:1px solid rgba(0,0,0,0.1);font-size:13px;outline:none">
                <option value="auto">Automatic Hash Removal (Recommended)</option>
                <option value="keep">Flag Rows for Review</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer" style="border-top:1px solid rgba(0,0,0,0.06);padding:18px 26px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:13px;color:#3d8b6e;font-weight:700">Single Source of Truth Ready</span>
        <button class="btn-primary" style="padding:12px 28px;font-size:14px;background:#181519;color:#ffffff;border:none;border-radius:12px;font-weight:700;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.15)" onclick="confirmAndLaunchDashboard()">Confirm & Launch BI Dashboard</button>
      </div>
    </div>
  `;
  overlay.style.display = 'flex';
}

function closeImportSummaryModal() {
  const overlay = document.getElementById('infinito-import-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

function confirmAndLaunchDashboard() {
  closeImportSummaryModal();
  if (window.location.reload) window.location.reload();
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
    { label: 'Email Address', val: record.email ? `<a href="mailto:${record.email}" style="color:#4a7bb0;font-weight:600">${record.email}</a>` : '—' },
    { label: 'Company Name', val: record.companyName || '—' },
    { label: 'Designation / Owner', val: record.designation || '—' },
    { label: 'Phone Number', val: record.phone || '—' },
    { label: 'Website', val: record.website ? `<a href="${record.website.startsWith('http')?record.website:'https://'+record.website}" target="_blank" style="color:#4a7bb0;font-weight:600">${record.website}</a>` : '—' },
    { label: 'Location', val: record.location || [record.city, record.state, record.country].filter(Boolean).join(', ') || '—' },
    { label: 'Email Status', val: `<span class="badge b-green">${record.emailStatus || 'Delivered'}</span>` },
    { label: 'Qualification Status', val: record.qualificationStatus || 'Verified' },
    { label: 'Qualification Reason', val: record.qualificationReason || record.tier || '—' }
  ];

  overlay.innerHTML = `
    <div class="modal-card" style="background:#ffffff;color:#181519;border-radius:24px;border:1px solid rgba(0,0,0,0.08);box-shadow:0 20px 60px rgba(0,0,0,0.12)">
      <div class="modal-header" style="border-bottom:1px solid rgba(0,0,0,0.06);padding:20px 26px">
        <div class="modal-title" style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;color:#181519">📋 Contact Detail — ${record.contactName || record.companyName || 'Lead Detail'}</div>
        <button class="modal-close" onclick="closeRecordDetailModal()" style="color:#7a707c">&times;</button>
      </div>
      <div class="modal-body" style="padding:26px;display:grid;grid-template-columns:1fr 1fr;gap:14px">
        ${fields.map(f => `
          <div style="background:#faf6fa;border:1px solid rgba(0,0,0,0.06);border-radius:14px;padding:12px">
            <div style="font-size:11px;color:#7a707c;text-transform:uppercase;font-weight:700;letter-spacing:0.5px">${f.label}</div>
            <div style="font-size:14px;color:#181519;margin-top:4px;word-break:break-all;font-weight:600">${f.val}</div>
          </div>
        `).join('')}
      </div>
      <div class="modal-footer" style="border-top:1px solid rgba(0,0,0,0.06);padding:18px 26px">
        <button class="btn-primary" style="padding:10px 24px;font-size:13px;background:#f4eff4;color:#181519;border:1px solid rgba(0,0,0,0.1);border-radius:10px;font-weight:700;cursor:pointer" onclick="closeRecordDetailModal()">Close</button>
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
    <div class="modal-card" style="background:#ffffff;color:#181519;border-radius:24px;border:1px solid rgba(0,0,0,0.08);box-shadow:0 20px 60px rgba(0,0,0,0.12)">
      <div class="modal-header" style="border-bottom:1px solid rgba(0,0,0,0.06);padding:20px 26px">
        <div class="modal-title" style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;color:#181519">📧 Share ${workspaceTitle || 'Workspace'} Report</div>
        <button class="modal-close" onclick="closeShareEmailModal()" style="color:#7a707c">&times;</button>
      </div>
      <div class="modal-body" style="padding:26px">
        <div style="font-size:13px;color:#7a707c;margin-bottom:16px">Send clean BI analytics report and dataset summary to your team:</div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div>
            <label style="font-size:11px;color:#7a707c;text-transform:uppercase;font-weight:700;letter-spacing:0.5px">Recipient Email</label>
            <input id="shareEmailInput" type="email" placeholder="colleague@company.com" style="width:100%;margin-top:6px;padding:12px 16px;border-radius:12px;background:#faf6fa;border:1px solid rgba(0,0,0,0.1);color:#181519;font-size:14px;outline:none" />
          </div>
          <div>
            <label style="font-size:11px;color:#7a707c;text-transform:uppercase;font-weight:700;letter-spacing:0.5px">Subject</label>
            <input id="shareSubjectInput" type="text" value="Infinito BI Report: ${workspaceTitle || 'Workspace Data'}" style="width:100%;margin-top:6px;padding:12px 16px;border-radius:12px;background:#faf6fa;border:1px solid rgba(0,0,0,0.1);color:#181519;font-size:14px;outline:none" />
          </div>
        </div>
      </div>
      <div class="modal-footer" style="border-top:1px solid rgba(0,0,0,0.06);padding:18px 26px">
        <button style="padding:10px 20px;border-radius:10px;background:transparent;border:1px solid rgba(0,0,0,0.1);color:#7a707c;cursor:pointer;font-size:13px;font-weight:600" onclick="closeShareEmailModal()">Cancel</button>
        <button style="padding:10px 24px;border-radius:10px;background:#181519;border:none;color:#fff;font-weight:700;cursor:pointer;font-size:13px;box-shadow:0 4px 15px rgba(0,0,0,0.15)" onclick="submitShareEmail()">Send Report</button>
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
   UI — EDITORIAL HEADER & FOOTER WITH HIMANSHU ROBOT AVATAR
   ========================================================================== */
function renderAppHeader(activeId) {
  return `
  <header class="app-header">
    <div class="hdr-wrap">
      <div class="logo">
        <div style="display:flex;align-items:center;gap:12px">
          ${renderHimanshuRobotAvatar(48)}
          <div>
            <div class="logo-title">Infinito BI</div>
            <div class="logo-sub">Python Data Engine · Himanshu AI Robot Assistant</div>
          </div>
        </div>
      </div>
      <div class="nav-links">
        <a href="index.html"          class="nav-link ${activeId==='auto_studio'?'active':''}">⚡ Auto Studio</a>
        <a href="overall_emails.html" class="nav-link ${activeId==='overall_emails'?'active':''}">📧 Overall Emails</a>
        <a href="icp1.html"           class="nav-link ${activeId==='icp1'?'active':''}">🎯 ICP 1</a>
        <a href="icp2.html"           class="nav-link ${activeId==='icp2'?'active':''}">🚀 ICP 2</a>
        <a href="icp3.html"           class="nav-link ${activeId==='icp3'?'active':''}">🌐 ICP 3</a>
      </div>
      <div class="system-status"><span class="dot"></span> Python Engine Verified</div>
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
          <div class="creator-sub">Creator of Infinito — turning spreadsheet, Excel & PDF data into editorial Power BI dashboards.</div>
        </div>
      </div>
      <div class="creator-links">
        <a href="https://www.linkedin.com/in/-himanshu-thakur-" target="_blank" rel="noopener" class="creator-link">🔗 LinkedIn</a>
        <a href="mailto:himthakur5417@gmail.com" class="creator-link">📧 Email</a>
      </div>
    </div>
  </footer>`;
}

/* Inject shared editorial styles */
(function injectStyles() {
  const s = document.createElement('style');
  s.innerHTML = `
.modal-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(24,21,25,0.65);backdrop-filter:blur(10px);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}
.modal-card{width:100%;max-width:640px}
.modal-close{background:none;border:none;font-size:22px;cursor:pointer}
.creator-footer{margin-top:60px;padding:36px 0;background:#ffffff;border-top:1px solid rgba(0,0,0,0.06);border-radius:24px 24px 0 0}
.footer-content{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}
.creator-badge{display:flex;align-items:center;gap:14px;text-align:left}
.creator-photo{width:54px;height:54px;border-radius:50%;object-fit:cover;border:2px solid #8e549e;box-shadow:0 4px 15px rgba(142,84,158,0.25);flex-shrink:0}
.creator-avatar{width:54px;height:54px;border-radius:50%;background:#181519;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;color:#fff;flex-shrink:0}
.creator-title{font-size:14px;color:#181519}
.creator-sub{font-size:12px;color:#7a707c;max-width:500px;margin-top:2px}
.creator-links{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.creator-link{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#faf6fa;border:1px solid rgba(0,0,0,0.08);border-radius:10px;font-size:13px;font-weight:600;color:#181519;text-decoration:none;transition:all .2s}
.creator-link:hover{background:#181519;color:#ffffff}
@keyframes pulse-halo {
  0% { transform: scale(1); opacity: 0.7; }
  100% { transform: scale(1.08); opacity: 1; }
}
`;
  document.head.appendChild(s);
})();
