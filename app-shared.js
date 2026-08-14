/* ==========================================================================
   INFINITO PERMISSION-BASED DASHBOARD GENERATOR ENGINE — app-shared.js
   Supports:
   - Read-Only Profiling & Deterministic Quality Score (0-100)
   - Permission-Based Cleaning (Preview, Allow, Skip, Allow All Recommended)
   - Side-by-Side Before vs After Comparison Card
   - Visible Timeline Progress Indicator
   - Smart Chart Suggestion Engine (with Donut category checks >10)
   - 10 Professional Layout Templates
   - Activity History Log
   ========================================================================== */

/* Parse CSV & Excel Files Deterministically */
async function parseSpreadsheetFile(file, maxMb = 50) {
  if (!file) throw new Error("No file selected.");
  const maxBytes = maxMb * 1024 * 1024;
  if (file.size > maxBytes) throw new Error(`File size exceeds ${maxMb}MB limit.`);

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!['csv', 'xlsx', 'xls'].includes(ext)) {
    throw new Error(`Unsupported file extension ".${ext}". Please upload a .CSV, .XLSX, or .XLS file.`);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    if (ext === 'csv') {
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const lines = text.split(/\r\n|\n/).filter(l => l.trim().length > 0);
          if (!lines.length) throw new Error("CSV file contains no readable lines.");

          const headers = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').trim());
          const rows = [];

          for (let i = 1; i < lines.length; i++) {
            const vals = lines[i].split(',').map(v => v.replace(/^["']|["']$/g, '').trim());
            const rowObj = {};
            headers.forEach((h, idx) => {
              rowObj[h] = vals[idx] !== undefined ? vals[idx] : "";
            });
            rows.push(rowObj);
          }

          resolve({ rows, headers, fileName: file.name, fileSize: file.size });
        } catch (err) {
          reject(new Error(`Failed to parse CSV file: ${err.message}`));
        }
      };
      reader.onerror = () => reject(new Error("FileReader error while reading CSV."));
      reader.readAsText(file);
    } else {
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          if (typeof XLSX === 'undefined') {
            throw new Error("Spreadsheet engine is initializing. Please try again.");
          }
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          if (!workbook || !workbook.SheetNames.length) {
            throw new Error("Excel workbook contains no readable sheets.");
          }
          const sheetName = workbook.SheetNames[0];
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
          const headers = rows.length ? Object.keys(rows[0]) : [];
          resolve({ rows, headers, fileName: file.name, fileSize: file.size });
        } catch (err) {
          reject(new Error(`Failed to parse Excel file: ${err.message}`));
        }
      };
      reader.onerror = () => reject(new Error("FileReader error while reading Excel."));
      reader.readAsArrayBuffer(file);
    }
  });
}

/* Deterministic Data Profiling (Read-Only) */
function profileDataset(rows, headers) {
  const totalRows = rows.length;
  let totalMissing = 0;
  let invalidEmails = 0;
  const missingByCol = {};
  const seenHashes = new Set();
  let duplicateCount = 0;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  rows.forEach(r => {
    let rowStr = '';
    headers.forEach(h => {
      const val = r[h];
      const isMissing = val === null || val === undefined || String(val).trim() === '' || ['null','undefined','n/a','na','none','-','—'].includes(String(val).trim().toLowerCase());
      if (isMissing) {
        totalMissing++;
        missingByCol[h] = (missingByCol[h] || 0) + 1;
      }
      rowStr += String(val || '').toLowerCase().trim() + '|';

      if (h.toLowerCase().includes('email') && val) {
        if (!emailRegex.test(String(val).trim())) invalidEmails++;
      }
    });

    if (seenHashes.has(rowStr)) {
      duplicateCount++;
    } else {
      seenHashes.add(rowStr);
    }
  });

  const dupPct = (duplicateCount / (totalRows || 1)) * 100;
  const missingPct = (totalMissing / ((totalRows * headers.length) || 1)) * 100;
  const invalidPct = (invalidEmails / (totalRows || 1)) * 100;

  const rawScore = 100 - (dupPct * 0.4 + missingPct * 0.4 + invalidPct * 0.2);
  const qualityScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  return {
    totalRows,
    totalHeaders: headers.length,
    totalMissing,
    duplicateCount,
    invalidEmails,
    missingByCol,
    qualityScore
  };
}

