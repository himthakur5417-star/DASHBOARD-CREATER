# 📊 CRM Contact Intelligence & ICP Leads Dashboard

An interactive, Power BI-style web dashboard suite designed for **HubSpot CRM Contact Analysis**, **ICP Lead Intelligence**, and **Outreach Analytics**. Built with modern glassmorphism aesthetics, real-time filtering, interactive data visualizations, and full mobile/desktop responsiveness.

![Dashboard Preview](https://img.shields.io/badge/Dashboard-Power%20BI%20Style-4f8ef7?style=for-the-badge&logo=powerbi)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
![Vercel Ready](https://img.shields.io/badge/Deployment-Vercel-000000?style=for-the-badge&logo=vercel)

---

## 🌟 Key Dashboards & Features

### 1. 📈 **Master CRM Contact Intelligence (`dashboard.html`)**
- **Contact Overview**: Deep analysis of **2,066+ contacts** cleaned and processed from HubSpot CRM export.
- **Visual Analytics**:
  - Lead Score Distribution & Segmentation (Hot, Warm, Cold)
  - Contact Verification & Enrichment Status
  - Industry & Job Title Categorization
  - Geographic Location Breakdown
- **Interactive Data Explorer**:
  - Live multi-field search (Name, Email, Phone, Company, Job Title)
  - Multi-select status and score filters
  - Client-side pagination and CSV export capability

### 2. 🎯 **ICP-1 Focused Leads Dashboard (`icp1_leads_dashboard.html`)**
- **Targeted Lead Segment**: Specialized view for Ideal Customer Profile 1 (Legal Advocates & High-intent prospects).
- **KPI Metrics**: Key decision-maker metrics, contactability rates, and outreach readiness indicators.
- **Leads Table**: Searchable and filterable table displaying enriched lead contacts with direct contact details.

---

## 📁 Repository Structure

```
DASHBOARD-CREATER/
├── dashboard.html             # Master CRM Contact Intelligence Dashboard
├── icp1_leads_dashboard.html  # ICP-1 Advocate & Legal Prospecting Dashboard
├── cleaned_data.json          # Cleaned & structured CRM contact dataset
├── combined_data.json         # Combined intelligence dataset (v1)
├── combined_data_v2.json      # Enhanced combined dataset with metadata (v2)
├── contacts_raw.csv           # Original raw HubSpot CRM contact export
└── README.md                  # Project documentation
```

---

## 🚀 How to Run Locally

Since the dashboards are built with pure **HTML5, Vanilla CSS, and JavaScript (ES6+)**, no build step or node_modules installation is required!

### Option A: Open Directly in Browser
Simply double-click `dashboard.html` or `icp1_leads_dashboard.html` to open it in any web browser.

### Option B: Local Web Server
If you prefer running via a local dev server:

**Using Python:**
```bash
python3 -m http.server 8000
```
Then open `http://localhost:8000/dashboard.html` in your browser.

**Using VS Code:**
- Install the **Live Server** extension.
- Right-click `dashboard.html` and click **"Open with Live Server"**.

---

## 🌐 How to Deploy Publicly (Vercel)

This repository is optimized for **1-click deployment** on Vercel:

1. Sign in to **[Vercel](https://vercel.com)** using your GitHub account.
2. Click **Add New... → Project**.
3. Select this repository: `himthakur5417-star/DASHBOARD-CREATER`.
4. Click **Deploy**.
5. Your live link (e.g., `https://dashboard-creater.vercel.app`) will be active in seconds!

> **Automatic Re-deployments**: Whenever you push code updates to the `main` branch, Vercel will automatically re-deploy your live website.

---

## 🛠️ Technology Stack

- **Frontend Core**: HTML5, ES6+ JavaScript
- **Styling**: Modern Vanilla CSS (Custom Design Tokens, Glassmorphism, CSS Grid & Flexbox)
- **Charts & Visualizations**: [Chart.js v4](https://www.chartjs.org/)
- **Typography**: Google Fonts (*Inter* & *Space Grotesk*)
- **Icons & Badges**: SVG & CSS Micro-animations

---

## 📄 License

This project is licensed under the MIT License — see the repository for details.
