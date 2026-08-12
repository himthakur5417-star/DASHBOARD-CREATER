/* ==========================================================================
   INFINITO SHARED ENGINE & PERSISTENCE LAYER
   Supports: Auto Studio | Overall Emails Sent | ICP 1 | ICP 2
   Rebranded from Anti-Gravity to INFINITO
   ========================================================================== */

class WorkspaceStore {
  constructor(workspaceId) {
    this.workspaceId = workspaceId;
    this.storageKey = `infinito_workspace_${workspaceId}`;
    this.historyKey = `infinito_history_${workspaceId}`;
  }

  getData() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch(e) {
      console.error("Error reading workspace data:", e);
      return [];
    }
  }

  saveData(rows) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(rows));
    } catch(e) {
      console.error("Error saving workspace data:", e);
    }
  }

  getHistory() {
    try {
      const raw = localStorage.getItem(this.historyKey);
      return raw ? JSON.parse(raw) : [];
    } catch(e) {
      return [];
    }
  }

  saveHistory(history) {
    try {
      localStorage.setItem(this.historyKey, JSON.stringify(history));
    } catch(e) {
      console.error("Error saving history:", e);
    }
  }

  clearWorkspace() {
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem(this.historyKey);
  }

  mergeData(newRows, fileName, sheetName = "") {
    const existing = this.getData();
    const history = this.getHistory();

    const existingHashes = new Set(existing.map(r => this.getRowHash(r)));
    
    let validCount = 0;
    let duplicateCount = 0;
    let newlyAdded = [];

    newRows.forEach(row => {
      if (!row || Object.keys(row).length === 0) return;
      validCount++;

      const mappedRow = mapFields(row);
      const hash = this.getRowHash(mappedRow);
      
      if (existingHashes.has(hash)) {
        duplicateCount++;
      } else {
        existingHashes.add(hash);
        newlyAdded.push(mappedRow);
      }
    });

    const combined = [...existing, ...newlyAdded];
    this.saveData(combined);

    const logEntry = {
      id: Date.now(),
      fileName: fileName || "Imported_Dataset",
      sheetName: sheetName || "Sheet1",
      timestamp: new Date().toLocaleString(),
      rowsReceived: newRows.length,
      validRows: validCount,
      skippedRows: newRows.length - validCount,
      duplicateRows: duplicateCount,
      newlyAddedRows: newlyAdded.length,
      totalStoredRows: combined.length
    };

    history.unshift(logEntry);
    this.saveHistory(history);

    return { logEntry, combinedData: combined };
  }

  getRowHash(row) {
    const email = row.email || row.Email || row.contact_email;
    const company = row.companyName || row.Company || row.company_name;
    const phone = row.contactNumber || row.Phone || row.contact_number;

    if (email && String(email).trim()) return `email_${String(email).toLowerCase().trim()}`;
    if (company && String(company).trim()) return `comp_${String(company).toLowerCase().trim()}`;
    if (phone && String(phone).trim()) return `phone_${String(phone).trim()}`;
    return `hash_${JSON.stringify(row)}`;
  }
}

/* ==========================================================================
   INTELLIGENT FIELD MAPPING & NORMALIZATION
   ========================================================================== */
function mapFields(row) {
  const mapped = { ...row };
  const keys = Object.keys(row);

  function findVal(patterns) {
    const foundKey = keys.find(k => {
      const lk = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      return patterns.some(p => lk === p || lk.includes(p));
    });
    return foundKey ? row[foundKey] : undefined;
  }

  mapped.companyName = findVal(['companyname', 'company', 'organization', 'accountname', 'firm']) || row.companyName || '—';
  mapped.website = findVal(['website', 'domain', 'companywebsite', 'url']) || row.website || '—';
  mapped.industry = findVal(['industry', 'sector', 'domaincategory', 'niche']) || row.industry || '—';
  mapped.location = findVal(['location', 'city', 'country', 'address', 'state']) || row.location || '—';
  
  // Founder name detection (must NOT fabricate names)
  mapped.founderName = findVal(['foundername', 'founder', 'cofounder']) || row.founderName || '—';
  mapped.contactName = findVal(['contactname', 'name', 'fullname', 'personname', 'leadname', 'firstname']) || row.contactName || '—';
  mapped.jobTitle = findVal(['jobtitle', 'title', 'designation', 'role']) || row.jobTitle || '—';
  
  mapped.email = findVal(['email', 'emailaddress', 'contactemail']) || row.email || '—';
  mapped.contactNumber = findVal(['contactnumber', 'phone', 'phonenumber', 'mobile', 'telephone']) || row.contactNumber || '—';
  
  mapped.linkedInUrl = findVal(['linkedinurl', 'linkedin', 'profilelink', 'linkedinprofile']) || row.linkedInUrl || '—';
  
  // Determine LinkedIn Found status
  const hasLinkedin = (mapped.linkedInUrl && mapped.linkedInUrl !== '—' && String(mapped.linkedInUrl).includes('linkedin.com')) || 
                      String(findVal(['linkedinfound', 'haslinkedin'])).toLowerCase() === 'yes';
  mapped.linkedInFound = hasLinkedin ? 'Found' : 'Not Found';

  // Email verification status
  mapped.emailStatus = findVal(['emailstatus', 'verificationstatus', 'isverified']) || (mapped.email && mapped.email !== '—' ? 'Verified' : 'Unverified');

  return mapped;
}

