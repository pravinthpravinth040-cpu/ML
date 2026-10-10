# TrustCred AI - Dataset Schema

All data is **synthetic** and reproducible: `python ml-training/generate_datasets.py` (seed 2026).
Snapshot time for statuses: `2026-10-10 12:00:00` IST. Timestamps are `YYYY-MM-DD HH:MM:SS` (IST). Currency is INR.

## Where each file lives

| File | Location | Rows | Used by |
|---|---|---|---|
| transactions.csv | ml-training/data | 240 | classifier input (200 labelled + 40 to predict) |
| transaction_labels.csv | ml-training/data | 200 | classifier training |
| vendor_monthly_financials.csv | ml-training/data | 200 | assessment features |
| loan_repayment_history.csv | ml-training/data | 200 | later stage only (synthetic) |
| vendor_profiles.csv | backend/database/seed | 50 | vendor app, assessment |
| lenders.csv | backend/database/seed | 5 | lender dashboard (not in original list; needed for lender_id) |
| loan_applications.csv | backend/database/seed | 200 | lender dashboard |
| consent_records.csv | backend/database/seed | 200 | consent service |
| evidence_documents.csv | backend/database/seed | 200 | vendor app, review |
| assessment_reports.csv | backend/database/seed | 200 | reports, verification |
| verification_and_activity_logs.csv | backend/database/seed | 200 | audit trail |

Keys: `demo-key-01_public.pem` (lenders verify with this) and `DEMO_ONLY_demo-key-01_private.pem` (demo signing only; never reuse in production).

## ML datasets

**transactions.csv** - `transaction_id, vendor_id, date, amount, direction (credit|debit), description, category, verification_status`
- `category` is filled only when `verification_status` is `vendor_confirmed`, `human_reviewed` or `source_verified`.
- `unverified` / `pending_review` rows have empty `category`: these 40 rows are the classifier's prediction target.

**transaction_labels.csv** - `transaction_id, description, amount, direction, verified_category, label_source`
- `verified_category`: business_receipt, business_expense, refund, personal_transfer, duplicate, unknown.
- `label_source`: `vendor_confirmed`, `human_review`, `reliable_metadata` (QR/soundbox settlement or exact-match duplicate).
- Duplicates share vendor, amount and description with an earlier row within 2 minutes: detect them with a row-level rule, text alone cannot.

**vendor_monthly_financials.csv** - `vendor_id, period_month, business_type, business_age_months, business_receipts, business_expenses, net_cashflow, cashflow_variability, existing_monthly_debt_payments, data_completeness, value_source`
- `value_source`: `verified_transactions` (completeness >= 0.75) or `estimated_from_partial_data`. Keep this distinction in reports.
- `cashflow_variability` = coefficient of variation of the 4 weekly receipt totals in that month.
- These rows are generated at vendor level; they are NOT an aggregate of the 240-row transaction sample. With real data, compute them from classified transactions.

**loan_repayment_history.csv** - `loan_id, vendor_id, loan_amount, monthly_obligation, repayment_due_date, actual_payment_date, days_past_due, default_status, data_origin`
- Repayment behaviour is random and unrelated to the other files. Do **not** train or claim repayment-risk prediction from it.

## Operational datasets

**vendor_profiles.csv** - `vendor_id, vendor_name, business_type, business_age_months, operating_location, registration_status (udyam_registered|local_vending_certificate|pending|none), available_alternative_evidence (semicolon list), onboarded_date`

**loan_applications.csv** - `application_id, vendor_id, requested_amount, loan_purpose, preferred_repayment_months, application_status (pending|under_review|more_documents_requested|approved|rejected), lender_id, submitted_time`
- Applications whose consent was revoked stay `pending`.

**consent_records.csv** - `consent_id, application_id, vendor_id, lender_id, allowed_data_scope, purpose, granted_time, expiry_time, revoked_time, consent_status (active|expired|revoked)`
- Scope values: `assessment_report`, `factor_explanations` (always), `monthly_summary`, `category_summary`, `evidence_document_review` (optional). Raw transactions are never a scope value.
- Enforcement rule: lender access is allowed only if `granted_time <= now < expiry_time` and `revoked_time` is empty or later than now.

**evidence_documents.csv** - `document_id, vendor_id, document_type, secure_storage_reference, content_hash, verification_status (verified|pending_review|needs_resubmission|rejected), uploaded_time, review_timestamp, lender_access`
- `lender_access` is always `restricted_consent_required`: files are served only under `evidence_document_review` consent.

**assessment_reports.csv** - `report_id, application_id, vendor_id, lender_id, consent_id, assessment_score (0-100), score_band, confidence, factor_explanations (JSON), limitations (JSON), model_version, report_hash, signature_reference, created_time, report_status (active|expired|withdrawn)`
- Scorecard (100 points): income_stability 25, repayment_capacity 30, business_continuity 15, expense_discipline 15, evidence_coverage 15. Each factor row carries value, points, max_points, impact and a plain-language explanation.
- Bands: strong_evidence >= 75, moderate_evidence >= 55, limited_evidence >= 35, insufficient_evidence below 35.
- `report_hash` = SHA-256 of the canonical JSON (sorted keys, no spaces) of: report_id, application_id, vendor_id, lender_id, consent_id, score, score_band, confidence, factors, limitations, model_version, created_at.
- `signature_reference` = `<key_id>:<base64 Ed25519 signature over the hex hash string>`. A lender recomputes the hash and checks the signature with the public key, with no call to TrustCred needed for integrity.

**verification_and_activity_logs.csv** - `log_id, timestamp, event_type, actor_type, actor_id, vendor_id, application_id, report_id, consent_id, outcome, details`
- Covers 33 applications (all revocation cases first), not every application.
- `report_verification_attempt` outcomes: `valid`, `valid_but_consent_withdrawn`, `valid_but_consent_expired`, `hash_mismatch`.
