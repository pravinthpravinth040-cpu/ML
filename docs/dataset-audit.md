# TRUSTCRED AI — Comprehensive Dataset & Repository Audit (Phase 0)

**Audit Snapshot Timestamp:** 2026-10-10 12:00:00 IST  
**Audit Executed:** 2026-10-10  
**Workspace Root:** `c:\ML`  
**Dataset Source of Truth:** `trustcred-ai-datasets.zip` (Extracted to project root)

---

## 1. Project Root & Application Structure

### 1.1 Directory Layout (`c:\ML`)
```
c:\ML/
├── README.md
├── trustcred-ai-datasets.zip
├── docs/
│   ├── dataset-schema.md
│   └── dataset-audit.md (Deliverable)
├── ml-training/
│   ├── generate_datasets.py
│   └── data/
│       ├── transactions.csv (240 rows)
│       ├── transaction_labels.csv (200 rows)
│       ├── vendor_monthly_financials.csv (200 rows)
│       └── loan_repayment_history.csv (200 rows)
└── backend/
    └── database/
        └── seed/
            ├── vendor_profiles.csv (50 rows)
            ├── lenders.csv (5 rows)
            ├── loan_applications.csv (200 rows)
            ├── consent_records.csv (200 rows)
            ├── evidence_documents.csv (200 rows)
            ├── assessment_reports.csv (200 rows)
            ├── verification_and_activity_logs.csv (200 rows)
            ├── demo-key-01_public.pem (Ed25519 public key)
            └── DEMO_ONLY_demo-key-01_private.pem (Demo private key)
```

### 1.2 Inspection of Adjacent Codebase (`C:\HACKFEST  2K26`)
An existing hackfest prototype was identified at `C:\HACKFEST  2K26`, consisting of:
- **FastAPI backend** (`backend/main.py`, `models.py`, `database.py`, `auth.py`, `engine/credit_engine.py`, `engine/transaction_analyzer.py`, `engine/report_generator.py`).
- **React + TypeScript frontend** (`frontend/src/` with `App.tsx`, `TransactionWorkbench.tsx`, `LenderConsole.tsx`, `ConsentManager.tsx`, `PublicReportVerifier.tsx`).
- **Key differences to reconcile**:
  - The older prototype used a heuristic regex keyword analyzer and a 300–850 credit bureau-style score with HMAC/Ed25519 hybrid signatures.
  - The authoritative master prompt and `docs/dataset-schema.md` specify:
    1. A deterministic 0–100 financial evidence scorecard across 5 explicit factors (Stability: 25, Repayment: 30, Continuity: 15, Discipline: 15, Coverage: 15).
    2. A scikit-learn ML pipeline with TF-IDF and categorical encoding for transaction classification into 5 classes (`business_receipt`, `business_expense`, `refund`, `personal_transfer`, `unknown`).
    3. A separate deterministic 2-minute duplicate detection engine (never relying purely on text classification).
    4. Canonical JSON serialization, SHA-256 hashing, and pure Ed25519 digital signatures with standalone offline verification.
    5. Vendor Mobile App (React Native) + Lender Web Dashboard (React + TypeScript).

---

## 2. Exhaustive Dataset Audit

Every CSV file in the repository was inspected for headers, row counts, data types, missing/null values, category distributions, value ranges, and date formats.

### 2.1 File Summary Table