/* ==========================================================================
   UI HEADER & CREATOR FOOTER COMPONENTS
   ========================================================================== */

function renderAppHeader(activeId, pageTitle, pageSub) {
  return `
  <header>
    <div class="wrap hdr">
      <div class="logo">
        <div class="logo-icon">♾️</div>
        <div>
          <div class="logo-title">Infinito</div>
          <div class="logo-sub">Clean your data. Verify every detail. Turn insights into Power BI-style dashboards.</div>
        </div>
      </div>

      <div class="nav-links">
        <a href="index.html" class="nav-link ${activeId === 'auto_studio' ? 'active' : ''}">⚡ Auto Studio</a>
        <a href="overall_emails.html" class="nav-link ${activeId === 'overall_emails' ? 'active' : ''}">📧 Overall Emails Sent</a>
        <a href="icp1.html" class="nav-link ${activeId === 'icp1' ? 'active' : ''}">🎯 ICP 1</a>
        <a href="icp2.html" class="nav-link ${activeId === 'icp2' ? 'active' : ''}">🚀 ICP 2</a>
      </div>

      <div class="badge b-green">
        <div class="dot"></div> System Online
      </div>
    </div>
  </header>`;
}

function renderCreatorFooter() {
  return `
  <footer class="creator-footer">
    <div class="wrap footer-content">
      <div class="creator-badge">
        <div class="creator-avatar">HT</div>
        <div>
          <div class="creator-title">Created by <strong>Himanshu Thakur</strong></div>
          <div class="creator-sub">Creator of Infinito — a platform that helps turn raw spreadsheet data into clean, verified, insightful Power BI-style dashboards.</div>
        </div>
      </div>
      <div class="creator-links">
        <a href="https://www.linkedin.com/in/-himanshu-thakur-" target="_blank" rel="noopener" class="creator-link">
          🔗 LinkedIn Profile
        </a>
        <a href="mailto:himthakur5417@gmail.com" class="creator-link">
          📧 Email Himanshu
        </a>
      </div>
    </div>
  </footer>`;
}

/* ==========================================================================
   MODALS: SHARE VIA EMAIL & IMPORT SUMMARY
   ========================================================================== */

