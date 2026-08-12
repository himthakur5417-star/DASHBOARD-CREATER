# ⚡ Anti-Gravity | Multi-Workspace Cumulative Dashboard Suite

An enterprise-grade, multi-workspace web application designed for **Automated Data Upload, Data Cleaning, Quality Diagnostics, and Cumulative Workspace Dashboards**.

Allows teams to manage four independent, isolated data workspaces, each supporting persistent database storage, repeated spreadsheet uploads with automated deduplication and merge logs, **Share via Email**, and **Standalone HTML Exporting**.

![Multi Workspace](https://img.shields.io/badge/Workspaces-Auto%20Studio%20%7C%20Emails%20%7C%20ICP1%20%7C%20ICP2-4f8ef7?style=for-the-badge)
![Cumulative Database](https://img.shields.io/badge/Storage-Persistent%20Cumulative-green?style=for-the-badge)
![Vercel Ready](https://img.shields.io/badge/Deployment-Vercel-000000?style=for-the-badge&logo=vercel)

---

## 🌟 The 4 Workspaces

### 1. ⚡ **Auto Studio (`index.html`)**
- Primary upload & auto-dashboard generator studio.
- Supported formats: `.csv`, `.xls`, `.xlsx` (up to 25MB).
- 4-Step Interactive Pipeline: `Upload` → `Preview & Sheet Select` → `Clean & Validate` → `Auto Dashboard`.
- Data health meter, column profiling grid, and customizable cleaning rules.
- Added capabilities: **Share via Email** modal & **Standalone HTML Export**.

### 2. 📧 **Overall Emails Sent (`overall_emails.html`)**
- *Replaces and resets the old Master CRM workspace*.
- Starts in a clean zero-data initial state: *"No email data has been added yet..."*.
- Persistent cumulative database storage: When new CSV/XLS/XLSX files are uploaded, new valid records are merged with historical data while skipping duplicate entries.
- **Import Summary Toast**: Displays `Rows Received`, `Valid Rows`, `Skipped Rows`, `Duplicate Rows`, `Newly Added Rows`, and `Total Stored Rows`.
- Evolving Email Analytics Dashboard with Trendlines, Campaign Breakdown, Sender/Recipient metrics, and Searchable Data Explorer.

### 3. 🎯 **ICP 1 (`icp1.html`)**
- *Renamed from "ICP 1 Advocates" to simply **"ICP 1"*** (word "Advocates" removed everywhere across UI & exports).
- Independent persistent cumulative lead workspace.
- Supports repeated uploads, data deduplication, import history, and dynamic dashboard auto-refresh.

### 4. 🚀 **ICP 2 (`icp2.html`)**
- *Brand new independent workspace*.
- Initial zero-data empty state ready to accept CSV/Excel uploads.
- Strictly isolated persistent database storage for ICP 2 target segments.

---

## 🛠️ Common Capabilities Across All Workspaces

- 📥 **Spreadsheet Upload**: Multi-sheet Excel selector (`.xlsx`, `.xls`) & CSV parser.
- 🧼 **Transparent Cleaning & Deduplication**: Duplicate row detection and merge summaries.
- 📧 **Share via Email**: Modal popup supporting recipient emails, subject lines, message notes, and report attachments.
- 📄 **Export HTML**: Generates a self-contained, standalone downloadable `.html` report of the current workspace dashboard.
- 💾 **Cleaned Data Download**: Export processed datasets as `.csv` or `.xlsx`.
- 📜 **Import History Log**: Inspect previous file upload events and row counts.

---

## 📁 Repository Structure

```
DASHBOARD-CREATER/
├── index.html                 # ⚡ Auto Studio Workspace
├── overall_emails.html        # 📧 Overall Emails Sent Workspace
├── icp1.html                  # 🎯 ICP 1 Target Workspace
├── icp2.html                  # 🚀 ICP 2 Target Workspace
├── app-shared.js              # 🛠️ Multi-Workspace Persistent Engine & Shared UI Components
├── dashboard.html             # Legacy Master CRM reference
├── icp1_leads_dashboard.html  # Legacy ICP 1 reference
├── cleaned_data.json          # Pre-loaded sample CRM dataset
├── vercel.json                # Vercel route rewrites for all 4 workspaces
└── README.md                  # System documentation
```

---

## 🌐 Routes & Deployment (Vercel)

- `/` → **Auto Studio** (`index.html`)
- `/emails` → **Overall Emails Sent** (`overall_emails.html`)
- `/icp1` → **ICP 1** (`icp1.html`)
- `/icp2` → **ICP 2** (`icp2.html`)

Simply commit and push changes to GitHub, and Vercel will deploy the multi-workspace application instantly!
