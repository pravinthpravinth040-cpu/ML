# TRUSTCRED AI — Comprehensive Dataset & Repository Audit (Refactored)

**Audit Execution Timestamp:** 2026-10-11 03:24:00 IST  
**Workspace Root:** `c:\ML`  
**Data Source of Truth:** `ml-training/data/vendors.csv` & `ml-training/data/transactions.csv`  

---

## 1. Project Root & Refactored Structure

```
c:\ML/
├── README.md                          # Top-level overview, usage guide & methodology
├── requirements.txt                   # Production Python dependencies
├── docs/
│   ├── dataset-schema.md              # Data dictionary, account prefix semantics, scorecard logic
│   ├── pseudo-label-rules.md          # Rule formulation, thresholds, Isolation Forest audit
│   └── dataset-audit.md               # Repository status & audit verification
├── ml-training/
│   ├── train.py                       # Single-command end-to-end ML pipeline
│   ├── requirements.txt               # ML-specific requirements
│   ├── model.pkl                      # Serialized model artifact bundle
│   ├── metrics.json                   # Comprehensive cross-validation & test metrics
│   ├── vendor_scores.csv              # 100-point scorecard outputs for all 40 vendors
│   ├── train_vendors.csv              # 32 training vendor IDs (leakage-free split)
│   ├── test_vendors.csv               # 8 test vendor IDs (stratified 20% test partition)
│   ├── charts/
│   │   ├── confusion_matrix.png       # Test set confusion matrices (LR vs RF)
│   │   ├── feature_importance.png     # Top Gini feature importances
│   │   ├── score_distribution.png     # Distribution of credit scores by decision band
│   │   └── repayment_vs_cashflow.png  # Debt service vs net operating cash flow scatter
│   └── data/
│       ├── vendors.csv                # 40 merchants with loan amounts requested
│       └── transactions.csv           # 49,160 verified UPI-style transactions (90 days)
└── backend/
    └── database/
        └── seed/
            ├── demo-key-01_public.pem # Ed25519 verification public key
            └── DEMO_ONLY_demo-key-01_private.pem
```

---

## 2. Integrity Verification

1. **Synthetic Legacy Data Removal**:
   - `ml-training/generate_datasets.py` permanently deleted.
   - Old synthetic files (`loan_repayment_history.csv`, `transaction_labels.csv`, `vendor_monthly_financials.csv`, legacy `transactions.csv`) removed.
   - All legacy seed CSVs from `backend/database/seed/` removed.
   - `trustcred-ai-datasets.zip` archive removed.
2. **Data Cleanliness**:
   - 0 null values across all transaction records.
   - 0 duplicate transaction IDs.
   - 0 non-positive transaction amounts.
   - Date span: exactly 90 calendar days (`2026-07-01` to `2026-09-28`).
   - Account prefixes strictly conform to `C#####`, `SUP###`, and `V###`.
3. **Model Partition Integrity**:
   - 80% train / 20% test partition executed strictly by **vendor ID** (32 train / 8 test).
   - Zero vendor overlap between train and test splits (guaranteed zero data leakage).
   - StandardScalers fitted strictly on the train partition.

---

## 3. Key Findings & Model Performance Summary

- **Transfer Ring Detection**: 9 merchants engaged in circular / reciprocal transfers (`V007, V008, V009, V021, V022, V033, V034, V035, V036`).
- **Isolation Forest Agreement**: 90.0% agreement with rule-based pseudo-labels.
- **Test Performance (20% Test Set, 8 Vendors)**:
  - Logistic Regression Baseline: Accuracy = 1.000, F1 = 1.000, ROC-AUC = 1.000
  - Random Forest Classifier: Accuracy = 1.000, F1 = 1.000, ROC-AUC = 1.000
  - Top Predictors: `transfer_share_of_receipts`, `transfer_out_volume`, `transfer_volume`, `transfer_in_volume`, `reciprocal_transfer_share`, `receipts_per_cust`.
- **Underwriting Outcomes**:
  - 31 genuine vendors approved in the `strong` band ($\ge 75$ points).
  - 9 non-genuine vendors capped into the `insufficient` band ($< 35$ points) and rejected with clear audit notes.
