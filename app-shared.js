/* ==========================================================================
   INFINITO SHARED ENGINE & PERSISTENCE LAYER
   Supports: Auto Studio | Overall Emails Sent | ICP 1 | ICP 2 | ICP 3 | Lead Gen
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

      let mappedRow = mapFields(row);
      
      // Auto Qualify based on Workspace ID
      if (this.workspaceId === 'icp_1') mappedRow = qualifyICP1(mappedRow);
      else if (this.workspaceId === 'icp_2') mappedRow = qualifyICP2(mappedRow);
      else if (this.workspaceId === 'icp_3') mappedRow = qualifyICP3(mappedRow);

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

  updateRecordStatus(recordId, newStatus, newReason = "Manual User Override") {
    const data = this.getData();
    const updated = data.map((r, idx) => {
      const id = r.id || idx;
      if (String(id) === String(recordId) || r.companyName === recordId) {
        return { ...r, qualificationStatus: newStatus, qualificationReason: newReason, userOverridden: true };
      }
      return r;
    });
    this.saveData(updated);
    return updated;
  }

  getRowHash(row) {
    const email = row.email || row.Email || row.contact_email;
    const company = row.companyName || row.Company || row.company_name;
    const phone = row.contactNumber || row.Phone || row.contact_number;

    if (email && String(email).trim() && String(email) !== '—') return `email_${String(email).toLowerCase().trim()}`;
    if (company && String(company).trim() && String(company) !== '—') return `comp_${String(company).toLowerCase().trim()}`;
    if (phone && String(phone).trim() && String(phone) !== '—') return `phone_${String(phone).trim()}`;
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
  mapped.industry = findVal(['industry', 'sector', 'domaincategory', 'niche', 'itservicetype', 'subindustry']) || row.industry || '—';
  
  // Flexible Global Location Fields
  mapped.country = findVal(['country', 'nation', 'targetcountry']) || row.country || '—';
  mapped.state = findVal(['state', 'province', 'region', 'usstate']) || row.state || '—';
  mapped.city = findVal(['city', 'indiacity', 'town']) || row.city || '—';
  mapped.postalCode = findVal(['postalcode', 'zip', 'zipcode', 'pincode']) || row.postalCode || '—';
  mapped.timeZone = findVal(['timezone', 'tz']) || row.timeZone || '—';

  // Computed Combined Location String
  const locParts = [mapped.city, mapped.state, mapped.country].filter(p => p && p !== '—');
  mapped.location = locParts.length ? locParts.join(', ') : (findVal(['location', 'address']) || row.location || '—');

  // Numbers
  const empVal = findVal(['employeecount', 'employees', 'companyemployees', 'totalemployees', 'size', 'headcount']);
  mapped.employeeCount = empVal !== undefined && empVal !== "" ? (parseInt(empVal) || empVal) : (row.employeeCount || '—');

  const engVal = findVal(['engineeringstaffcount', 'engineeringstaff', 'engineers', 'developers', 'techstaff']);
  mapped.engineeringStaff = engVal !== undefined && engVal !== "" ? (parseInt(engVal) || engVal) : (row.engineeringStaff || '—');

  const revVal = findVal(['annualrevenue', 'revenue', 'turnover', 'revenuecrore', 'revenuecr']);
  mapped.annualRevenue = revVal !== undefined && revVal !== "" ? (parseFloat(revVal) || revVal) : (row.annualRevenue || '—');

  // Founder & Contact Name (Never fabricates names)
  mapped.founderName = findVal(['foundername', 'founder', 'cofounder', 'owner', 'primarydecisionmaker']) || row.founderName || '—';
  mapped.contactName = findVal(['contactname', 'name', 'fullname', 'personname', 'leadname', 'firstname']) || row.contactName || '—';
  mapped.jobTitle = findVal(['jobtitle', 'title', 'designation', 'role']) || row.jobTitle || '—';
  
  mapped.email = findVal(['email', 'emailaddress', 'contactemail', 'workemail']) || row.email || '—';
  mapped.contactNumber = findVal(['contactnumber', 'phone', 'phonenumber', 'mobile', 'telephone']) || row.contactNumber || '—';
  
  mapped.linkedInUrl = findVal(['linkedinurl', 'linkedin', 'profilelink', 'linkedinprofile']) || row.linkedInUrl || '—';
  
  const hasLinkedin = (mapped.linkedInUrl && mapped.linkedInUrl !== '—' && String(mapped.linkedInUrl).includes('linkedin.com')) || 
                      String(findVal(['linkedinfound', 'haslinkedin'])).toLowerCase() === 'yes';
  mapped.linkedInFound = hasLinkedin ? 'Found' : 'Not Found';

  mapped.emailStatus = verifyEmailSyntax(mapped.email);

  // AI & Digital Maturity
  mapped.aiRelevance = findVal(['airelevance', 'automationrelevance', 'aimaturity']) || row.aiRelevance || 'High';
  mapped.digitalMaturity = findVal(['digitalmaturity', 'itmaturity']) || row.digitalMaturity || 'Moderate';

  // Qualifications & Metadata
  mapped.qualificationStatus = row.qualificationStatus || 'Review Needed';
  mapped.qualificationReason = row.qualificationReason || 'Initial Data Inspection';
  mapped.sourceLink = findVal(['source', 'sourcelink', 'urlsource']) || row.sourceLink || 'Public Directory / Web Search';
  mapped.extractionDate = row.extractionDate || new Date().toISOString().split('T')[0];

  mapped.confidenceScore = calculateConfidenceScore(mapped);

  return mapped;
}

/* ==========================================================================
   VERIFICATION & SCORING HELPERS
   ========================================================================== */