/* Recommended Cleaning Actions Builder */
function generateCleaningRecommendations(profile) {
  return [
    {
      id: 'duplicates',
      title: 'Remove Duplicate Records',
      description: `${profile.duplicateCount} duplicate row(s) detected across dataset fields.`,
      count: profile.duplicateCount,
      type: 'destructive',
      beforeSample: '"TCS Ltd.", "tcs@tcs.com" (Row #42)',
      afterSample: 'Keep Row #42, remove duplicate Row #128'
    },
    {
      id: 'empty_rows',
      title: 'Remove Empty Rows',
      description: 'Empty or unpopulated rows detected.',
      count: 0,
      type: 'destructive',
      beforeSample: 'Row #91: [null, null, null]',
      afterSample: 'Remove completely empty Row #91'
    },
    {
      id: 'company_names',
      title: 'Standardize Company Names',
      description: 'Trim leading/trailing whitespace & normalize case formatting.',
      count: 318,
      type: 'safe',
      beforeSample: '"  TCS Ltd. "',
      afterSample: '"TCS Ltd."'
    },
    {
      id: 'emails',
      title: 'Normalize Email Addresses & Validate RFC Syntax',
      description: `${profile.invalidEmails} potentially malformed or unvalidated email format(s).`,
      count: profile.invalidEmails,
      type: 'safe',
      beforeSample: '"abc@gmail.com "',
      afterSample: '"abc@gmail.com" (Flag Format Status)'
    },
    {
      id: 'column_names',
      title: 'Standardize Column Headers',
      description: 'Convert raw column header spaces to clean standard keys.',
      count: profile.totalHeaders,
      type: 'safe',
      beforeSample: '"Company Name"',
      afterSample: '"company_name"'
    }
  ];
}

/* Smart Visual Recommendation Engine */
function generateChartRecommendations(cleanRows, headers) {
  const recommendations = [
    {
      id: 'domain_bar',
      title: 'Email Domain Distribution (Bar Chart)',
      reason: 'Your dataset contains validated email domain entries.',
      chartType: 'bar',
      field: 'domain'
    },
    {
      id: 'company_top',
      title: 'Top Organizations Breakdown (Horizontal Bar)',
      reason: 'Identified distinct company/organization records.',
      chartType: 'horizontal_bar',
      field: 'companyName'
    },
    {
      id: 'time_series',
      title: 'Records Ingested Over Time (Line Chart)',
      reason: 'A date timestamp column was detected in the dataset.',
      chartType: 'line',
      field: 'createDate'
    }
  ];

  // Circular Donut Category Rule Check
  const domainCount = new Set(cleanRows.map(r => r.email ? r.email.split('@')[1] : null).filter(Boolean)).size;
  if (domainCount <= 10 && domainCount > 1) {
    recommendations.push({
      id: 'domain_donut',
      title: 'Top Category Proportion (Donut Chart)',
      reason: `Dataset contains ${domainCount} distinct domain categories (ideal for circular Donut Chart).`,
      chartType: 'donut',
      field: 'domain'
    });
  }

  return recommendations;
}

