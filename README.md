# TrustCred AI — Cash-Flow Credit Assessment & Fraud Detection

TrustCred AI delivers a verified cash-flow assessment engine for micro-merchants and street vendors applying for micro-credit, utilizing **real transaction flow data** without relying on traditional credit bureau scores or fabricated repayment histories.

The pipeline identifies authentic merchant commerce and detects non-genuine turnover inflated by circular / reciprocal vendor transfers (round-tripping).

---

## 1. Project Overview

- **Input Dataset**:
  - `ml-training/data/vendors.csv`: 40 vendors with loan amounts requested (₹30,000 - ₹75,000).
  - `ml-training/data/transactions.csv`: 49,160 UPI-style transactions over 90 days (`2026-07-01` to `2026-09-28`).
- **Core Capabilities**:
  1. **Strict Data Validation**: Validates schema, types, nulls, duplicates, dates, and account prefixes (`C`, `SUP`, `V`).
  2. **Vendor-Level Feature Engineering**: Computes net cash flows, weekly coefficient of variation, customer diversity, repeat-customer share, top-customer concentration, inter-vendor transfers, and debt coverage.
  3. **Turnover Genuineness Pseudo-Labeling**: Rules-based detection of round-tripping and reciprocal transfers, validated via an unsupervised **Isolation Forest** (90% agreement).
  4. **Leakage-Free Train/Test Split**: 80/20 vendor-level split (32 train / 8 test vendors) ensuring no vendor overlap.
  5. **Supervised ML Classification**: Logistic Regression (baseline) and Random Forest with cross-validation on train and evaluation on the 20% test set.
  6. **100-Point Credit Scorecard**: Five explainable underwriting pillars producing plain-language decisions for lenders.

---

## 2. Refactored Repository Structure

```
c:\ML/
├── README.md                          # Main project guide (this file)
├── requirements.txt                   # Project dependencies
├── docs/
│   ├── dataset-schema.md              # Data dictionary, feature formulas & scorecard rules
│   ├── pseudo-label-rules.md          # Fraud rules, thresholds & Isolation Forest evaluation
│   └── dataset-audit.md               # Repository audit report
├── frontend/
│   ├── index.html                     # Responsive single-page web app
│   ├── README.md                      # Frontend documentation & usage guide
│   ├── css/
│   │   └── style.css                  # CSS design system (dark/light, responsive, print)
│   ├── js/
│   │   ├── app.js                     # Main application logic & state management
│   │   ├── charts.js                  # Chart.js visual analytics controllers
│   │   ├── score.js                   # 100-point transparent demo scorecard engine
│   │   └── data.js                    # Embedded fallback for file:// protocol
│   └── data/
│       ├── vendor_summary.json        # 40-vendor summary records
│       └── vendor_scores.csv          # Merged ML scorecard outputs
├── ml-training/
│   ├── train.py                       # Single-command training pipeline
│   ├── requirements.txt               # ML dependencies
│   ├── model.pkl                      # Serialized model artifact
│   ├── metrics.json                   # Cross-validation & test metrics
│   ├── vendor_scores.csv              # 100-point scorecard outputs for all 40 vendors
│   ├── train_vendors.csv              # 32 training vendor IDs
│   ├── test_vendors.csv               # 8 test vendor IDs
│   ├── charts/
│   │   ├── confusion_matrix.png       # Test confusion matrix (LR vs RF)
│   │   ├── feature_importance.png     # Random Forest feature importances
│   │   ├── score_distribution.png     # Scorecard distribution by score band
│   │   └── repayment_vs_cashflow.png  # EMI vs net cash flow scatter
│   └── data/
│       ├── vendors.csv                # 40 merchants
│       └── transactions.csv           # 49,160 transactions
└── backend/
    └── database/
        └── seed/
            ├── demo-key-01_public.pem # Ed25519 public key
            └── DEMO_ONLY_demo-key-01_private.pem
```

---

## 3. Quickstart & Execution

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Run ML Training Pipeline
Execute the complete pipeline with a single command from the repository root:
```bash
python ml-training/train.py
```

### Launch Interactive Frontend Web App
Launch via Python's HTTP server:
```bash
python -m http.server 8000
```
Open [http://localhost:8000/frontend/](http://localhost:8000/frontend/) in any browser, or directly double-click `frontend/index.html`.

The script will:
1. Validate dataset integrity.
2. Engineer 26 vendor-level financial and transfer metrics.
3. Generate pseudo-labels and run Isolation Forest anomaly checks.
4. Perform stratified train/test split (32 train / 8 test) and save split CSVs.
5. Train Logistic Regression and Random Forest models with CV on train and test evaluation.
6. Compute the 100-point scorecard and save `vendor_scores.csv`.
7. Output `model.pkl`, `metrics.json`, and all visual charts to `ml-training/charts/`.

---

## 4. 100-Point Scorecard Methodology

The scorecard evaluates five transparent pillars derived strictly from transaction data:

| Pillar | Max Points | Metric Focus | Rationale |
|---|---|---|---|
| **1. Income Stability** | 25 | `weekly_receipt_cv` + customer base | Rewards stable week-to-week revenue and broad customer base. |
| **2. Repayment Capacity** | 30 | `repayment_coverage` (DSCR against EMI) | Evaluates monthly net cash flow against illustrative EMI (flat 20% p.a., 12m). |
| **3. Expense Discipline** | 15 | `expense_to_receipt_ratio` | Measures operational cost discipline and operating margins. |
| **4. Business Continuity** | 15 | `active_days_ratio` | Measures consistency of daily transactions across the 90 days (replaces legacy business age). |
| **5. Evidence Coverage & Genuineness** | 15 | Transfer ring check | Verified commercial receipts (+15 pts); circular transfer manipulation (0 pts). |

### Underwriting Decision Bands
- **Strong ($\ge 75$ pts)**: Approved (31 vendors).
- **Moderate ($55 - 74$ pts)**: Conditional approval.
- **Limited ($35 - 54$ pts)**: High risk; collateral required.
- **Insufficient ($< 35$ pts)**: Rejected (9 vendors flagged for non-genuine turnover capped here).

---

## 5. Important Limitations & Disclosures

1. **Small Sample Size (40 Vendors)**:
   - With 40 vendors total, the 20% test partition contains only **8 vendors** (6 genuine, 2 non-genuine).
   - While both models achieve 100% test accuracy on this dataset due to distinct transfer signatures, metrics with small test sets exhibit high sensitivity (a single misclassification is a 12.5% swing in accuracy).
2. **Observation Period**:
   - The dataset spans 90 calendar days (July-September 2026), which provides high-resolution daily cash-flow velocity but does not capture multi-year seasonal cycles.
3. **No Loan Default History Used**:
   - The model makes no claims of predicting default probabilities, as no repayment history exists in the new dataset. It evaluates **cash-flow debt service coverage** and **turnover authenticity**.