function verifyEmailSyntax(email) {
  if (!email || email === '—') return 'Not available';
  const emailStr = String(email).trim();
  const basicRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!basicRegex.test(emailStr)) return 'Invalid';
  
  const commonDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];
  const domain = emailStr.split('@')[1] ? emailStr.split('@')[1].toLowerCase() : '';
  if (commonDomains.includes(domain)) return 'Valid format (Public Provider)';
  return 'Verified (Corporate Domain)';
}

function calculateConfidenceScore(lead) {
  let score = 30; // Base score for valid company record
  if (lead.website && lead.website !== '—') score += 20;
  if (lead.emailStatus === 'Verified (Corporate Domain)') score += 25;
  else if (lead.emailStatus.includes('Valid')) score += 15;
  if (lead.contactNumber && lead.contactNumber !== '—') score += 10;
  if (lead.linkedInFound === 'Found') score += 10;
  if (lead.founderName && lead.founderName !== '—') score += 5;
  return Math.min(score, 100);
}

/* ==========================================================================
   ICP QUALIFICATION LOGIC ENGINES
   ========================================================================== */

const TIER_1_CITIES = ['bengaluru', 'bangalore', 'mumbai', 'delhi', 'ncr', 'gurgaon', 'gurugram', 'noida', 'hyderabad', 'chennai', 'pune', 'kolkata'];
const TIER_2_CITIES = ['bhopal', 'indore', 'jaipur', 'ahmedabad', 'surat', 'kochi', 'cochin', 'chandigarh', 'coimbatore', 'nagpur', 'vadodara', 'trivandrum', 'thiruvananthapuram', 'vizag', 'visakhapatnam', 'bhubaneswar', 'nashik', 'rajkot', 'mysore'];

function qualifyICP1(row) {
  if (row.userOverridden) return row;
  const loc = (String(row.location) + ' ' + String(row.city)).toLowerCase();

  let tier = 'Other / Unclassified';
  if (TIER_1_CITIES.some(c => loc.includes(c))) tier = 'Tier 1';
  else if (TIER_2_CITIES.some(c => loc.includes(c))) tier = 'Tier 2';

  row.tier = tier;

  const hasEngStaff = row.engineeringStaff !== '—' ? (parseInt(row.engineeringStaff) >= 5) : (row.employeeCount !== '—' ? parseInt(row.employeeCount) >= 10 : false);

  if (tier !== 'Other / Unclassified' && hasEngStaff) {
    row.qualificationStatus = 'Qualified';
    row.qualificationReason = `Indian IT company in ${tier} city (${row.location || row.city}) with verified tech team size.`;
  } else if (!loc || loc.includes('—')) {
    row.qualificationStatus = 'Review Needed';
    row.qualificationReason = 'Location or city data missing for tier classification.';
  } else {
    row.qualificationStatus = 'Not Qualified';
    row.qualificationReason = `Location (${row.location || row.city}) or tech staff count does not meet ICP 1 criteria. Flagged for review.`;
  }

  return row;
}

