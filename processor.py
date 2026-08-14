#!/usr/bin/env python3
"""
Infinito Python Data Processing, Profiling & Natural Language Dashboard Engine (processor.py)
----------------------------------------------------------------------------------------
Mandatory Pipeline:
FILE UPLOAD -> READ -> PROFILING -> CLEANING -> VALIDATION -> DEDUPLICATION -> COLUMN MATCHING -> CLEAN DATASET -> COMMAND PARSER -> DASHBOARD STATE
"""

import sys
import os
import json
import re

try:
    import pandas as pd
    import numpy as np
except ImportError as e:
    print(json.dumps({"error": f"Missing Python dependency: {e}"}))
    sys.exit(1)


def sanitize_text(val):
    if pd.isna(val) or val is None:
        return ""
    s = str(val).strip()
    s = re.sub(r'[\u200B-\u200D\uFEFF]', '', s)
    if s.lower() in ['null', 'undefined', 'n/a', 'na', 'nan', 'none', '-', '—']:
        return ""
    return s


def find_column_by_patterns(df_cols, patterns):
    for col in df_cols:
        cleaned = re.sub(r'[^a-z0-9]', '', str(col).lower())
        for p in patterns:
            if cleaned == p or p in cleaned:
                return col
    return None


def profile_and_clean_dataframe(df, file_name="Dataset", sheet_name="Sheet1"):
    original_rows = len(df)
    cols = list(df.columns)

    # 1. DATA PROFILING & QUALITY AUDIT
    missing_by_col = {}
    unique_by_col = {}
    dtype_by_col = {}

    for c in cols:
        s_col = df[c]
        null_count = sum(1 for v in s_col if pd.isna(v) or str(v).strip().lower() in ['', 'null', 'undefined', 'n/a', 'na', 'nan', 'none', '-', '—'])
        missing_by_col[str(c)] = null_count
        unique_by_col[str(c)] = s_col.nunique(dropna=True)
        dtype_by_col[str(c)] = str(s_col.dtype)

    total_missing_cells = sum(missing_by_col.values())
    total_cells = original_rows * len(cols) if original_rows and len(cols) else 1
    completeness_rate = round(((total_cells - total_missing_cells) / total_cells * 100), 1)

    # 2. DATA CLEANING & TEXT SANITIZATION
    df_clean = df.copy()
    for c in cols:
        df_clean[c] = df_clean[c].apply(sanitize_text)

    # 3. COLUMN DETECTION & MATCHING
    co_col = find_column_by_patterns(cols, ['companyname', 'company', 'associatedcompany', 'organization', 'firm', 'accountname', 'businessname'])
    fn_col = find_column_by_patterns(cols, ['firstname', 'first'])
    ln_col = find_column_by_patterns(cols, ['lastname', 'last'])
    name_col = find_column_by_patterns(cols, ['contactname', 'name', 'fullname', 'contact', 'leadname', 'foundername'])
    email_col = find_column_by_patterns(cols, ['email', 'workemail', 'contactemail', 'founderemail', 'emailaddress'])
    desig_col = find_column_by_patterns(cols, ['designation', 'title', 'role', 'contactowner', 'owner', 'jobtitle', 'position'])
    phone_col = find_column_by_patterns(cols, ['phonenumber', 'phone', 'contactnumber', 'mobile', 'tel', 'cell'])
    web_col = find_column_by_patterns(cols, ['website', 'domain', 'companywebsite', 'url'])
    loc_col = find_column_by_patterns(cols, ['location', 'address', 'city', 'state', 'country'])
    city_col = find_column_by_patterns(cols, ['city', 'town'])
    country_col = find_column_by_patterns(cols, ['country', 'nation'])
    status_col = find_column_by_patterns(cols, ['marketingcontactstatus', 'emailstatus', 'companystatus', 'emailtype', 'status'])
    icp_col = find_column_by_patterns(cols, ['icp', 'icpcategory', 'targeticp', 'segment', 'profile'])
    date_col = find_column_by_patterns(cols, ['createdate', 'date', 'timestamp', 'importdate'])

    mapped_rows = []
    invalid_email_count = 0
    incomplete_count = 0
    seen_hashes = set()
    duplicate_count = 0
    domain_counts = {}

    email_regex = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')

    for idx, row in df_clean.iterrows():
        # Company Name & Numeric ID Clean
        co_val = str(row[co_col]) if co_col and row[co_col] else ""
        email_val = str(row[email_col]) if email_col and row[email_col] else ""

        if not co_val or re.match(r'^\d+(\.\d+)?$', co_val):
            if "@" in email_val:
                dom = email_val.split("@")[1].strip()
                name_from_dom = dom.split(".")[0].strip()
                if len(name_from_dom) > 2:
                    co_val = name_from_dom.capitalize()

        fname = str(row[fn_col]) if fn_col and row[fn_col] else ""
        lname = str(row[ln_col]) if ln_col and row[ln_col] else ""
        full_name = " ".join(filter(None, [fname, lname])).strip()
        if not full_name and name_col and row[name_col]:
            full_name = str(row[name_col]).strip()

        desig_val = str(row[desig_col]) if desig_col and row[desig_col] else ""
        phone_val = str(row[phone_col]) if phone_col and row[phone_col] else ""
        web_val = str(row[web_col]) if web_col and row[web_col] else ""
        if not web_val and "@" in email_val:
            web_val = email_val.split("@")[1].strip()

        loc_val = str(row[loc_col]) if loc_col and row[loc_col] else ""
        city_val = str(row[city_col]) if city_col and row[city_col] else ""
        country_val = str(row[country_col]) if country_col and row[country_col] else ""
        if not loc_val:
            loc_val = ", ".join(filter(None, [city_val, country_val]))

        email_status = "Delivered"
        if status_col and row[status_col]:
            raw_s = str(row[status_col])
            email_status = "Delivered" if "marketing" in raw_s.lower() or "known" in raw_s.lower() or "delivered" in raw_s.lower() else raw_s

        if email_val:
            if not email_regex.match(email_val):
                invalid_email_count += 1
                email_status = "Invalid Format"
            else:
                dom = email_val.split("@")[1].lower().strip()
                domain_counts[dom] = domain_counts.get(dom, 0) + 1
        else:
            incomplete_count += 1

        icp_val = str(row[icp_col]) if icp_col and row[icp_col] else "Standard"
        date_val = str(row[date_col]) if date_col and row[date_col] else "2026-08-11"

        mapped_record = {
            "contactName": full_name or "—",
            "email": email_val or "—",
            "companyName": co_val or "—",
            "designation": desig_val or "—",
            "phone": phone_val or "—",
            "website": web_val or "—",
            "location": loc_val or "—",
            "emailStatus": email_status,
            "icp": icp_val,
            "createDate": date_val
        }

        # Preserve unmapped fields
        for c in cols:
            if c not in [co_col, fn_col, ln_col, name_col, email_col, desig_col, phone_col, web_col, loc_col, city_col, country_col, status_col, icp_col, date_col]:
                mapped_record[f"raw_{c}"] = str(row[c])

        # Deduplication Hash
        em_hash = email_val.lower().strip() if email_val and email_val != "—" else ""
        co_hash = co_val.lower().strip() if co_val and co_val != "—" else ""
        name_hash = full_name.lower().strip() if full_name and full_name != "—" else ""

        row_hash = f"em_{em_hash}" if em_hash else f"co_{co_hash}_{name_hash}"
        if row_hash in seen_hashes:
            duplicate_count += 1
            continue

        seen_hashes.add(row_hash)
        mapped_rows.append(mapped_record)

    total_clean = len(mapped_rows)
    valid_emails = sum(1 for r in mapped_rows if r["email"] != "—")
    unique_companies = len(set(r["companyName"] for r in mapped_rows if r["companyName"] != "—"))
    unique_contacts = len(set(r["contactName"] for r in mapped_rows if r["contactName"] != "—"))
    phones_found = sum(1 for r in mapped_rows if r["phone"] != "—")
    websites_found = sum(1 for r in mapped_rows if r["website"] != "—")

    delivered_count = sum(1 for r in mapped_rows if r["emailStatus"] == "Delivered")
    delivery_rate = round((delivered_count / valid_emails * 100), 1) if valid_emails > 0 else 100.0

    return {
        "profiling": {
            "fileName": file_name,
            "sheetName": sheet_name,
            "totalRowsIngested": original_rows,
            "totalMissingCells": total_missing_cells,
            "completenessRate": completeness_rate,
            "missingByColumn": missing_by_col,
            "uniqueByColumn": unique_by_col,
            "dtypeByColumn": dtype_by_col,
            "detectedHeadersCount": len(cols),
            "detectedHeaders": cols
        },
        "cleaningSummary": {
            "originalRecords": original_rows,
            "cleanRecords": total_clean,
            "duplicatesFound": duplicate_count,
            "duplicatesRemoved": duplicate_count,
            "invalidRecords": invalid_email_count,
            "missingValuesFixed": total_missing_cells,
            "completenessRate": completeness_rate,
            "validRecords": total_clean,
            "detectedColumns": cols,
            "mappedColumns": [k for k in ["contactName", "email", "companyName", "designation", "phone", "website", "location", "emailStatus", "createDate"] if any(r[k] != "—" for r in mapped_rows)]
        },
        "emailAnalytics": {
            "totalEmailsSent": valid_emails,
            "delivered": delivered_count,
            "deliveryRate": delivery_rate,
            "bounces": invalid_email_count,
            "bounceRate": round((invalid_email_count / (valid_emails or 1) * 100), 1),
            "uniqueDomainsCount": len(domain_counts),
            "topDomains": sorted([{"domain": k, "count": v} for k, v in domain_counts.items()], key=lambda x: x["count"], reverse=True)[:6]
        },
        "kpis": {
            "totalRecords": total_clean,
            "validEmails": valid_emails,
            "uniqueCompanies": unique_companies,
            "uniqueContacts": unique_contacts,
            "phonesFound": phones_found,
            "websitesFound": websites_found
        },
        "records": mapped_rows
    }


