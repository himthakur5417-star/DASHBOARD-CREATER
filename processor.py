#!/usr/bin/env python3
"""
Infinito Python Data Processing Engine (processor.py)
-----------------------------------------------------
Handles CSV, Excel (XLSX/XLS), JSON, and PDF files via Pandas/NumPy.
Pipeline: Read -> Clean -> Validate -> Column Detect -> Column Map -> Deduplicate -> Clean Dataset JSON
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
    # Remove zero-width & non-printable chars
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


def map_and_clean_dataframe(df, file_name="Dataset", sheet_name="Sheet1"):
    original_rows = len(df)
    cols = list(df.columns)

    # 1. Text Sanitization across all cells
    df_clean = df.copy()
    for c in cols:
        df_clean[c] = df_clean[c].apply(sanitize_text)

    # 2. Dynamic Header Matching
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

    email_regex = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')

    for idx, row in df_clean.iterrows():
        # Company Name
        co_val = str(row[co_col]) if co_col and row[co_col] else ""
        email_val = str(row[email_col]) if email_col and row[email_col] else ""

        # Clean numeric company IDs (e.g. 338990914269.0) by inferring company from domain
        if not co_val or re.match(r'^\d+(\.\d+)?$', co_val):
            if "@" in email_val:
                dom = email_val.split("@")[1].strip()
                name_from_dom = dom.split(".")[0].strip()
                if len(name_from_dom) > 2:
                    co_val = name_from_dom.capitalize()

        # Contact Name
        fname = str(row[fn_col]) if fn_col and row[fn_col] else ""
        lname = str(row[ln_col]) if ln_col and row[ln_col] else ""
        full_name = " ".join(filter(None, [fname, lname])).strip()
        if not full_name and name_col and row[name_col]:
            full_name = str(row[name_col]).strip()

        # Designation
        desig_val = str(row[desig_col]) if desig_col and row[desig_col] else ""

        # Phone
        phone_val = str(row[phone_col]) if phone_col and row[phone_col] else ""

        # Website
        web_val = str(row[web_col]) if web_col and row[web_col] else ""
        if not web_val and "@" in email_val:
            web_val = email_val.split("@")[1].strip()

        # Location
        loc_val = str(row[loc_col]) if loc_col and row[loc_col] else ""
        city_val = str(row[city_col]) if city_col and row[city_col] else ""
        country_val = str(row[country_col]) if country_col and row[country_col] else ""
        if not loc_val:
            loc_val = ", ".join(filter(None, [city_val, country_val]))

        # Email Status & Validation
        email_status = "Delivered"
        if status_col and row[status_col]:
            raw_s = str(row[status_col])
            email_status = "Delivered" if "marketing" in raw_s.lower() or "known" in raw_s.lower() or "delivered" in raw_s.lower() else raw_s

        if email_val:
            if not email_regex.match(email_val):
                invalid_email_count += 1
                email_status = "Invalid Format"
        else:
            incomplete_count += 1

        # ICP Category
        icp_val = str(row[icp_col]) if icp_col and row[icp_col] else "Standard"

        # Date
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

        # Preserve unmapped columns
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

    # KPI Summaries
    total_clean = len(mapped_rows)
    valid_emails = sum(1 for r in mapped_rows if r["email"] != "—")
    unique_companies = len(set(r["companyName"] for r in mapped_rows if r["companyName"] != "—"))
    unique_contacts = len(set(r["contactName"] for r in mapped_rows if r["contactName"] != "—"))
    phones_found = sum(1 for r in mapped_rows if r["phone"] != "—")
    websites_found = sum(1 for r in mapped_rows if r["website"] != "—")

    # Detect distinct ICP categories
    icp_counts = {}
    for r in mapped_rows:
        val = r.get("icp", "Standard")
        icp_counts[val] = icp_counts.get(val, 0) + 1

    return {
        "summary": {
            "fileName": file_name,
            "sheetName": sheet_name,
            "originalRows": original_rows,
            "validRows": total_clean,
            "duplicateRows": duplicate_count,
            "invalidEmails": invalid_email_count,
            "incompleteRecords": incomplete_count,
            "detectedColumnsCount": len(cols),
            "detectedColumns": cols,
            "mappedColumns": [k for k in ["contactName", "email", "companyName", "designation", "phone", "website", "location", "emailStatus", "createDate"] if any(r[k] != "—" for r in mapped_rows)]
        },
        "kpis": {
            "totalRecords": total_clean,
            "validEmails": valid_emails,
            "uniqueCompanies": unique_companies,
            "uniqueContacts": unique_contacts,
            "phonesFound": phones_found,
            "websitesFound": websites_found
        },
        "icpCounts": icp_counts,
        "records": mapped_rows
    }


def process_file(file_path):
    if not os.path.exists(file_path):
        return {"error": f"File path does not exist: {file_path}"}

    ext = os.path.splitext(file_path)[1].lower()

    try:
        if ext == '.csv':
            df = pd.read_csv(file_path, encoding_errors='replace')
            return map_and_clean_dataframe(df, file_name=os.path.basename(file_path))
        elif ext in ['.xlsx', '.xls']:
            excel = pd.ExcelFile(file_path)
            sheet = excel.sheet_names[0]
            df = pd.read_excel(file_path, sheet_name=sheet)
            return map_and_clean_dataframe(df, file_name=os.path.basename(file_path), sheet_name=sheet)
        elif ext == '.json':
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, list):
                df = pd.DataFrame(data)
            elif isinstance(data, dict):
                first_arr = next((v for v in data.values() if isinstance(v, list)), None)
                df = pd.DataFrame(first_arr if first_arr else [data])
            else:
                return {"error": "JSON format not supported"}
            return map_and_clean_dataframe(df, file_name=os.path.basename(file_path), sheet_name="JSON Data")
        elif ext == '.pdf':
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            full_text = ""
            for page in reader.pages:
                full_text += page.extract_text() + "\n"
            lines = [l.strip() for l in full_text.splitlines() if l.strip()]
            records = [{"extractedLine": l} for l in lines]
            df = pd.DataFrame(records)
            return map_and_clean_dataframe(df, file_name=os.path.basename(file_path), sheet_name="PDF Extraction")
        else:
            return {"error": f"Unsupported file extension: {ext}"}
    except Exception as err:
        return {"error": f"Failed to process file: {str(err)}"}


if __name__ == "__main__":
    if len(sys.argv) > 1:
        target_path = sys.argv[1]
        res = process_file(target_path)
        print(json.dumps(res, indent=2))
    else:
        # Default test run on contacts_raw.csv
        sample_path = "/Users/himanshuthakur/Documents/Advocate Finder/DASHBOARD CREATER/contacts_raw.csv"
        res = process_file(sample_path)
        print(json.dumps(res["summary"], indent=2))
        print("KPIs:", res["kpis"])