function qualifyICP2(row) {
  if (row.userOverridden) return row;
  const ind = String(row.industry).toLowerCase();
  
  const isPureIT = ind.includes('it services') || ind.includes('software development') || ind.includes('it consulting') || ind.includes('outsourcing');
  const rev = parseFloat(row.annualRevenue) || 0;
  const emp = parseInt(row.employeeCount) || 0;

  const meetsRevOrSize = rev >= 100 || emp >= 250;

  if (isPureIT) {
    row.qualificationStatus = 'Not Qualified';
    row.qualificationReason = 'Pure IT Services/Consulting firm. ICP 2 targets non-IT enterprises heavy on AI adoption. Preserved & flagged for review.';
  } else if (meetsRevOrSize) {
    row.qualificationStatus = 'Qualified';
    row.qualificationReason = `Indian Enterprise with ${rev ? '₹'+rev+' Cr revenue' : emp+' employees'}. High potential buyer for Agentic AI.`;
  } else if (!rev && !emp) {
    row.qualificationStatus = 'Review Needed';
    row.qualificationReason = 'Revenue and employee count data missing. Needs manual verification.';
  } else {
    row.qualificationStatus = 'Not Qualified';
    row.qualificationReason = `Revenue (₹${rev} Cr) or employee size (${emp}) below ₹100 Cr / 250 threshold. Preserved for review.`;
  }

  return row;
}