| Dataset | Relative Path | Rows | Columns | Null/Empty Fields | Primary Key / Unique ID |
|---|---|---|---|---|---|
| **Transactions** | `ml-training/data/transactions.csv` | 240 | 8 | `category` (40), `verification_status` (0) | `transaction_id` (TXN00001–TXN00240) |
| **Transaction Labels** | `ml-training/data/transaction_labels.csv` | 200 | 6 | 0 | `transaction_id` (TXN00001–TXN00240 subset) |
| **Vendor Monthly Financials** | `ml-training/data/vendor_monthly_financials.csv` | 200 | 11 | 0 | (`vendor_id`, `period_month`) composite |
| **Loan Repayment History** | `ml-training/data/loan_repayment_history.csv` | 200 | 9 | `actual_payment_date` (16) | `loan_id` (LN0001–LN0200) |
| **Vendor Profiles** | `backend/database/seed/vendor_profiles.csv` | 50 | 8 | 0 | `vendor_id` (V001–V050) |
| **Lenders** | `backend/database/seed/lenders.csv` | 5 | 5 | 0 | `lender_id` (L001–L005) |
| **Loan Applications** | `backend/database/seed/loan_applications.csv` | 200 | 8 | 0 | `application_id` (APP0001–APP0200) |
| **Consent Records** | `backend/database/seed/consent_records.csv` | 200 | 10 | `revoked_time` (167) | `consent_id` (CON0001–CON0200) |
| **Evidence Documents** | `backend/database/seed/evidence_documents.csv` | 200 | 9 | `review_timestamp` (39) | `document_id` (DOC0001–DOC0200) |
| **Assessment Reports** | `backend/database/seed/assessment_reports.csv` | 200 | 15 | 0 | `report_id` (RPT0001–RPT0200) |
| **Verification & Activity Logs**| `backend/database/seed/verification_and_activity_logs.csv`| 200 | 11 | 0 | `log_id` (LOG0001–LOG0200) |

---

### 2.2 Deep Dive per Dataset

#### A. `transactions.csv` & `transaction_labels.csv`
- **Total Transactions:** 240.
- **Labelled Examples:** Exactly 200 transactions are joined to `transaction_labels.csv`.
- **Prediction Target Set:** Exactly 40 transactions have empty `category` and verification statuses:
  - `unverified`: 30
  - `pending_review`: 10
- **Integrity Check across Join:**
  - `mismatched_amount`: 0
  - `mismatched_direction`: 0
  - `mismatched_description`: 0
- **Verified Category Distribution (200 labelled rows):**
  - `business_receipt`: 87 (43.5%)
  - `business_expense`: 45 (22.5%)
  - `personal_transfer`: 27 (13.5%)
  - `unknown`: 19 (9.5%)
  - `duplicate`: 11 (5.5%)
  - `refund`: 11 (5.5%)
- **Label Sources:**
  - `vendor_confirmed`: 90
  - `human_review`: 84
  - `reliable_metadata`: 26
- **Duplicate Analysis:**
  - In `transaction_labels.csv`, 11 transactions are marked `duplicate`.
  - When scanning all 240 transactions using the schema rule (matching `vendor_id`, `amount`, and `description` within 120 seconds), exactly **14 duplicate pairs** exist.
  - The remaining 3 duplicate occurrences are in the unverified 40-record prediction set! This validates why text classifiers alone must not be tasked with duplicate detection: duplicate identification is a relational state requiring vendor context and timestamp sequencing.
- **Amounts:** Range from INR 24 to INR 14,850. No zero or negative amounts.
- **Directions:** Exactly two valid directions: `credit` (158) and `debit` (82).

#### B. `vendor_monthly_financials.csv`
- **Total Records:** 200 records (50 vendors × 4 months: `2026-06`, `2026-07`, `2026-08`, `2026-09`).
- **Metrics Range:**
  - `business_receipts`: INR 21,822 to INR 169,176.
  - `business_expenses`: INR 9,540 to INR 143,252.
  - `net_cashflow`: INR 4,874 to INR 41,749 (all strictly positive in demo set).
  - `cashflow_variability`: 0.052 to 0.449 (CV across weekly totals).
  - `data_completeness`: 0.31 to 1.00.
  - `value_source`: `verified_transactions` (137) vs `estimated_from_partial_data` (63).
- **Critical Ground Truth Note:** As specified in `docs/dataset-schema.md`, these 200 vendor-month records represent high-level demo inputs generated at the vendor level, NOT mathematical aggregates of the 240 sample transactions.

#### C. `loan_repayment_history.csv`
- **Total Records:** 200 records across loans `LN0001` to `LN0200`.
- **Loan Amounts:** INR 5,000 to INR 60,000.
- **Default Status (DPD >= 90):** 40 defaults (20.0%), 160 non-defaults.
- **Data Origin:** Flagged explicitly as `synthetic_demo_do_not_use_for_risk_claims`.
- **Constraint Compliance:** In accordance with prompt rules, this dataset will NOT be used to train or claim credit default prediction models.

