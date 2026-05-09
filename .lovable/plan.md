This is a large upgrade touching nearly every part of the app. I'll break it into phases so you can review and approve before I start building. A few things up front:

- **Auto Sync (Git)**: This is handled by your existing `sync-lovable.js` watcher running on your machine. Lovable's editor cannot run background `git push` loops on its own — it already auto-syncs every saved change to your connected GitHub repo. I'll skip this module unless you want me to adjust the existing sync script.
- **Performance**: Real "page load under 2s" depends heavily on data volume. I'll add virtualization, pagination, caching (react-query), skeletons, and batched inserts — but I won't claim a hard SLA.

---

## Phase 1 — Purchase Book overhaul

- Replace auto month-detection with **12 month tabs (JAN–DEC)** plus a year selector.
- Upload button is **scoped to the active month**: rows from the file are forced into that month regardless of date column, OR validated to match (I'll ask you which — see Q1 below).
- **Duplicate prevention**: reject rows whose `invoice_no + supplier` already exist for that month.
- **Upload summary modal**: Total Purchases, Total VAT, Total Input Tax, # transactions.
- **Accountant-style table** with sticky header, monthly totals footer.
- **Export Excel** (xlsx) with company header, column auto-width, bold totals row, accounting number format.
- **Export PDF** (jsPDF + autotable) with company header/title, monthly totals, page numbers.
- **Print**: dedicated print stylesheet + print preview dialog (current month only, A4/Legal friendly).
- Batched inserts (chunks of 500) + background parsing via web worker for speed.

## Phase 2 — Journal Entries (new module)

- New page `/journal-entries` + nav entry.
- New table `journal_entries` (header) + `journal_entry_lines` (lines) with RLS.
- Form: Date, Journal No., Reference No., Remarks + dynamic line rows (Account Title, Description, Debit, Credit).
- **Validation**: total debit must equal total credit before save.
- Auto-post each line to `gl_entries` with `source_module='journal'`.
- Edit/delete cascades and reposts GL.
- List view with search/filter (date range, journal no, account).
- Export Excel, Export PDF (with "Prepared by / Approved by"), Print preview.

## Phase 3 — General Ledger fixes

- Rebuild GL view as **per-account ledger** with: Beginning Balance, Debit, Credit, Running Balance, Ending Balance.
- Group by month (collapsible sections) under each account, Jan→Dec for selected year.
- Pull postings from **all sources**: purchase_book, sales_book, cash_receipts, cdb, journal.
- **Idempotent posting**: clear `gl_entries` for `(source_module, source_ref)` before re-insert on re-upload — prevents duplicates.
- Recalculation engine triggered after every save (server-side via Postgres function for accuracy).
- Virtualized rows (react-window) + pagination for large data.

## Phase 4 — Trial Balance fixes

- Recompute from `gl_entries` aggregated by account.
- Show Debit / Credit columns; flag rows where account totals don't balance — and **highlight totals row in red if grand totals differ**.
- Auto-refresh on focus + after any GL-affecting save (react-query invalidation).

## Phase 5 — System performance pass

- Add `@tanstack/react-query` caching across modules (already a dep in shadcn template).
- Replace blocking spinners with `<Skeleton />` placeholders.
- Virtualize long ledger/journal tables.
- Move Excel parsing (`xlsx`) into a web worker so the UI stays responsive.
- Batch Supabase inserts in chunks of 500 instead of 100.

---

## Technical details

```text
DB changes:
  + journal_entries(id, entry_date, journal_no, reference_no, remarks, month_year, …)
  + journal_entry_lines(id, journal_id FK, account_code, account_name, description,
                        debit, credit, line_order)
  + unique index purchase_book_entries(month_year, supplier, invoice_no)
  + index gl_entries(source_module, source_ref) for idempotent re-posting
  + Postgres fn: repost_module_gl(source_module, month_year)
```

Files I'll touch / add:
- `src/components/abl/BookModule.tsx` — split Purchase variant into `PurchaseBookModule.tsx` with month tabs + summary.
- `src/lib/abl/parsers.ts` — accept forced `month_year`, dedupe by invoice.
- `src/lib/abl/exporters.ts` — already good; extend for Journal layout.
- `src/pages/JournalEntries.tsx` + `src/components/abl/JournalEntryForm.tsx`.
- `src/pages/GeneralLedger.tsx` — full rewrite with per-account view, react-window.
- `src/pages/TrialBalance.tsx` — recompute + red-flag unbalanced.
- `src/lib/abl/printStyles.css` + per-module Print buttons.
- `src/workers/xlsxParser.worker.ts`.

---

## Questions before I start

**Q1 — Purchase Book month tabs**: when a user clicks "MARCH" and uploads a file containing rows dated in February, should I:
  (a) **Force** all rows into March (ignore the date column for grouping), or
  (b) **Reject** rows that don't match March and show an error summary?

**Q2 — Year scope**: do month tabs need a **year selector** (so you can keep 2024, 2025, 2026 separately), or is the system single-year?

**Q3 — Scope confirmation**: Phases 1–5 is a lot. Want me to ship them **all in one big change**, or **phase by phase** (start with Purchase Book + Journal Entries, then GL/TB, then perf)?

**Q4 — Auto Sync**: Your `sync-lovable.js` already does this from your local machine. Do you want me to leave it alone, or are you asking for something else here?

Reply with answers and I'll start implementing.