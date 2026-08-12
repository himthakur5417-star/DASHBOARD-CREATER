# ♾️ Infinito | Multi-Workspace Cumulative Dashboard Suite

An enterprise-grade, multi-workspace web application designed for **Automated Data Upload, Data Cleaning, Quality Diagnostics, and Cumulative Workspace Dashboards**.

Allows teams to manage five independent, isolated data workspaces, each supporting persistent database storage, repeated spreadsheet uploads with automated deduplication and merge logs, **Share via Email**, and **Standalone HTML Exporting**.

![Multi Workspace](https://img.shields.io/badge/Workspaces-Auto%20Studio%20%7C%20Emails%20%7C%20ICP1%20%7C%20ICP2%20%7C%20ICP3-4f8ef7?style=for-the-badge)
![Cumulative Database](https://img.shields.io/badge/Storage-Persistent%20Cumulative-green?style=for-the-badge)
![Vercel Ready](https://img.shields.io/badge/Deployment-Vercel-000000?style=for-the-badge&logo=vercel)

---

## 🌟 The 5 Independent Workspaces

### 1. ⚡ **Auto Studio (`index.html`)**
- Primary upload & auto-dashboard generator studio.
- Supported formats: `.csv`, `.xls`, `.xlsx`.
- 4-Step Interactive Pipeline: `Upload` → `Preview & Sheet Select` → `Clean & Validate` → `Auto Dashboard`.

### 2. 📧 **Overall Emails Sent (`overall_emails.html`)**
- Starts in a clean zero-data initial state.
- Persistent cumulative database storage: Merges new valid records while skipping duplicates.
- Import Summary log, Chart.js 4 circular email metric donut charts, and Contact Intelligence table.

### 3. 🎯 **ICP 1 — Indian IT (`icp1.html`)**
- Target Profile: Indian IT Services & Product Companies (Tier 1 & Tier 2 Cities).
- Qualification Engine: Categorizes Tier 1 / Tier 2 city hubs, verifies tech team size, decision makers.
- Preserves non-qualifying entries marked for review. Allows manual status override.

### 4. 🚀 **ICP 2 — Indian Enterprise (`icp2.html`)**
- Target Profile: Indian Enterprises buying AI & Business Applications (Revenue ≥ ₹100 Crore or 250+ employees).
- Excludes pure IT Services companies (flagged for review instead of deleted).
- Preserves all records with clear qualification reason. Allows manual status override.

### 5. 🌐 **ICP 3 — US SME Business (`icp3.html`)**
- Target Profile: US Small & Medium Businesses located in California (CA), Texas (TX), New York (NY), New Jersey (NJ), Minnesota (MN) with 50+ headcount.
- Independent zero-data initial state, cumulative storage, 4 circular donut email charts, HTML export, and email sharing.
- Allows manual status override.

---

## 🛠️ Creator Credit
Created by **Himanshu Thakur** — Creator of Infinito.
- 🔗 [LinkedIn Profile](https://www.linkedin.com/in/-himanshu-thakur-)
- 📧 [Email Himanshu](mailto:himthakur5417@gmail.com)