#### D. Operational Seed Datasets (`vendor_profiles`, `lenders`, `loan_applications`, `consent_records`, `evidence_documents`, `assessment_reports`, `verification_and_activity_logs`)
- **Vendors (`vendor_profiles.csv`):** Exactly 50 vendors (`V001` to `V050`) across 10 business types (tea stall, vegetable cart, flower seller, tiffin stall, juice shop, tailoring, street snacks, fish vendor, kirana store, mobile accessories) and 10 Tamil Nadu cities.
  - Registration status: `none` (20), `local_vending_certificate` (15), `udyam_registered` (10), `pending` (5).
- **Lenders (`lenders.csv`):** 5 lenders (`L001` to `L005`) with trusted signing key ID `demo-key-01`.
- **Applications (`loan_applications.csv`):** 200 applications (`APP0001` to `APP0200`).
  - Statuses: `pending` (67), `under_review` (42), `approved` (37), `more_documents_requested` (36), `rejected` (18).
- **Consents (`consent_records.csv`):** 200 records (`CON0001` to `CON0200`).
  - Statuses: `active` (131), `expired` (36), `revoked` (33).
  - All 33 revoked consents correspond to applications whose status remains `pending`.
- **Evidence Documents (`evidence_documents.csv`):** 200 records across 6 document types (`bank_statement`, `supplier_bill`, `business_photo`, `utility_bill`, `vending_certificate`, `udyam_certificate`).
  - Verification status: `verified` (121), `pending_review` (39), `rejected` (22), `needs_resubmission` (18).
- **Assessment Reports (`assessment_reports.csv`):** 200 reports (`RPT0001` to `RPT0200`).
  - Scores: 0 to 100 (range in seed: 38 to 88).
  - Bands: `moderate_evidence` (105), `limited_evidence` (55), `strong_evidence` (40), `insufficient_evidence` (0).
  - Statuses: `active` (131), `expired` (36), `withdrawn` (33).
- **Verification Logs (`verification_and_activity_logs.csv`):** 200 audit entries covering 33 applications (prioritizing all revocation and tampering cases).
  - Verification outcomes: `success` (148), `denied` (22), `valid` (15), `valid_but_consent_withdrawn` (11), `hash_mismatch` (4).

---

## 3. Relational Integrity and Consistency Checks

| Relation / Check | Expected | Actual | Status |
|---|---|---|---|
| `transaction_labels` to `transactions` | 200 matching rows | 200 matching rows | **PASS** |
| Description / Amount / Direction Mismatch | 0 | 0 | **PASS** |
| Unlabelled transactions count | 40 | 40 (`unverified`: 30, `pending_review`: 10) | **PASS** |
| Vendor IDs consistency across all 7 referencing tables | 50 unique (`V001`–`V050`) | 50 unique (`V001`–`V050`) | **PASS** |
| Lender IDs consistency across applications, consents, reports | 5 unique (`L001`–`L005`) | 5 unique (`L001`–`L005`) | **PASS** |
| 1-to-1 Correspondence: Applications ↔ Consents ↔ Reports | 200 : 200 : 200 | 200 : 200 : 200 | **PASS** |
| Consent Revocation ↔ Application Status | Revoked consents have `pending` app status | 33 of 33 match `pending` | **PASS** |
| Consent Expiry/Revocation ↔ Report Status | `active` / `expired` / `withdrawn` | Exactly aligns with consent state | **PASS** |
| Date Parsing Check across all 11 tables | ISO-8601 / `YYYY-MM-DD HH:MM:SS` | 100% parseable without errors | **PASS** |

---

## 4. Cryptographic Integrity Audit