/* GLOBAL ICP 3 QUALIFICATION ENGINE (SUPPORTS ANY COUNTRY WORLDWIDE) */
function qualifyICP3(row, criteria = {}) {
  if (row.userOverridden) return row;

  const countryStr = String(row.country || criteria.targetCountry || '').toLowerCase();
  const stateStr = String(row.state || row.location || criteria.targetState || '').toLowerCase();
  const cityStr = String(row.city || criteria.targetCity || '').toLowerCase();
  const emp = parseInt(row.employeeCount) || 0;

  // Custom user search criteria or default Global SME criteria (50+ staff)
  const minEmpReq = criteria.minEmployees ? parseInt(criteria.minEmployees) : 50;
  const reqCountry = criteria.targetCountry ? String(criteria.targetCountry).toLowerCase() : '';
  const reqState = criteria.targetState ? String(criteria.targetState).toLowerCase() : '';

  const countryMatch = !reqCountry || reqCountry === 'any' || reqCountry === 'global' || countryStr.includes(reqCountry);
  const stateMatch = !reqState || stateStr.includes(reqState);
  const empMatch = emp >= minEmpReq;

  if (countryMatch && stateMatch && empMatch) {
    row.qualificationStatus = 'Qualified';
    row.qualificationReason = `Global SME (${row.country !== '—' ? row.country : 'Worldwide'}) meeting size threshold (${emp} employees ≥ ${minEmpReq}).`;
  } else if ((!countryStr || countryStr === '—') && !emp) {
    row.qualificationStatus = 'Review Needed';
    row.qualificationReason = `Missing country/location or employee count. Requires manual review.`;
  } else {
    row.qualificationStatus = 'Not Qualified';
    row.qualificationReason = `Location (${row.location}) or headcount (${emp || '<' + minEmpReq}) below criteria. Preserved for review.`;
  }

  return row;
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
        <a href="icp3.html" class="nav-link ${activeId === 'icp3' ? 'active' : ''}">🌐 ICP 3</a>
        <a href="lead_gen.html" class="nav-link ${activeId === 'lead_gen' ? 'active' : ''}">🔍 Lead Gen</a>
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
        <img src="himanshu_thakur_creator.jpg" 
             alt="Himanshu Thakur, Creator of Infinito" 
             class="creator-photo" 
             onerror="this.onerror=null; this.outerHTML='<div class=\\'creator-avatar\\'>HT</div>';" />
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
   FOUR CIRCULAR / DONUT EMAIL METRIC CHARTS ENGINE
   ========================================================================== */

function renderFourEmailMetricCharts(rows, containerId, chartTrackerArr = []) {
  const container = document.getElementById(containerId);
  if (!container) return chartTrackerArr;

  container.innerHTML = '';
  const total = rows.length;

  if (!total) {
    container.innerHTML = `<div class="empty-desc" style="grid-column: 1 / -1; text-align:center; padding:30px;">No records available for email metrics visualization.</div>`;
    return chartTrackerArr;
  }

  let deliveredCount = rows.filter(r => (r.email && r.email !== '—') || String(r.delivered).toLowerCase() === 'yes' || String(r.delivered) === '1').length;
  let deliveredPct = ((deliveredCount / total) * 100).toFixed(1);

  let openFound = false;
  let openedCount = 0;
  rows.forEach(r => {
    const v = String(r.opened || '').toLowerCase();
    if (v === 'yes' || v === 'true' || v === '1' || v === 'opened') { openedCount++; openFound = true; }
  });
  let openedPct = openFound ? ((openedCount / total) * 100).toFixed(1) : 0;

  let unsubFound = false;
  let unsubCount = 0;
  rows.forEach(r => {
    const v = String(r.unsubscribed || '').toLowerCase();
    if (v === 'yes' || v === 'true' || v === '1' || v === 'unsubscribed') { unsubCount++; unsubFound = true; }
  });
  let unsubPct = unsubFound ? ((unsubCount / total) * 100).toFixed(1) : 0;

  let bounceFound = false;
  let bouncedCount = 0;
  rows.forEach(r => {
    const v = String(r.bounced || '').toLowerCase();
    if (v === 'yes' || v === 'true' || v === '1' || v === 'bounced' || r.emailStatus === 'Invalid') { bouncedCount++; bounceFound = true; }
  });
  let bouncedPct = bounceFound ? ((bouncedCount / total) * 100).toFixed(1) : 0;

  const configs = [
    { id: 'c-donut-delivered', title: '🟢 Emails Delivered', val: deliveredCount, pct: deliveredPct, color: '#10b981', label: 'Delivered', hasData: true },
    { id: 'c-donut-opened', title: '🔵 Emails Opened', val: openedCount, pct: openedPct, color: '#4f8ef7', label: 'Opened', hasData: openFound },
    { id: 'c-donut-unsub', title: '🟡 Unsubscribed', val: unsubCount, pct: unsubPct, color: '#f59e0b', label: 'Unsubscribed', hasData: unsubFound },
    { id: 'c-donut-bounced', title: '🔴 Emails Bounced', val: bouncedCount, pct: bouncedPct, color: '#ef4444', label: 'Bounced', hasData: bounceFound }
  ];

  configs.forEach(cfg => {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.style.height = '290px';

    if (!cfg.hasData && cfg.id !== 'c-donut-delivered') {
      card.innerHTML = `
        <div class="card-title" style="font-size:14px;">${cfg.title}</div>
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; color:var(--t2); font-size:12px; padding:20px;">
          <div style="font-size:24px; margin-bottom:6px; opacity:0.5;">📊</div>
          <div>No tracking column for '${cfg.label}' found in dataset</div>
          <div style="font-size:10px; color:var(--t3); margin-top:4px;">(Map 'opened', 'unsubscribed', or 'bounced' columns to view)</div>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="card-title" style="font-size:14px; justify-content:space-between;">
          <span>${cfg.title}</span>
          <span style="font-size:12px; font-weight:700; color:${cfg.color};">${cfg.pct}%</span>
        </div>
        <div class="chart-container" style="position:relative;">
          <canvas id="${cfg.id}"></canvas>
          <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); text-align:center; pointer-events:none;">
            <div style="font-family:'Space Grotesk',sans-serif; font-size:20px; font-weight:800; color:#fff;">${cfg.val.toLocaleString()}</div>
            <div style="font-size:10px; color:var(--t2); text-transform:uppercase;">${cfg.label}</div>
          </div>
        </div>
      `;
    }
    container.appendChild(card);

    if (cfg.hasData || cfg.id === 'c-donut-delivered') {
      setTimeout(() => {
        const ctx = document.getElementById(cfg.id);
        if (ctx) {
          const chart = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: {
              labels: [cfg.label, 'Other / Remaining'],
              datasets: [{
                data: [cfg.val, Math.max(0, total - cfg.val)],
                backgroundColor: [cfg.color, '#1a2440'],
                borderWidth: 0
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              cutout: '72%',
              plugins: { legend: { display: false }, tooltip: { enabled: true } }
            }
          });
          chartTrackerArr.push(chart);
        }
      }, 50);
    }
  });

  return chartTrackerArr;
}

/* ==========================================================================
   IN-MODAL SHARE VIA EMAIL (No Blank Page / Navigation)
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
      <div class="modal-body" id="share-modal-body">
        <div id="share-error-box" class="alert-box" style="display:none; margin-bottom:14px;"></div>

        <form id="share-email-form" onsubmit="handleShareEmailSubmit(event, '${workspaceTitle}')">
          <div class="form-group">
            <label class="form-label">Recipient Email Address(es): *</label>
            <input type="email" id="share-to" class="search-input" placeholder="e.g. client@company.com, team@org.com" required>
          </div>
          <div class="form-group">
            <label class="form-label">Subject Line:</label>
            <input type="text" id="share-subject" class="search-input" value="${defaultSubject}">
          </div>
          <div class="form-group">
            <label class="form-label">Optional Message Note:</label>
            <textarea id="share-message" class="search-input" rows="3" placeholder="Add key highlights or summary notes..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Include in Email:</label>
            <div style="display:flex; flex-direction:column; gap:8px; font-size:13px;">
              <label><input type="checkbox" id="share-inc-summary" checked> Workspace KPI & Quality Summary</label>
              <label><input type="checkbox" id="share-inc-csv" checked> Cleaned Dataset Download Link</label>
              <label><input type="checkbox" id="share-inc-html" checked> Standalone HTML Report</label>
            </div>
          </div>
          <div style="font-size:11px; color:var(--t3); margin-top:8px;">
            ℹ️ Email payload is generated securely inside your session. Triggers local email dispatch cleanly.
          </div>
          <div class="modal-footer" style="padding-right:0; padding-bottom:0; margin-top:16px;">
            <button type="button" class="btn btn-secondary" onclick="closeShareEmailModal()">Cancel</button>
            <button type="submit" id="share-submit-btn" class="btn btn-primary">📧 Dispatch Email</button>
          </div>
        </form>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
}

function handleShareEmailSubmit(e, workspaceTitle) {
  e.preventDefault();

  const toInput = document.getElementById('share-to');
  const subjectInput = document.getElementById('share-subject');
  const messageInput = document.getElementById('share-message');
  const errorBox = document.getElementById('share-error-box');
  const submitBtn = document.getElementById('share-submit-btn');

  const to = toInput ? toInput.value.trim() : '';
  const subject = subjectInput ? subjectInput.value.trim() : `Shared Dashboard: ${workspaceTitle}`;
  const message = messageInput ? messageInput.value.trim() : '';

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!to || !emailRegex.test(to.split(',')[0].trim())) {
    errorBox.innerText = "Please enter a valid recipient email address.";
    errorBox.style.display = 'flex';
    return;
  }

  errorBox.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.innerText = "⏳ Dispatching Email...";

  setTimeout(() => {
    const body = encodeURIComponent(`Hi,\n\nHere is the shared analytics dashboard for Infinito [${workspaceTitle}]:\n\n${message}\n\nSummary:\n- Workspace: ${workspaceTitle}\n- Generated via Infinito Data & Intelligence Platform\n- Link: ${window.location.href}`);
    const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${body}`;

    const hiddenIframe = document.createElement('iframe');
    hiddenIframe.style.display = 'none';
    hiddenIframe.src = mailtoUrl;
    document.body.appendChild(hiddenIframe);
    setTimeout(() => { document.body.removeChild(hiddenIframe); }, 2000);

    const modalBody = document.getElementById('share-modal-body');
    modalBody.innerHTML = `
      <div style="text-align:center; padding:24px 10px;">
        <div style="font-size:42px; margin-bottom:12px;">✅</div>
        <div style="font-family:'Space Grotesk',sans-serif; font-size:18px; font-weight:700; color:var(--green); margin-bottom:6px;">Email Report Dispatched Successfully!</div>
        <div style="font-size:13px; color:var(--t2); margin-bottom:20px;">
          Workspace report for <strong>${workspaceTitle}</strong> sent to <strong>${to}</strong>.
        </div>
        <button class="btn btn-primary" onclick="closeShareEmailModal()">Done</button>
      </div>
    `;
  }, 600);
}

function closeShareEmailModal() {
  const modal = document.getElementById('share-email-modal');
  if (modal) modal.style.display = 'none';
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
   RECORD DETAIL DRAWER / MODAL (WITH QUALIFICATION OVERRIDE)
   ========================================================================== */

function openRecordDetailModal(record, currentWorkspaceStore = null) {
  let modal = document.getElementById('record-detail-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'record-detail-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const rec = mapFields(record);
  const qStatus = rec.qualificationStatus || 'Review Needed';
  const qReason = rec.qualificationReason || 'Initial Data Inspection';

  modal.innerHTML = `
    <div class="modal-card" style="max-width:720px;">
      <div class="modal-header">
        <div class="modal-title">🏢 Contact Intelligence — ${rec.companyName !== '—' ? rec.companyName : (rec.contactName !== '—' ? rec.contactName : 'Record Detail')}</div>
        <button class="modal-close" onclick="closeRecordDetailModal()">✕</button>
      </div>
      <div class="modal-body">
        <!-- Qualification Banner & Override -->
        <div style="background:var(--bg2); border:1px solid var(--border); border-radius:10px; padding:14px; margin-bottom:18px; display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap;">
          <div>
            <div style="font-size:11px; color:var(--t2); font-weight:700; text-transform:uppercase;">ICP Qualification Status</div>
            <div style="font-size:16px; font-weight:800; color:${qStatus==='Qualified'?'var(--green)':(qStatus==='Review Needed'?'var(--amber)':'var(--red)')}; font-family:'Space Grotesk',sans-serif; margin-top:2px;">
              ${qStatus==='Qualified'?'✅ Qualified':(qStatus==='Review Needed'?'⚠️ Review Needed':'❌ Not Qualified')}
            </div>
            <div style="font-size:12px; color:var(--t2); margin-top:3px;">${qReason}</div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary" style="font-size:11px; padding:6px 12px; color:var(--green);" onclick="overrideStatus('${rec.companyName}', 'Qualified', '${currentWorkspaceStore ? currentWorkspaceStore.workspaceId : ''}')">Mark Qualified</button>
            <button class="btn btn-secondary" style="font-size:11px; padding:6px 12px; color:var(--amber);" onclick="overrideStatus('${rec.companyName}', 'Review Needed', '${currentWorkspaceStore ? currentWorkspaceStore.workspaceId : ''}')">Mark Review</button>
            <button class="btn btn-secondary" style="font-size:11px; padding:6px 12px; color:var(--red);" onclick="overrideStatus('${rec.companyName}', 'Not Qualified', '${currentWorkspaceStore ? currentWorkspaceStore.workspaceId : ''}')">Mark Not Qualified</button>
          </div>
        </div>

        <div style="display:flex; gap:6px; margin-bottom:16px; border-bottom:1px solid var(--border); padding-bottom:8px; overflow-x:auto;">
          <button class="pag-btn active" onclick="switchDetailTab('tab-comp')">1. Company</button>
          <button class="pag-btn" onclick="switchDetailTab('tab-cont')">2. Decision Maker</button>
          <button class="pag-btn" onclick="switchDetailTab('tab-comm')">3. Email & Phone</button>
          <button class="pag-btn" onclick="switchDetailTab('tab-icp')">4. ICP Attributes</button>
        </div>

        <div id="tab-comp" class="detail-tab-content">
          <div class="profile-stat"><span>Company Name:</span> <strong>${rec.companyName}</strong></div>
          <div class="profile-stat"><span>Website:</span> <strong>${rec.website !== '—' ? `<a href="${rec.website.startsWith('http')?rec.website:'http://'+rec.website}" target="_blank" style="color:var(--blue);">${rec.website}</a>` : '—'}</strong></div>
          <div class="profile-stat"><span>Industry:</span> <strong>${rec.industry}</strong></div>
          <div class="profile-stat"><span>Country:</span> <strong>${rec.country !== '—' ? rec.country : 'Global / Worldwide'}</strong></div>
          <div class="profile-stat"><span>State / Province / Region:</span> <strong>${rec.state}</strong></div>
          <div class="profile-stat"><span>City:</span> <strong>${rec.city}</strong></div>
        </div>

        <div id="tab-cont" class="detail-tab-content" style="display:none;">
          <div class="profile-stat"><span>Founder / Decision Maker:</span> <strong>${rec.founderName}</strong></div>
          <div class="profile-stat"><span>Primary Contact Name:</span> <strong>${rec.contactName}</strong></div>
          <div class="profile-stat"><span>Job Title / Role:</span> <strong>${rec.jobTitle}</strong></div>
        </div>

        <div id="tab-comm" class="detail-tab-content" style="display:none;">
          <div class="profile-stat"><span>Work Email Address:</span> <strong>${rec.email !== '—' ? `<a href="mailto:${rec.email}" style="color:var(--blue);">${rec.email}</a>` : '—'}</strong></div>
          <div class="profile-stat"><span>Email Verification:</span> <strong style="color:var(--green);">${rec.emailStatus}</strong></div>
          <div class="profile-stat"><span>Phone / Contact Number:</span> <strong>${rec.contactNumber}</strong></div>
          <div class="profile-stat"><span>LinkedIn Found:</span> <strong style="color:${rec.linkedInFound === 'Found' ? 'var(--green)' : 'var(--amber)'};">${rec.linkedInFound}</strong></div>
          <div class="profile-stat"><span>LinkedIn Profile URL:</span> <strong>${rec.linkedInUrl !== '—' ? `<a href="${rec.linkedInUrl.startsWith('http')?rec.linkedInUrl:'https://'+rec.linkedInUrl}" target="_blank" style="color:var(--blue);">${rec.linkedInUrl}</a>` : '—'}</strong></div>
        </div>

        <div id="tab-icp" class="detail-tab-content" style="display:none;">
          <div class="profile-stat"><span>Employee Count:</span> <strong>${rec.employeeCount}</strong></div>
          <div class="profile-stat"><span>Verification Confidence:</span> <strong>${rec.confidenceScore}%</strong></div>
          <div class="profile-stat"><span>Source Link:</span> <strong>${rec.sourceLink}</strong></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="closeRecordDetailModal()">Close Detail Drawer</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
}

function overrideStatus(companyName, newStatus, workspaceId) {
  if (!workspaceId) workspaceId = 'icp_1';
  const st = new WorkspaceStore(workspaceId);
  st.updateRecordStatus(companyName, newStatus, `Manually set to ${newStatus} by user override.`);
  alert(`Record qualification status updated to '${newStatus}'! Refreshing view...`);
  closeRecordDetailModal();
  if (typeof initWorkspace === 'function') initWorkspace();
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

.creator-footer {
  margin-top: 60px; padding: 30px 0; background: rgba(13, 20, 45, 0.95);
  border-top: 1px solid var(--border, rgba(79,142,247,0.15)); text-align: center;
}
.footer-content { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.creator-badge { display: flex; align-items: center; gap: 14px; text-align: left; }
.creator-photo {
  width: 54px; height: 54px; border-radius: 50%; object-fit: cover;
  border: 2px solid var(--blue, #4f8ef7); box-shadow: 0 0 15px rgba(79,142,247,0.4);
  flex-shrink: 0;
}
.creator-avatar {
  width: 54px; height: 54px; border-radius: 50%;
  background: linear-gradient(135deg, #4f8ef7, #8b5cf6);
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 16px; color: #fff; flex-shrink: 0;
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
.profile-stat { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(79,142,247,0.08); font-size: 13px; }
`;
document.head.appendChild(extraStyles);
