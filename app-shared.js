/* ==========================================================================
   INFINITO UNIFIED DASHBOARD GENERATOR ENGINE — app-shared.js
   Local-First Deterministic Engine:
   Parse -> Profile -> Health Score -> Clean -> Smart Dashboard -> Export
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

/* Deterministic Data Profiling & Quality Score Calculation */
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

/* Deterministic Data Cleaning Engine */
function cleanDatasetRows(rawRows, headers) {
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
        if (['null', 'undefined', 'n/a', 'na', 'nan', 'none', '-', '—'].includes(val.toLowerCase())) {
          val = '';
        }
      }
      sanitized[k] = val;
    });

    const mapped = mapFields(sanitized);
    const hash = `${(mapped.email||'').toLowerCase().trim()}_${(mapped.companyName||'').toLowerCase().trim()}_${(mapped.contactName||'').toLowerCase().trim()}`;
    if (seenHashes.has(hash)) return;
    seenHashes.add(hash);

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

/* Export Functions */
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