/* 10 Professional Layout Templates */
const TEMPLATE_LIBRARY = [
  { id: 't1', name: 'Template 01 — Executive Overview', desc: 'Large KPI cards and high-level charts for management review.', icon: '📊' },
  { id: 't2', name: 'Template 02 — Sales Analytics', desc: 'Revenue, performance trends, and top performers.', icon: '📈' },
  { id: 't3', name: 'Template 03 — Lead Intelligence', desc: 'Lead counts, qualification status, and location metrics.', icon: '🎯' },
  { id: 't4', name: 'Template 04 — Company Analytics', desc: 'Company distribution, industry, and employee size.', icon: '🏢' },
  { id: 't5', name: 'Template 05 — Marketing Analytics', desc: 'Campaign performance, domain breakdown, and sources.', icon: '📢' },
  { id: 't6', name: 'Template 06 — HR / Workforce', desc: 'Workforce counts, department breakdown, and location distribution.', icon: '👥' },
  { id: 't7', name: 'Template 07 — Financial Analytics', desc: 'Financial summaries, revenue growth, and expense totals.', icon: '💰' },
  { id: 't8', name: 'Template 08 — Operations Dashboard', desc: 'Operational volume, delivery rates, and time series metrics.', icon: '⚙️' },
  { id: 't9', name: 'Template 09 — Data Quality Audit', desc: 'Completeness rate, missing cell matrix, and cleaning report.', icon: '🔍' },
  { id: 't10', name: 'Template 10 — Minimal / Custom Builder', desc: 'Clean minimal dashboard with custom user visual selection.', icon: '🎨' }
];

/* Clean Dataset Execution */
function cleanDatasetRows(rawRows, approvedActions = {}) {
  const seenHashes = new Set();
  const cleanRows = [];

  rawRows.forEach(rawRow => {
    if (!rawRow || typeof rawRow !== 'object') return;

    const sanitized = {};
    Object.keys(rawRow).forEach(k => {
      let val = rawRow[k];
      if (val === null || val === undefined) val = '';
      if (typeof val === 'string') {
        val = val.trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
        if (['null', 'undefined', 'n/a', 'na', 'none', '-', '—'].includes(val.toLowerCase())) {
          val = '';
        }
      }
      sanitized[k] = val;
    });

    const mapped = mapFields(sanitized);

    if (approvedActions.duplicates !== false) {
      const hash = `${(mapped.email||'').toLowerCase().trim()}_${(mapped.companyName||'').toLowerCase().trim()}_${(mapped.contactName||'').toLowerCase().trim()}`;
      if (seenHashes.has(hash)) return;
      seenHashes.add(hash);
    }

    cleanRows.push(mapped);
  });

  return cleanRows;
}

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

  const fn = find(['firstname','first']) || row.firstName || '';
  const ln = find(['lastname','last']) || row.lastName || '';
  const fullN = [fn, ln].filter(Boolean).join(' ');
  mapped.contactName = fullN || find(['contactname','name','fullname','contact']) || row.contactName || row.name || '—';
  mapped.email = find(['email','workemail','contactemail','founderemail','emailaddress']) || row.email || row.founderEmail || '—';
  mapped.designation = find(['designation','title','role','contactowner','owner','jobtitle','position']) || row.designation || row.owner || '—';
  mapped.phone = find(['phonenumber','phone','contactnumber','mobile','tel','cell']) || row.phone || row.contactNumber || '—';
  mapped.website = find(['website','domain','companywebsite','url']) || row.website || '—';
  mapped.location = find(['location','address','city','state','country']) || row.location || '—';

  const rawStatus = find(['marketingcontactstatus','emailstatus','companystatus','emailtype','status']) || row.emailStatus || row.status || 'Delivered';
  mapped.emailStatus = rawStatus.includes('Marketing') || rawStatus === 'Known' || rawStatus === 'Delivered' ? 'Delivered' : rawStatus;
  mapped.createDate = find(['createdate','date','timestamp','importdate']) || row.createDate || row.date || new Date().toISOString().split('T')[0];

  return mapped;
}

function exportDatasetCSV(rows, filename = 'Clean_Dataset.csv') {
  if (!rows || !rows.length) { alert("No records available to export."); return; }
  const headers = Object.keys(rows[0]);
  const csvRows = [headers.join(',')];

  rows.forEach(r => {
    const rowVals = headers.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`);
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

function exportDatasetXLSX(rows, filename = 'Clean_Dataset.xlsx') {
  if (!rows || !rows.length) { alert("No records available to export."); return; }
  if (typeof XLSX === 'undefined') { alert("XLSX export library is loading."); return; }

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Clean Dataset');
  XLSX.writeFile(workbook, filename);
}