def parse_natural_language_command(command_text, current_state):
    """
    Parses natural language instructions to update the Dashboard State dynamically.
    """
    cmd = command_text.lower().strip()
    updated = json.loads(json.dumps(current_state)) if current_state else {
        "version": 1,
        "activePage": "executive",
        "charts": [
            {"id": "trend_chart", "type": "bar", "visible": True},
            {"id": "domain_chart", "type": "donut", "visible": True}
        ],
        "visibleColumns": ["contactName", "email", "companyName", "designation", "phone", "location", "emailStatus"],
        "filters": {}
    }

    action_taken = "No state change matched."

    # 1. Chart Type Modification
    if "line" in cmd:
        for c in updated.get("charts", []):
            if c["id"] == "trend_chart":
                c["type"] = "line"
        action_taken = "Changed Trend Chart type to Line Chart."
    elif "bar" in cmd:
        for c in updated.get("charts", []):
            if c["id"] == "trend_chart":
                c["type"] = "bar"
        action_taken = "Changed Trend Chart type to Bar Chart."

    # 2. Hide / Remove Charts
    if "remove donut" in cmd or "hide donut" in cmd or "remove domain chart" in cmd:
        for c in updated.get("charts", []):
            if c["id"] == "domain_chart":
                c["visible"] = False
        action_taken = "Removed Donut Domain Chart from dashboard layout."
    elif "show donut" in cmd or "add donut" in cmd:
        for c in updated.get("charts", []):
            if c["id"] == "domain_chart":
                c["visible"] = True
        action_taken = "Restored Donut Domain Chart to dashboard layout."

    # 3. Filtering Domain
    if "gmail" in cmd:
        updated.setdefault("filters", {})["domainFilter"] = "gmail.com"
        action_taken = "Filtered dashboard analytics to display Gmail contacts only."
    elif "clear filter" in cmd or "all domains" in cmd:
        updated.setdefault("filters", {})["domainFilter"] = "all"
        action_taken = "Cleared domain filters."

    # 4. Column Slicing
    if "remove location" in cmd or "hide location" in cmd:
        cols = updated.get("visibleColumns", [])
        if "location" in cols:
            cols.remove("location")
        updated["visibleColumns"] = cols
        action_taken = "Removed Location column from data table grid."
    elif "add location" in cmd or "show location" in cmd:
        cols = updated.get("visibleColumns", [])
        if "location" not in cols:
            cols.append("location")
        updated["visibleColumns"] = cols
        action_taken = "Added Location column to data table grid."

    # 5. Page Switching
    if "deliverability" in cmd or "quality" in cmd:
        updated["activePage"] = "deliverability"
        action_taken = "Switched view to Deliverability & Data Quality Audit page."
    elif "executive" in cmd or "overview" in cmd:
        updated["activePage"] = "executive"
        action_taken = "Switched view to Executive Overview page."
    elif "email" in cmd or "performance" in cmd:
        updated["activePage"] = "email_performance"
        action_taken = "Switched view to Email & Outreach Performance page."

    updated["version"] = updated.get("version", 1) + 1
    return {"updatedState": updated, "actionTaken": action_taken}


