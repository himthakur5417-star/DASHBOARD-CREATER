/* ==========================================================================
   ANTI-GRAVITY SHARED WORKSPACE ENGINE & PERSISTENCE LAYER
   Supports: Auto Studio | Overall Emails Sent | ICP 1 | ICP 2
   ========================================================================== */

class WorkspaceStore {
  constructor(workspaceId) {
    this.workspaceId = workspaceId;
    this.storageKey = `ag_workspace_${workspaceId}`;
    this.historyKey = `ag_history_${workspaceId}`;
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

  // Merge new valid rows into existing dataset with deduplication
  mergeData(newRows, fileName, sheetName = "") {
    const existing = this.getData();
    const history = this.getHistory();

    const existingHashes = new Set(existing.map(r => this.getRowHash(r)));
    
    let validCount = 0;
    let duplicateCount = 0;
    let newlyAdded = [];

    newRows.forEach(row => {
      // Basic validity check
      if (!row || Object.keys(row).length === 0) return;
      validCount++;

      const hash = this.getRowHash(row);
      if (existingHashes.has(hash)) {
        duplicateCount++;
      } else {
        existingHashes.add(hash);
        newlyAdded.push(row);
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

    return {
      logEntry,
      combinedData: combined
    };
  }

  getRowHash(row) {
    // Check if there is an explicit Email, ID, or Phone identifier
    const keys = Object.keys(row);
    const emailKey = keys.find(k => k.toLowerCase().includes('email'));
    const idKey = keys.find(k => k.toLowerCase() === 'id' || k.toLowerCase().includes('identifier'));
    
    if (emailKey && row[emailKey]) return `email_${String(row[emailKey]).toLowerCase().trim()}`;
    if (idKey && row[idKey]) return `id_${String(row[idKey]).trim()}`;
    
    // Otherwise fallback to full JSON string representation
    return `hash_${JSON.stringify(row)}`;
  }
}

/* ==========================================================================
   SHARED UI COMPONENTS (Navigation, Modals, Export)
   ========================================================================== */

function renderAppHeader(activeId, pageTitle, pageSub) {
  return `
  <header>
    <div class="wrap hdr">
      <div class="logo">
        <div class="logo-icon">⚡</div>
        <div>
          <div class="logo-title">${pageTitle}</div>
          <div class="logo-sub">${pageSub}</div>
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

/* Modal: Share Via Email */
function openShareEmailModal(workspaceTitle, summaryStats = {}) {
  let modal = document.getElementById('share-email-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'share-email-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const defaultSubject = `Shared Dashboard: ${workspaceTitle}`;

  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <div class="modal-title">📧 Share via Email — ${workspaceTitle}</div>
        <button class="modal-close" onclick="closeShareEmailModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Recipient Email Address(es):</label>
          <input type="email" id="share-to" class="search-input" placeholder="e.g. manager@company.com, team@org.com">
        </div>
        <div class="form-group">
          <label class="form-label">Subject Line:</label>
          <input type="text" id="share-subject" class="search-input" value="${defaultSubject}">
        </div>
        <div class="form-group">
          <label class="form-label">Optional Message:</label>
          <textarea id="share-message" class="search-input" rows="3" placeholder="Add a personal note or key highlights..."></textarea>
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
        <button class="btn btn-primary" onclick="sendShareEmail('${workspaceTitle}')">📧 Send Email Report</button>
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

  // Simulated Email Dispatch Toast Feedback
  const body = encodeURIComponent(`Hi,\n\nHere is the shared report for ${workspaceTitle}:\n\n${message}\n\nGenerated via Anti-Gravity Multi-Workspace Dashboard System.`);
  const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${body}`;
  
  // Trigger mailto client as fallback & show success toast
  window.open(mailtoUrl, '_blank');

  closeShareEmailModal();
  showToastNotification(`✅ Email dispatch initiated for ${to}!`);
}

/* Modal: Import Summary Toast */
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
        <div class="modal-title">📥 Data Import Summary</div>
        <button class="modal-close" onclick="closeImportSummaryModal()">✕</button>
      </div>
      <div class="modal-body">
        <div style="font-size:13px; color:var(--t2); margin-bottom:16px;">
          Successfully processed and merged file: <strong>${summary.fileName}</strong> (${summary.sheetName})
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
            <div class="kpi-lbl">Duplicate Rows Skipped</div>
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

/* Standalone HTML Export */
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
<title>${workspaceTitle} — Exported Dashboard Report</title>
<style>
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a0e1a; color: #f0f4ff; padding: 30px; }
  h1 { font-size: 24px; color: #4f8ef7; border-bottom: 1px solid rgba(79,142,247,0.3); padding-bottom: 10px; }
  .meta { font-size: 12px; color: #8899bb; margin-bottom: 20px; }
  .kpi-grid { display: flex; gap: 15px; margin-bottom: 25px; flex-wrap: wrap; }
  .kpi-card { background: #131c35; border: 1px solid rgba(79,142,247,0.2); border-radius: 8px; padding: 15px 20px; min-width: 180px; }
  .kpi-val { font-size: 24px; font-weight: bold; color: #fff; }
  .kpi-lbl { font-size: 11px; color: #8899bb; text-transform: uppercase; margin-top: 4px; }
  .insights-box { background: rgba(79,142,247,0.1); border: 1px solid rgba(79,142,247,0.3); border-radius: 8px; padding: 15px; margin-bottom: 25px; }
  table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
  th { background: #0f1629; color: #8899bb; text-align: left; padding: 10px; border-bottom: 1px solid #1a2440; }
  td { padding: 10px; border-bottom: 1px solid rgba(79,142,247,0.1); }
</style>
</head>
<body>
  <h1>📊 ${workspaceTitle} — Exported Report</h1>
  <div class="meta">Export Timestamp: ${new Date().toLocaleString()} | Total Stored Records: ${rows.length.toLocaleString()}</div>
  
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

  <h3>📋 Data Preview (First 50 Records)</h3>
  <table>
    <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>
      ${sampleRows.map(r => `<tr>${headers.map(h => `<td>${r[h] !== undefined ? r[h] : ''}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${workspaceTitle.replace(/\s+/g, '_')}_Report_${Date.now()}.html`;
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

/* Modal CSS Styles Injection */
const modalStyles = document.createElement('style');
modalStyles.innerHTML = `
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(10, 14, 26, 0.85); backdrop-filter: blur(10px);
  z-index: 9999; display: none; align-items: center; justify-content: center; padding: 20px;
}
.modal-card {
  background: var(--card, #131c35); border: 1px solid var(--border, rgba(79,142,247,0.3));
  border-radius: 14px; width: 100%; max-width: 520px; box-shadow: 0 10px 40px rgba(0,0,0,0.6);
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
`;
document.head.appendChild(modalStyles);