1. **Key Files Present:**
   - `backend/database/seed/demo-key-01_public.pem` (Ed25519 SubjectPublicKeyInfo)
   - `backend/database/seed/DEMO_ONLY_demo-key-01_private.pem` (PKCS#8 Private Key)
2. **Canonical JSON Serialization Verification:**
   - Canonical representation reconstructed according to `generate_datasets.py`: sorted keys, compact separators `(",", ":")`, UTF-8 encoded.
   - SHA-256 digest computed for all 200 assessment report records.
   - **Result:** **200 out of 200 report hashes match `report_hash` perfectly.**
3. **Ed25519 Digital Signature Verification:**
   - Signatures extracted from `signature_reference` (`demo-key-01:<base64_sig>`).
   - Verified using `demo-key-01_public.pem`.
   - **Result:** **200 out of 200 digital signatures are cryptographically valid.**

---

## 5. Security & Credential Audit

> [!WARNING]
> **Demo Cryptographic Keys Detected**:
> - `backend/database/seed/DEMO_ONLY_demo-key-01_private.pem` is a demo private key.
> - **Policy Enforcement**:
>   1. This key must never be used in production or checked into production secret managers.
>   2. Private keys must remain strictly on the trusted backend server; they must NEVER be exposed to mobile or browser client bundles.
>   3. Independent report verification must require only the signed canonical report JSON and `demo-key-01_public.pem`.

---

## 6. Proposed Implementation Plan (Phase by Phase)

Following Phase 0 approval, development will proceed strictly according to the phased roadmap:

1. **Phase 1: Dataset Preparation and Validation Pipeline**
   - Reproducible data-validation module (`ml-training/validate.py` or `backend/data_validation/`).
   - Relational joining of transaction metadata with labels.
   - Separate deterministic duplicate-detection rule (2-minute window, same vendor, amount, description).
   - Data-quality report output; tests verifying target leakage prevention (excluding `category`, `verified_category`, `verification_status` from inputs).
2. **Phase 2: Train Transaction Classification Model**
   - Scikit-learn Pipeline with TF-IDF description vectorizer, one-hot direction encoder, and amount scaler.
   - Train baseline vs Logistic Regression / SGDClassifier on the 5 target categories (receipt, expense, personal transfer, refund, unknown).
   - Abstention / manual-review thresholding for low-confidence classifications.
   - Save trained pipeline to `backend/ml/transaction_model.joblib`.
3. **Phase 3: Financial Feature Engineering & Assessment Service**
   - Deterministic 100-point scorecard (Income stability: 25, Repayment capacity: 30, Business continuity: 15, Expense discipline: 15, Evidence coverage: 15).
   - Plain-language factor explanations and evidence coverage computation.
4. **Phase 4: Backend & Database Integration (FastAPI)**
   - API endpoints for vendor profile, transaction upload & classification, assessment creation, consent lifecycle, and lender application review.
   - Strict RBAC, session-based identity derivation, and database seeding from the audited CSVs.
5. **Phase 5: Privacy-Preserving Report & Cryptographic Verification**
   - Canonical JSON serializer, SHA-256 report hasher, Ed25519 signing service.
   - Standalone offline verification routine for lenders (no raw transactions exposed).
6. **Phase 6: Vendor Mobile App (React Native)**
   - Vendor onboarding, transaction upload, consent granting & revocation, assessment report view.
7. **Phase 7: Lender Web Dashboard (React + TypeScript)**
   - Lender application pipeline, authorized summary view, independent cryptographic verifier, decision workbench.
8. **Phase 8: WebSocket Real-Time Updates**
   - Authenticated WebSocket events (`assessment_completed`, `application_status_changed`, `consent_revoked`).
9. **Phase 9: End-to-End Testing & Demo Readiness**
   - Full automated E2E test suite, tampering detection tests, demo guides, and final documentation.

---

## 7. Phase 0 Deliverable Sign-off

- [x] Actual project root identified (`c:\ML`) and adjacent prototype analyzed (`C:\HACKFEST  2K26`).
- [x] All 11 CSV datasets audited (2,295 total records inspected).
- [x] Schema comparisons completed against `docs/dataset-schema.md`.
- [x] Relational integrity verified (0 orphan records, 0 mismatches).
- [x] 200/200 SHA-256 hashes and Ed25519 signatures verified.
- [x] Demo private keys identified and isolated.
- [x] Audit report documented in `docs/dataset-audit.md`.
