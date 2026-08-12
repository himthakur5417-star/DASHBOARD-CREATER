# ⚡ Anti-Gravity | Smart Auto-Dashboard & Data Studio

An enterprise-grade, automated **Data Processing, Cleaning, Quality Diagnostics, and Dynamic Power BI-style Dashboard Generator** web application suite. 

Allows users to upload any `.csv`, `.xls`, or `.xlsx` spreadsheet file and automatically generates a custom, interactive dashboard with real-time filtering, schema inference, data cleaning controls, and data health scores — **without losing or breaking existing dashboards**.

![Dashboard Preview](https://img.shields.io/badge/Dashboard-Power%20BI%20Style-4f8ef7?style=for-the-badge&logo=powerbi)
![Supported Formats](https://img.shields.io/badge/Formats-CSV%20%7C%20XLS%20%7C%20XLSX-06b6d4?style=for-the-badge)
![Vercel Ready](https://img.shields.io/badge/Deployment-Vercel-000000?style=for-the-badge&logo=vercel)

---

## 🌟 Key Application Modules

### 1. ⚡ **Smart Auto-Dashboard Studio (`index.html` - Primary Landing)**
- **File Upload & Parsing**: Drag-and-drop support for `.csv`, `.xls`, `.xlsx` up to 25MB. Powered by SheetJS for 100% private, client-side browser parsing.
- **Excel Multi-Sheet Selector**: Automatically detects all sheets in Excel workbooks and intelligently pre-selects the largest data sheet.
- **Data Preview & Schema Detection**: Auto-detects data types (`Numeric`, `Category`, `Date`, `Boolean`, `Text`) with interactive type badges and a 10-row preview table.
- **Data Quality Diagnostics Studio**:
  - Auto-calculated **Data Health Score (0-100%)** and **Completeness Score**.
  - Categorized findings with severity levels: `Critical` 🚨, `Warning` ⚠️, and `Info` ℹ️.
- **Configurable Cleaning Engine**:
  - Deduplication (detects & removes duplicate rows).
  - Column name normalization (trims whitespace, removes illegal symbols).
  - Missing value imputation strategies (fill numeric with 0, text with 'N/A', or keep blank).
  - String whitespace trimming.
  - Transparent **"What Changed" Audit Trail**.
  - Cleaned data export in `.csv` or `.xlsx` formats.
- **Dynamic Auto-Generated Dashboard**:
  - Automatically selects optimal visualizations based on dataset columns.
  - Dynamic KPI cards (Totals, Health Score, Numerical Averages, Top Categories).
  - Smart Chart.js Visualizations (Bar distribution, Donut composition, Time-series trendlines).
  - Automated natural-language narrative insights.
  - Interactive Filter Bar (Global search + dynamic category dropdown filters).
  - Interactive Data Explorer Table with sorting, pagination, and search highlights.

### 2. 📊 **Master CRM Intelligence Dashboard (`dashboard.html`)**
- Full analysis of **2,066+ contacts** cleaned from HubSpot CRM export.
- Segmented views for Lead Scores, Domain counts, Unassigned Leads, and Company Verifications.

### 3. 🎯 **ICP-1 Advocates Dashboard (`icp1_leads_dashboard.html`)**
- Specialized lead prospecting dashboard for legal advocates and high-intent leads in Bhopal/Indore markets.

---

## 📁 Repository Structure

```
DASHBOARD-CREATER/
├── index.html                 # ⚡ Primary Smart Upload, Data Cleaning & Auto-Dashboard Studio
├── dashboard.html             # 📊 Master CRM Contact Intelligence Dashboard
├── icp1_leads_dashboard.html  # 🎯 ICP-1 Advocate & Legal Prospecting Dashboard
├── cleaned_data.json          # Processed CRM dataset (sample pre-loader)
├── combined_data.json         # Combined intelligence dataset (v1)
├── combined_data_v2.json      # Enhanced combined dataset with metadata (v2)
├── contacts_raw.csv           # Original raw HubSpot CRM contact export
├── vercel.json                # Vercel deployment route configuration
└── README.md                  # Comprehensive project documentation
```

---

## 🚀 How to Run Locally

No build step or `node_modules` required!

### Option A: Open in Browser
Double-click `index.html` in your file explorer.

### Option B: Local HTTP Server
```bash
python3 -m http.server 8000
```
Then visit `http://localhost:8000/`.

---

## 🌐 Deployment (Vercel)

This repository includes a `vercel.json` routing configuration:
- `/` → Serves the **Smart Auto-Dashboard Studio** (`index.html`)
- `/dashboard` → Serves **Master CRM Dashboard** (`dashboard.html`)
- `/icp1` → Serves **ICP-1 Advocates Dashboard** (`icp1_leads_dashboard.html`)

Simply commit and push to GitHub, and Vercel will automatically re-deploy your live website!

---

## 🛠️ Technology Stack

- **Frontend Core**: HTML5, ES6+ JavaScript, CSS3 (Glassmorphic Design Tokens)
- **Parsing Engine**: [SheetJS](https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js)
- **Chart Engine**: [Chart.js v4](https://www.chartjs.org/)
- **Fonts**: Google Fonts (*Inter* & *Space Grotesk*)