def process_file(file_path):
    if not os.path.exists(file_path):
        return {"error": f"File path does not exist: {file_path}"}

    ext = os.path.splitext(file_path)[1].lower()

    try:
        if ext == '.csv':
            df = pd.read_csv(file_path, encoding_errors='replace')
            return profile_and_clean_dataframe(df, file_name=os.path.basename(file_path))
        elif ext in ['.xlsx', '.xls']:
            excel = pd.ExcelFile(file_path)
            sheet = excel.sheet_names[0]
            df = pd.read_excel(file_path, sheet_name=sheet)
            return profile_and_clean_dataframe(df, file_name=os.path.basename(file_path), sheet_name=sheet)
        elif ext == '.json':
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            df = pd.DataFrame(data if isinstance(data, list) else [data])
            return profile_and_clean_dataframe(df, file_name=os.path.basename(file_path), sheet_name="JSON Data")
        elif ext == '.pdf':
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            text = "\n".join([p.extract_text() for p in reader.pages if p.extract_text()])
            lines = [l.strip() for l in text.splitlines() if l.strip()]
            df = pd.DataFrame([{"extractedLine": l} for l in lines])
            return profile_and_clean_dataframe(df, file_name=os.path.basename(file_path), sheet_name="PDF Extraction")
        else:
            return {"error": f"Unsupported extension: {ext}"}
    except Exception as err:
        return {"error": f"Processing error: {str(err)}"}


if __name__ == "__main__":
    if len(sys.argv) > 1:
        print(json.dumps(process_file(sys.argv[1]), indent=2))
    else:
        sample_path = "/Users/himanshuthakur/Documents/Advocate Finder/DASHBOARD CREATER/contacts_raw.csv"
        res = process_file(sample_path)
        print("Profiling Completeness:", res["profiling"]["completenessRate"], "%")
        print("Command Test:", parse_natural_language_command("change trend chart to line chart and filter gmail", None))