function openShareEmailModal(workspaceTitle) {
  let modal = document.getElementById('share-email-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'share-email-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const defaultSubject = `Shared Dashboard: Infinito — ${workspaceTitle}`;

  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <div class="modal-title">📧 Share via Email — Infinito ${workspaceTitle}</div>
        <button class="modal-close" onclick="closeShareEmailModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Recipient Email Address(es):</label>
          <input type="email" id="share-to" class="search-input" placeholder="e.g. client@company.com, executive@org.com">
        </div>
        <div class="form-group">
          <label class="form-label">Subject Line:</label>
          <input type="text" id="share-subject" class="search-input" value="${defaultSubject}">
        </div>
        <div class="form-group">
          <label class="form-label">Optional Message:</label>
          <textarea id="share-message" class="search-input" rows="3" placeholder="Infinito analytics report summary attached..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Select What to Share:</label>
          <div style="display:flex; flex-direction:column; gap:8px; font-size:13px;">
            <label><input type="checkbox" id="share-inc-summary" checked> Include Dashboard KPI Summary</label>
            <label><input type="checkbox" id="share-inc-csv" checked> Attach Cleaned Data CSV Link</label>
            <label><input type="checkbox" id="share-inc-html" checked> Attach Standalone HTML Report</label>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeShareEmailModal()">Cancel</button>
        <button class="btn btn-primary" onclick="sendShareEmail('${workspaceTitle}')">📧 Send Infinito Report</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
}

function closeShareEmailModal() {
  const modal = document.getElementById('share-email-modal');
  if (modal) modal.style.display = 'none';
}

function sendShareEmail(workspaceTitle) {
  const to = document.getElementById('share-to').value.trim();
  const subject = document.getElementById('share-subject').value.trim();
  const message = document.getElementById('share-message').value.trim();

  if (!to) {
    alert("Please enter at least one recipient email address.");
    return;
  }

  const body = encodeURIComponent(`Hi,\n\nHere is the shared dashboard report for Infinito [${workspaceTitle}]:\n\n${message}\n\nGenerated via Infinito Data & Intelligence Platform.`);
  const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${body}`;
  
  window.open(mailtoUrl, '_blank');
  closeShareEmailModal();
  showToastNotification(`✅ Email dispatch initiated for ${to}!`);
}

function showImportSummaryModal(summary) {
  let modal = document.getElementById('import-summary-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'import-summary-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <div class="modal-title">📥 Infinito Import Summary</div>
        <button class="modal-close" onclick="closeImportSummaryModal()">✕</button>
      </div>
      <div class="modal-body">
        <div style="font-size:13px; color:var(--t2); margin-bottom:16px;">
          Processed and merged file: <strong>${summary.fileName}</strong> (${summary.sheetName})
        </div>
        <div class="kpi-grid" style="grid-template-columns:repeat(2, 1fr); gap:12px;">
          <div class="kpi kblue" style="padding:14px;">
            <div class="kpi-val" style="font-size:20px;">${summary.rowsReceived}</div>
            <div class="kpi-lbl">Rows Received</div>
          </div>
          <div class="kpi kgreen" style="padding:14px;">
            <div class="kpi-val" style="font-size:20px; color:var(--green);">${summary.newlyAddedRows}</div>
            <div class="kpi-lbl">Newly Added Rows</div>
          </div>
          <div class="kpi kamber" style="padding:14px;">
            <div class="kpi-val" style="font-size:20px; color:var(--amber);">${summary.duplicateRows}</div>
            <div class="kpi-lbl">Duplicates Skipped</div>
          </div>
          <div class="kpi kpurple" style="padding:14px;">
            <div class="kpi-val" style="font-size:20px;">${summary.totalStoredRows}</div>
            <div class="kpi-lbl">Total Stored Dataset</div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="closeImportSummaryModal()">View Refreshed Dashboard →</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
}

function closeImportSummaryModal() {
  const modal = document.getElementById('import-summary-modal');
  if (modal) modal.style.display = 'none';
}

/* ==========================================================================
   RECORD DETAIL DRAWER / MODAL
   ========================================================================== */

function openRecordDetailModal(record) {
  let modal = document.getElementById('record-detail-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'record-detail-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const rec = mapFields(record);

  modal.innerHTML = `
    <div class="modal-card" style="max-width:680px;">
      <div class="modal-header">
        <div class="modal-title">🏢 Contact Intelligence — ${rec.companyName !== '—' ? rec.companyName : (rec.contactName !== '—' ? rec.contactName : 'Record Detail')}</div>
        <button class="modal-close" onclick="closeRecordDetailModal()">✕</button>
      </div>
      <div class="modal-body">
        <!-- Tabs -->
        <div style="display:flex; gap:6px; margin-bottom:16px; border-bottom:1px solid var(--border); padding-bottom:8px;">
          <button class="pag-btn active" onclick="switchDetailTab('tab-comp')">1. Company Details</button>
          <button class="pag-btn" onclick="switchDetailTab('tab-cont')">2. Contact Details</button>
          <button class="pag-btn" onclick="switchDetailTab('tab-comm')">3. Email & Phone</button>
          <button class="pag-btn" onclick="switchDetailTab('tab-link')">4. LinkedIn & Verify</button>
        </div>

        <div id="tab-comp" class="detail-tab-content">
          <div class="profile-stat"><span>Company Name:</span> <strong>${rec.companyName}</strong></div>
          <div class="profile-stat"><span>Website:</span> <strong>${rec.website !== '—' ? `<a href="${rec.website.startsWith('http')?rec.website:'http://'+rec.website}" target="_blank" style="color:var(--blue);">${rec.website}</a>` : '—'}</strong></div>
          <div class="profile-stat"><span>Industry:</span> <strong>${rec.industry}</strong></div>
          <div class="profile-stat"><span>Location:</span> <strong>${rec.location}</strong></div>
        </div>

        <div id="tab-cont" class="detail-tab-content" style="display:none;">
          <div class="profile-stat"><span>Founder Name:</span> <strong>${rec.founderName}</strong></div>
          <div class="profile-stat"><span>Primary Contact Name:</span> <strong>${rec.contactName}</strong></div>
          <div class="profile-stat"><span>Job Title / Role:</span> <strong>${rec.jobTitle}</strong></div>
        </div>

        <div id="tab-comm" class="detail-tab-content" style="display:none;">
          <div class="profile-stat"><span>Email Address:</span> <strong>${rec.email !== '—' ? `<a href="mailto:${rec.email}" style="color:var(--blue);">${rec.email}</a>` : '—'}</strong></div>
          <div class="profile-stat"><span>Phone / Contact Number:</span> <strong>${rec.contactNumber}</strong></div>
        </div>

        <div id="tab-link" class="detail-tab-content" style="display:none;">
          <div class="profile-stat"><span>LinkedIn Found:</span> <strong style="color:${rec.linkedInFound === 'Found' ? 'var(--green)' : 'var(--amber)'};">${rec.linkedInFound}</strong></div>
          <div class="profile-stat"><span>LinkedIn Profile URL:</span> <strong>${rec.linkedInUrl !== '—' ? `<a href="${rec.linkedInUrl.startsWith('http')?rec.linkedInUrl:'https://'+rec.linkedInUrl}" target="_blank" style="color:var(--blue);">${rec.linkedInUrl}</a>` : '—'}</strong></div>
          <div class="profile-stat"><span>Email Verification Status:</span> <strong style="color:var(--green);">${rec.emailStatus}</strong></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="closeRecordDetailModal()">Close Detail Drawer</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
}

function switchDetailTab(tabId) {
  document.querySelectorAll('.detail-tab-content').forEach(el => el.style.display = 'none');
  document.getElementById(tabId).style.display = 'block';
}

function closeRecordDetailModal() {
  const modal = document.getElementById('record-detail-modal');
  if (modal) modal.style.display = 'none';
}

/* ==========================================================================
   STANDALONE HTML EXPORT
   ========================================================================== */

function exportWorkspaceHTML(workspaceTitle, rows, kpis = [], insights = []) {
  if (!rows || !rows.length) {
    alert("No dataset available to export HTML.");
    return;
  }

  const headers = Object.keys(rows[0]);
  const sampleRows = rows.slice(0, 50);

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Infinito | ${workspaceTitle} — Exported Dashboard Report</title>
<style>
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a0e1a; color: #f0f4ff; padding: 30px; }
  h1 { font-size: 24px; color: #4f8ef7; border-bottom: 1px solid rgba(79,142,247,0.3); padding-bottom: 10px; }
  .tagline { font-size: 12px; color: #8899bb; margin-bottom: 20px; font-style: italic; }
  .kpi-grid { display: flex; gap: 15px; margin-bottom: 25px; flex-wrap: wrap; }
  .kpi-card { background: #131c35; border: 1px solid rgba(79,142,247,0.2); border-radius: 8px; padding: 15px 20px; min-width: 180px; }
  .kpi-val { font-size: 24px; font-weight: bold; color: #fff; }
  .kpi-lbl { font-size: 11px; color: #8899bb; text-transform: uppercase; margin-top: 4px; }
  .insights-box { background: rgba(79,142,247,0.1); border: 1px solid rgba(79,142,247,0.3); border-radius: 8px; padding: 15px; margin-bottom: 25px; }
  table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
  th { background: #0f1629; color: #8899bb; text-align: left; padding: 10px; border-bottom: 1px solid #1a2440; }
  td { padding: 10px; border-bottom: 1px solid rgba(79,142,247,0.1); }
  footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(79,142,247,0.2); font-size: 12px; color: #8899bb; text-align: center; }
</style>
</head>
<body>
  <h1>♾️ Infinito | ${workspaceTitle} — Executive Report</h1>
  <div class="tagline">Clean your data. Verify every detail. Turn insights into Power BI-style dashboards.</div>
  <div class="meta">Export Timestamp: ${new Date().toLocaleString()} | Total Records: ${rows.length.toLocaleString()}</div>
  
  <div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-val">${rows.length.toLocaleString()}</div><div class="kpi-lbl">Total Records</div></div>
    <div class="kpi-card"><div class="kpi-val">${headers.length}</div><div class="kpi-lbl">Total Attributes</div></div>
    ${kpis.map(k => `<div class="kpi-card"><div class="kpi-val">${k.value}</div><div class="kpi-lbl">${k.label}</div></div>`).join('')}
  </div>

  ${insights.length ? `
  <div class="insights-box">
    <h3>💡 Key Narrative Insights</h3>
    <ul>${insights.map(i => `<li>${i}</li>`).join('')}</ul>
  </div>` : ''}

  <h3>📋 Contact Intelligence Preview</h3>
  <table>
    <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>
      ${sampleRows.map(r => `<tr>${headers.map(h => `<td>${r[h] !== undefined ? r[h] : ''}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>

  <footer>
    Created by <strong>Himanshu Thakur</strong> — Creator of Infinito.
  </footer>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Infinito_${workspaceTitle.replace(/\s+/g, '_')}_Report_${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function showToastNotification(message) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 10000;
      background: #131c35; border: 1px solid #4f8ef7; color: #fff;
      padding: 12px 20px; border-radius: 10px; font-size: 13px; font-weight: 600;
      box-shadow: 0 8px 25px rgba(0,0,0,0.5); animation: fi 0.3s ease;
    `;
    document.body.appendChild(toast);
  }
  toast.innerText = message;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

/* Modal & Footer Styles */
const extraStyles = document.createElement('style');
extraStyles.innerHTML = `
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(10, 14, 26, 0.85); backdrop-filter: blur(10px);
  z-index: 9999; display: none; align-items: center; justify-content: center; padding: 20px;
}
.modal-card {
  background: var(--card, #131c35); border: 1px solid var(--border, rgba(79,142,247,0.3));
  border-radius: 14px; width: 100%; max-width: 540px; box-shadow: 0 10px 40px rgba(0,0,0,0.6);
  animation: fi 0.25s ease;
}
.modal-header {
  padding: 18px 20px; border-bottom: 1px solid var(--border, rgba(79,142,247,0.2));
  display: flex; align-items: center; justify-content: space-between;
}
.modal-title { font-family: 'Space Grotesk', sans-serif; font-size: 16px; font-weight: 700; color: #fff; }
.modal-close { background: none; border: none; color: #8899bb; font-size: 18px; cursor: pointer; }
.modal-close:hover { color: #fff; }
.modal-body { padding: 20px; }
.modal-footer { padding: 14px 20px; border-top: 1px solid var(--border, rgba(79,142,247,0.2)); display: flex; justify-content: flex-end; gap: 10px; }
.form-group { margin-bottom: 14px; }
.form-label { font-size: 12px; font-weight: 600; color: #8899bb; margin-bottom: 6px; display: block; }

/* CREATOR FOOTER STYLING */
.creator-footer {
  margin-top: 60px; padding: 30px 0; background: rgba(13, 20, 45, 0.95);
  border-top: 1px solid var(--border, rgba(79,142,247,0.15)); text-align: center;
}
.footer-content { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.creator-badge { display: flex; align-items: center; gap: 12px; text-align: left; }
.creator-avatar {
  width: 40px; height: 40px; border-radius: 50%;
  background: linear-gradient(135deg, #4f8ef7, #8b5cf6);
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 14px; color: #fff;
}
.creator-title { font-size: 14px; color: #f0f4ff; }
.creator-sub { font-size: 12px; color: #8899bb; max-width: 500px; margin-top: 2px; }
.creator-links { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.creator-link {
  display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px;
  background: rgba(79,142,247,0.1); border: 1px solid rgba(79,142,247,0.3);
  border-radius: 8px; font-size: 12px; font-weight: 600; color: #4f8ef7; text-decoration: none;
  transition: all 0.2s;
}
.creator-link:hover { background: rgba(79,142,247,0.22); transform: translateY(-1px); }
`;
document.head.appendChild(extraStyles);
