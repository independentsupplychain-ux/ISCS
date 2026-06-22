#!/usr/bin/env python3
"""
load-cbp-opportunities.py
Bulk-loads the most recent Apify DemandStar actor run into the
CBP Opportunities Notion database.

Requirements:
  export NOTION_API_KEY=secret_...
  python3 scripts/load-cbp-opportunities.py

Dependencies: Python 3 stdlib only (urllib, json, time).
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import date

# ── Config ─────────────────────────────────────────────────────────────────

NOTION_API_KEY   = os.environ.get('NOTION_API_KEY', '')
NOTION_DB_ID     = 'f7982cdf-54c9-4a71-aaff-d60df39875cd'
NOTION_VERSION   = '2022-06-28'

APIFY_TOKEN      = os.environ.get('APIFY_TOKEN', '')
APIFY_ACTOR_ID   = 'Tpb9aDIUsEehYwFau'

DELAY_BETWEEN_CREATES = 0.35   # seconds
LOG_EVERY              = 50    # records

TODAY = date.today().isoformat()   # e.g. "2026-06-12"

# ── Helpers ─────────────────────────────────────────────────────────────────

def notion_request(path, body=None, method='POST'):
    url  = f'https://api.notion.com/v1{path}'
    data = json.dumps(body).encode() if body is not None else None
    req  = urllib.request.Request(url, data=data, method=method)
    req.add_header('Authorization',  f'Bearer {NOTION_API_KEY}')
    req.add_header('Notion-Version', NOTION_VERSION)
    req.add_header('Content-Type',   'application/json')
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f'Notion {e.code} on {path}: {body}')


def apify_request(path):
    url = f'https://api.apify.com/v2{path}?token={APIFY_TOKEN}'
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


# ── Step 1: Fetch latest Apify run dataset ───────────────────────────────

def fetch_apify_records():
    print('Fetching latest Apify run...')
    runs = apify_request(f'/acts/{APIFY_ACTOR_ID}/runs')
    items = runs.get('data', {}).get('items', [])
    if not items:
        sys.exit('No runs found for actor.')

    # Most recent run first
    latest = sorted(items, key=lambda r: r.get('startedAt', ''), reverse=True)[0]
    run_id    = latest['id']
    status    = latest.get('status', '')
    dataset_id = latest.get('defaultDatasetId', '')

    print(f'  Run ID: {run_id}  Status: {status}')
    if status != 'SUCCEEDED':
        print(f'  WARNING: last run status is "{status}" — loading anyway.')

    # Fetch all dataset items (paginated, limit 1000 per page)
    records = []
    offset  = 0
    limit   = 1000
    while True:
        full = f'https://api.apify.com/v2/datasets/{dataset_id}/items?token={APIFY_TOKEN}&offset={offset}&limit={limit}'
        req  = urllib.request.Request(full)
        with urllib.request.urlopen(req) as resp:
            batch = json.loads(resp.read())
        # Response is a plain JSON array
        if isinstance(batch, dict):
            batch = batch.get('items', [])
        records.extend(batch)
        if len(batch) < limit:
            break
        offset += limit

    print(f'  {len(records)} records fetched from Apify dataset.')
    return records


# ── Step 2: Load all existing Opportunity IDs from Notion ───────────────

def fetch_existing_ids():
    print('Loading existing Opportunity IDs from Notion...')
    existing = set()
    cursor   = None

    while True:
        body = {
            'page_size': 100,
            'filter_properties': ['Opportunity ID'],   # only return this prop
        }
        if cursor:
            body['start_cursor'] = cursor

        data = notion_request(f'/databases/{NOTION_DB_ID}/query', body)
        for page in data.get('results', []):
            props  = page.get('properties', {})
            opp_id = props.get('Opportunity ID', {})
            val    = ''
            if opp_id.get('type') == 'rich_text':
                val = ''.join(t.get('plain_text', '') for t in opp_id.get('rich_text', []))
            if val:
                existing.add(val)

        if data.get('has_more'):
            cursor = data.get('next_cursor')
        else:
            break

    print(f'  {len(existing)} existing records in Notion.')
    return existing


# ── Step 3: Create Notion page ───────────────────────────────────────────

def build_page_properties(rec):
    props = {
        'Opportunity Title': {
            'title': [{'text': {'content': rec.get('opportunity_title') or 'Untitled'}}]
        },
        'Opportunity ID': {
            'rich_text': [{'text': {'content': str(rec.get('opportunity_id') or '')}}]
        },
        'Agency': {
            'rich_text': [{'text': {'content': rec.get('agency_name') or ''}}]
        },
        'Source': {
            'select': {'name': 'DemandStar'}
        },
        'Status': {
            'select': {'name': 'Open'}
        },
        'First Seen': {
            'date': {'start': TODAY}
        },
    }

    # Due Date — only set if present and non-empty
    due = rec.get('due_date')
    if due:
        # DemandStar dates sometimes arrive as "YYYY-MM-DD" or ISO strings
        # Truncate to date portion to be safe
        date_part = str(due)[:10]
        if len(date_part) == 10:
            props['Due Date'] = {'date': {'start': date_part}}

    # Estimated Value — only set if present and > 0
    est = rec.get('estimated_value')
    if est is not None and est != '' and float(est) > 0:
        props['Estimated Value'] = {'number': float(est)}

    # Portal Link
    link = rec.get('portal_link')
    if link:
        props['Portal Link'] = {'url': link}

    return props


def create_page(rec):
    body = {
        'parent': {'database_id': NOTION_DB_ID},
        'properties': build_page_properties(rec),
    }
    notion_request('/pages', body)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    if not NOTION_API_KEY:
        sys.exit(
            'ERROR: NOTION_API_KEY is not set.\n'
            'Run:  export NOTION_API_KEY=secret_...\n'
            'then re-run this script.'
        )

    records     = fetch_apify_records()
    existing_ids = fetch_existing_ids()

    to_create = [r for r in records if str(r.get('opportunity_id', '')) not in existing_ids]
    skipped   = len(records) - len(to_create)

    print(f'\nPlan: {len(to_create)} to create, {skipped} skipped (already exist).\n')

    if not to_create:
        print('Nothing to do — all records already in Notion.')
        return

    created = 0
    errors  = 0

    for i, rec in enumerate(to_create, 1):
        try:
            create_page(rec)
            created += 1
        except Exception as e:
            errors += 1
            opp_id = rec.get('opportunity_id', '?')
            print(f'  ERROR on record {i} (ID={opp_id}): {e}')

        if i % LOG_EVERY == 0 or i == len(to_create):
            pct = round(i / len(to_create) * 100)
            print(f'  Progress: {i}/{len(to_create)} ({pct}%)  created={created}  errors={errors}')

        time.sleep(DELAY_BETWEEN_CREATES)

    print(f'\nDone. Created: {created}  Skipped: {skipped}  Errors: {errors}')


if __name__ == '__main__':
    main()
