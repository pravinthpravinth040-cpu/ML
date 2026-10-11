"""
TrustCred AI - ML Training & Cash-Flow Risk Assessment Pipeline
================================================================
Refactored pipeline using exclusively real transaction flow data:
- vendors.csv (40 vendors with loan amounts requested)
- transactions.csv (49,160 UPI-style transactions over 90 days)

Pipeline stages:
1. Load & Validate (types, nulls, duplicates, account prefixes, date ranges)
2. Vendor-Level Feature Engineering (cash flow, stability, customer diversity, circular transfers, repayment coverage)
3. Pseudo-Labeling (rule-based genuineness) + Unsupervised Cross-Check (Isolation Forest)
4. Leakage-Free Train/Test Split (80/20 vendor-level split, fitted scalers on train only)
5. Model Training & Evaluation (Logistic Regression baseline + Random Forest, CV on train, test evaluation)
6. 100-Point Scorecard (income stability, repayment capacity, expense discipline, continuity, genuineness)
7. Artifact Generation (model.pkl, metrics.json, vendor_scores.csv, charts)
"""

import os
import sys
import json
import logging
from pathlib import Path
import numpy as np
import pandas as pd
import joblib

# Headless plotting setup
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import scipy
import scipy._lib
import seaborn as sns

from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, IsolationForest
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix, classification_report
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("TrustCred-ML")


def get_base_dirs():
    """Resolve repository and data directory paths regardless of execution location."""
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent if script_dir.name == "ml-training" else script_dir

    data_dir = script_dir / "data" if (script_dir / "data").exists() else repo_root / "ml-training" / "data"
    charts_dir = script_dir / "charts"
    charts_dir.mkdir(parents=True, exist_ok=True)

    return repo_root, script_dir, data_dir, charts_dir


# =====================================================================
# 1. DATA LOADING & VALIDATION
# =====================================================================
def load_and_validate_data(data_dir: Path):
    """
    Load vendors.csv and transactions.csv.
    Strictly validate types, nulls, duplicate keys, account prefixes, dates, and amounts.
    """
    logger.info("=== STEP 1: LOADING & VALIDATING DATA ===")
    vendors_path = data_dir / "vendors.csv"
    txns_path = data_dir / "transactions.csv"

    if not vendors_path.exists():
        raise FileNotFoundError(f"Missing vendors file: {vendors_path}")
    if not txns_path.exists():
        raise FileNotFoundError(f"Missing transactions file: {txns_path}")

    vendors_df = pd.read_csv(vendors_path)
    txns_df = pd.read_csv(txns_path)

    validation_report = {
        "vendors_count": len(vendors_df),
        "transactions_count": len(txns_df),
        "errors": [],
        "warnings": []
    }

    # Validate vendors
    req_vendor_cols = {"vendor_id", "loan_amount_requested"}
    if not req_vendor_cols.issubset(vendors_df.columns):
        raise ValueError(f"vendors.csv must contain {req_vendor_cols}")

    if vendors_df["vendor_id"].isnull().any():
        raise ValueError("vendors.csv contains null vendor_id")
    if vendors_df["vendor_id"].duplicated().any():
        raise ValueError("vendors.csv contains duplicate vendor_id")
    if (vendors_df["loan_amount_requested"] <= 0).any():
        raise ValueError("vendors.csv contains non-positive loan amounts")

    # Validate transactions
    req_txn_cols = {"txn_id", "date", "from_account", "to_account", "amount", "type"}
    if not req_txn_cols.issubset(txns_df.columns):
        raise ValueError(f"transactions.csv must contain {req_txn_cols}")

    # Null check
    null_counts = txns_df[list(req_txn_cols)].isnull().sum().to_dict()
    validation_report["txn_null_counts"] = null_counts
    if any(count > 0 for count in null_counts.values()):
        raise ValueError(f"transactions.csv contains nulls: {null_counts}")

    # Duplicate txn_id check
    dup_txns = txns_df["txn_id"].duplicated().sum()
    validation_report["duplicate_txn_ids"] = int(dup_txns)
    if dup_txns > 0:
        raise ValueError(f"transactions.csv contains {dup_txns} duplicate txn_id entries")

    # Non-positive amount check
    invalid_amounts = (txns_df["amount"] <= 0).sum()
    validation_report["non_positive_amounts"] = int(invalid_amounts)
    if invalid_amounts > 0:
        raise ValueError(f"transactions.csv contains {invalid_amounts} non-positive amounts")

    # Date parse and range check
    txns_df["date_dt"] = pd.to_datetime(txns_df["date"], errors="coerce")
    if txns_df["date_dt"].isnull().any():
        raise ValueError("transactions.csv contains unparseable dates")

    min_date = txns_df["date"].min()
    max_date = txns_df["date"].max()
    date_days = (txns_df["date_dt"].max() - txns_df["date_dt"].min()).days + 1
    validation_report["date_range"] = f"{min_date} to {max_date} ({date_days} calendar days)"

    # Account prefix validation
    # C##### (Customer), SUP### (Supplier), V### (Vendor)
    valid_from_prefixes = ("C", "SUP", "V")
    valid_to_prefixes = ("C", "SUP", "V")
    invalid_from = txns_df[~txns_df["from_account"].str.startswith(valid_from_prefixes)]
    invalid_to = txns_df[~txns_df["to_account"].str.startswith(valid_to_prefixes)]
    if len(invalid_from) > 0:
        raise ValueError(f"Found unknown account prefix in from_account: {len(invalid_from)} rows")
    if len(invalid_to) > 0:
        raise ValueError(f"Found unknown account prefix in to_account: {len(invalid_to)} rows")

    # Type semantics validation
    type_counts = txns_df["type"].value_counts().to_dict()
    validation_report["transaction_type_counts"] = type_counts

    # Check from->to alignment per type
    cust_mask = txns_df["type"] == "customer_payment"
    exp_mask = txns_df["type"] == "expense"
    trans_mask = txns_df["type"] == "transfer"

    cust_valid = (txns_df.loc[cust_mask, "from_account"].str.startswith("C") &
                  txns_df.loc[cust_mask, "to_account"].str.startswith("V")).all()
    exp_valid = (txns_df.loc[exp_mask, "from_account"].str.startswith("V") &
                 txns_df.loc[exp_mask, "to_account"].str.startswith("SUP")).all()
    trans_valid = (txns_df.loc[trans_mask, "from_account"].str.startswith("V") &
                   txns_df.loc[trans_mask, "to_account"].str.startswith("V")).all()

    if not cust_valid:
        raise ValueError("Invalid account prefixes in customer_payment: must be C -> V")
    if not exp_valid:
        raise ValueError("Invalid account prefixes in expense: must be V -> SUP")
    if not trans_valid:
        raise ValueError("Invalid account prefixes in transfer: must be V -> V")

    logger.info(f"Loaded {len(vendors_df)} vendors and {len(txns_df)} transactions.")
    logger.info(f"Dates: {min_date} to {max_date}. Types: {type_counts}")
    logger.info("Validation passed successfully: 0 nulls, 0 duplicate keys, 0 invalid prefixes.")

    return vendors_df, txns_df, validation_report


# =====================================================================
# 2. VENDOR-LEVEL FEATURE ENGINEERING
# =====================================================================
def engineer_vendor_features(vendors_df: pd.DataFrame, txns_df: pd.DataFrame) -> pd.DataFrame:
    """
    Construct comprehensive vendor-level financial & transaction authenticity features:
    - Monthly receipts, expenses, net cash flow
    - Weekly receipts coefficient of variation (CV)
    - Customer diversity: unique customers, repeat customer share, top customer concentration
    - Transfer analysis: in/out volume, transfer share of receipts, reciprocal transfer share
    - Repayment coverage against illustrative EMI (flat 20% p.a., 12 months)
    """
    logger.info("=== STEP 2: FEATURE ENGINEERING ===")

    # Split transactions by type
    cust_df = txns_df[txns_df["type"] == "customer_payment"].copy()
    exp_df = txns_df[txns_df["type"] == "expense"].copy()
    trans_df = txns_df[txns_df["type"] == "transfer"].copy()

    # Pre-calculate reciprocal transfer pairs
    transfer_directed_pairs = set(zip(trans_df["from_account"], trans_df["to_account"]))
    reciprocal_txns = trans_df[trans_df.apply(
        lambda r: (r["to_account"], r["from_account"]) in transfer_directed_pairs, axis=1
    )]

    # Weekly grouping for CV
    cust_df["date_dt"] = pd.to_datetime(cust_df["date"])
    cust_df["week"] = cust_df["date_dt"].dt.isocalendar().week

    # Aggregate customer payments per vendor (to_account)
    cust_vendor_agg = cust_df.groupby("to_account").agg(
        total_receipts=("amount", "sum"),
        receipt_txns=("amount", "count"),
        unique_customers=("from_account", "nunique")
    )

    # Weekly receipt CV per vendor
    weekly_totals = cust_df.groupby(["to_account", "week"])["amount"].sum()
    weekly_cv = weekly_totals.groupby("to_account").agg(
        lambda s: float(s.std() / s.mean()) if s.mean() > 0 else 0.0
    ).rename("weekly_receipt_cv")

    # Repeat customer share per vendor (customers with > 1 payment)
    repeat_cust_counts = cust_df.groupby("to_account")["from_account"].apply(
        lambda s: int((s.value_counts() > 1).sum())
    ).rename("repeat_customer_count")

    # Top customer concentration
    top_cust_vols = cust_df.groupby(["to_account", "from_account"])["amount"].sum().groupby("to_account").max().rename("top_customer_vol")

    # Expenses per vendor (from_account)
    exp_vendor_agg = exp_df.groupby("from_account").agg(
        total_expenses=("amount", "sum"),
        expense_txns=("amount", "count")
    )

    # Transfers in and out per vendor
    tin_agg = trans_df.groupby("to_account").agg(transfer_in_volume=("amount", "sum"))
    tout_agg = trans_df.groupby("from_account").agg(transfer_out_volume=("amount", "sum"))

    # Reciprocal transfers in and out
    recip_in_agg = reciprocal_txns.groupby("to_account").agg(reciprocal_in_volume=("amount", "sum"))
    recip_out_agg = reciprocal_txns.groupby("from_account").agg(reciprocal_out_volume=("amount", "sum"))

    # Active calendar days per vendor (either as from_account or to_account)
    dates_in = txns_df.groupby("to_account")["date"].apply(set)
    dates_out = txns_df.groupby("from_account")["date"].apply(set)

    # Merge everything on vendors_df
    df = vendors_df.copy().set_index("vendor_id")
    df = df.join(cust_vendor_agg).join(weekly_cv).join(repeat_cust_counts).join(top_cust_vols)
    df = df.join(exp_vendor_agg).join(tin_agg).join(tout_agg).join(recip_in_agg).join(recip_out_agg)

    df = df.fillna(0.0)

    # Active days ratio (out of 90 days)
    total_period_days = 90.0
    active_days_list = []
    for vid in df.index:
        s_in = dates_in.get(vid, set())
        s_out = dates_out.get(vid, set())
        active_days = len(s_in.union(s_out))
        active_days_list.append(active_days / total_period_days)
    df["active_days_ratio"] = active_days_list

    # Normalized Monthly Metrics (90 days = 3 calendar months)
    months_count = 3.0
    df["monthly_receipts"] = df["total_receipts"] / months_count
    df["monthly_expenses"] = df["total_expenses"] / months_count
    df["monthly_net_cash_flow"] = df["monthly_receipts"] - df["monthly_expenses"]

    # Customer base features
    df["repeat_customer_share"] = np.where(
        df["unique_customers"] > 0,
        df["repeat_customer_count"] / df["unique_customers"],
        0.0
    )
    df["top_customer_concentration"] = np.where(
        df["total_receipts"] > 0,
        df["top_customer_vol"] / df["total_receipts"],
        0.0
    )
    df["receipts_per_cust"] = np.where(
        df["unique_customers"] > 0,
        df["total_receipts"] / df["unique_customers"],
        0.0
    )

    # Transfer features
    df["transfer_volume"] = df["transfer_in_volume"] + df["transfer_out_volume"]
    df["transfer_share_of_receipts"] = np.where(
        df["total_receipts"] > 0,
        df["transfer_in_volume"] / df["total_receipts"],
        0.0
    )
    recip_total_vol = df["reciprocal_in_volume"] + df["reciprocal_out_volume"]
    df["reciprocal_transfer_share"] = np.where(
        df["transfer_volume"] > 0,
        recip_total_vol / df["transfer_volume"],
        0.0
    )

    # Operational ratios
    df["expense_to_receipt_ratio"] = np.where(
        df["total_receipts"] > 0,
        df["total_expenses"] / df["total_receipts"],
        0.0
    )

    # Repayment Coverage
    # Illustrative EMI: flat 20% p.a., 12 months -> Total repayment = Loan * 1.20 -> Monthly EMI = Loan * 0.10
    df["estimated_monthly_emi"] = (df["loan_amount_requested"] * 1.20) / 12.0
    df["repayment_coverage"] = np.where(
        df["estimated_monthly_emi"] > 0,
        df["monthly_net_cash_flow"] / df["estimated_monthly_emi"],
        0.0
    )

    logger.info(f"Engineered {len(df.columns)} vendor-level metrics across all {len(df)} vendors.")
    return df


# =====================================================================
# 3. GENUINENESS PSEUDO-LABELS & UNSUPERVISED CROSS-CHECK
# =====================================================================
def generate_genuineness_labels(vendor_features_df: pd.DataFrame) -> pd.DataFrame:
    """
    Since the dataset has no ground-truth default/fraud labels, construct transparent,
    rule-based pseudo-labels detecting non-genuine turnover:
    - High reciprocal / circular transfer share (> 20%)
    - Apparent turnover heavily inflated by transfers (> 50% of customer receipts)
    - Abnormally low customer receipts per customer (< 200 INR) combined with transfers

    Also run an unsupervised check using Isolation Forest to compare anomalies.
    """
    logger.info("=== STEP 3: PSEUDO-LABELING & ISOLATION FOREST AUDIT ===")
    df = vendor_features_df.copy()

    # Rule-based pseudo-label
    # 1 = non-genuine / fraudulent turnover, 0 = genuine commerce
    rule_circ = df["reciprocal_transfer_share"] > 0.20
    rule_inflated = df["transfer_share_of_receipts"] > 0.50
    rule_dilution = (df["receipts_per_cust"] < 200.0) & (df["transfer_volume"] > 0)

    df["fraud_flag"] = (rule_circ | rule_inflated | rule_dilution).astype(int)
    df["is_genuine"] = 1 - df["fraud_flag"]

    flagged_vendors = df[df["fraud_flag"] == 1].index.tolist()
    genuine_vendors = df[df["fraud_flag"] == 0].index.tolist()

    logger.info(f"Rule-based Flag: {len(flagged_vendors)} non-genuine vendors ({flagged_vendors})")
    logger.info(f"Genuine Vendors: {len(genuine_vendors)} vendors")

    # Unsupervised check: Isolation Forest
    iso_features = [
        "monthly_receipts", "monthly_expenses", "monthly_net_cash_flow",
        "weekly_receipt_cv", "unique_customers", "repeat_customer_share",
        "top_customer_concentration", "transfer_in_volume", "transfer_out_volume",
        "transfer_volume", "transfer_share_of_receipts", "reciprocal_transfer_share",
        "expense_to_receipt_ratio", "repayment_coverage", "receipts_per_cust"
    ]

    iso = IsolationForest(
        contamination=float(len(flagged_vendors) / len(df)),
        random_state=42
    )
    iso_preds = iso.fit_predict(df[iso_features])
    # -1 is anomaly in IsolationForest
    df["iso_anomaly"] = (iso_preds == -1).astype(int)
    df["iso_score"] = iso.decision_function(df[iso_features])

    iso_flagged = df[df["iso_anomaly"] == 1].index.tolist()
    overlap_count = (df["fraud_flag"] == df["iso_anomaly"]).sum()
    agreement_rate = (overlap_count / len(df)) * 100.0

    logger.info(f"Isolation Forest flagged {len(iso_flagged)} vendors: {iso_flagged}")
    logger.info(f"Agreement between Rule Pseudo-Labels and Isolation Forest: {overlap_count}/{len(df)} ({agreement_rate:.1f}%)")

    return df


# =====================================================================
# 4. TRAIN / TEST SPLIT (80% TRAIN / 20% TEST, ZERO LEAKAGE)
# =====================================================================
def split_train_test(vendor_df: pd.DataFrame, txns_df: pd.DataFrame, output_dir: Path):
    """
    Split 80% train / 20% test (32 train / 8 test vendors) stratified by fraud_flag.
    Split strictly by vendor ID to guarantee zero data leakage.
    Scalers are fit strictly on the train partition only.
    Saves train_vendors.csv and test_vendors.csv.
    """
    logger.info("=== STEP 4: ZERO-LEAKAGE TRAIN/TEST SPLIT ===")

    feature_cols = [
        "monthly_receipts", "monthly_expenses", "monthly_net_cash_flow",
        "weekly_receipt_cv", "unique_customers", "repeat_customer_share",
        "top_customer_concentration", "transfer_in_volume", "transfer_out_volume",
        "transfer_volume", "transfer_share_of_receipts", "reciprocal_transfer_share",
        "expense_to_receipt_ratio", "repayment_coverage", "receipts_per_cust"
    ]

    X = vendor_df[feature_cols]
    y = vendor_df["fraud_flag"]

    # Stratified 80/20 vendor split
    train_idx, test_idx = train_test_split(
        vendor_df.index,
        test_size=0.20,
        random_state=42,
        stratify=y
    )

    X_train = X.loc[train_idx]
    y_train = y.loc[train_idx]
    X_test = X.loc[test_idx]
    y_test = y.loc[test_idx]

    # Save split vendor IDs
    train_vendors_df = pd.DataFrame({"vendor_id": train_idx, "fraud_flag": y_train.values})
    test_vendors_df = pd.DataFrame({"vendor_id": test_idx, "fraud_flag": y_test.values})

    train_vendors_df.to_csv(output_dir / "train_vendors.csv", index=False)
    test_vendors_df.to_csv(output_dir / "test_vendors.csv", index=False)

    # Report transaction-level split breakdown
    # 1. Leakage-free vendor-partitioned transactions
    train_txns = txns_df[txns_df["from_account"].isin(train_idx) | txns_df["to_account"].isin(train_idx)]
    test_txns = txns_df[txns_df["from_account"].isin(test_idx) | txns_df["to_account"].isin(test_idx)]

    # 2. Independent row-level 80/20 transaction split (for reference)
    total_txns = len(txns_df)
    txn_80_split = int(round(total_txns * 0.8))
    txn_20_split = total_txns - txn_80_split

    logger.info(f"Vendor split: {len(X_train)} Train / {len(X_test)} Test vendors")
    logger.info(f"Train label balance: {y_train.value_counts().to_dict()}")
    logger.info(f"Test label balance: {y_test.value_counts().to_dict()}")
    logger.info(f"Vendor-partitioned transactions: {len(train_txns)} Train txns / {len(test_txns)} Test txns")
    logger.info(f"Independent 80/20 transaction benchmark: {txn_80_split} Train / {txn_20_split} Test")
    logger.info("Saved train_vendors.csv and test_vendors.csv.")

    # Fit scaler strictly on Train features only
    scaler = StandardScaler()
    X_train_scaled = pd.DataFrame(scaler.fit_transform(X_train), index=X_train.index, columns=feature_cols)
    X_test_scaled = pd.DataFrame(scaler.transform(X_test), index=X_test.index, columns=feature_cols)

    split_data = {
        "X_train": X_train,
        "X_test": X_test,
        "X_train_scaled": X_train_scaled,
        "X_test_scaled": X_test_scaled,
        "y_train": y_train,
        "y_test": y_test,
        "train_idx": train_idx,
        "test_idx": test_idx,
        "feature_cols": feature_cols,
        "scaler": scaler,
        "txn_split_stats": {
            "vendor_partitioned_train_txns": len(train_txns),
            "vendor_partitioned_test_txns": len(test_txns),
            "benchmark_80_20_train_txns": txn_80_split,
            "benchmark_80_20_test_txns": txn_20_split
        }
    }

    return split_data


# =====================================================================
# 5. MODEL TRAINING, CROSS-VALIDATION & EVALUATION
# =====================================================================
def train_and_evaluate_models(split_data: dict, charts_dir: Path):
    """
    Train:
    - Baseline: Logistic Regression
    - Advanced: Random Forest Classifier
    Cross-validate on TRAIN partition only (4-fold Stratified).
    Evaluate strictly on 20% TEST partition.
    Compute accuracy, precision, recall, f1, roc_auc, confusion matrix, feature importances.
    """
    logger.info("=== STEP 5: MODEL TRAINING & EVALUATION ===")

    X_train = split_data["X_train"]
    X_test = split_data["X_test"]
    X_train_scaled = split_data["X_train_scaled"]
    X_test_scaled = split_data["X_test_scaled"]
    y_train = split_data["y_train"]
    y_test = split_data["y_test"]
    feature_cols = split_data["feature_cols"]

    skf = StratifiedKFold(n_splits=4, shuffle=True, random_state=42)

    # 1. Baseline Model: Logistic Regression
    lr = LogisticRegression(random_state=42, C=1.0)
    lr_cv_scores = cross_val_score(lr, X_train_scaled, y_train, cv=skf, scoring="f1")
    lr.fit(X_train_scaled, y_train)

    lr_test_preds = lr.predict(X_test_scaled)
    lr_test_probs = lr.predict_proba(X_test_scaled)[:, 1]
    lr_cm = confusion_matrix(y_test, lr_test_preds).tolist()

    lr_metrics = {
        "model_name": "Logistic Regression (Baseline)",
        "train_cv_f1_mean": float(lr_cv_scores.mean()),
        "train_cv_f1_std": float(lr_cv_scores.std()),
        "test_accuracy": float(accuracy_score(y_test, lr_test_preds)),
        "test_precision": float(precision_score(y_test, lr_test_preds, zero_division=0)),
        "test_recall": float(recall_score(y_test, lr_test_preds, zero_division=0)),
        "test_f1": float(f1_score(y_test, lr_test_preds, zero_division=0)),
        "test_roc_auc": float(roc_auc_score(y_test, lr_test_probs)),
        "confusion_matrix": lr_cm
    }

    # 2. Advanced Model: Random Forest Classifier
    rf = RandomForestClassifier(n_estimators=100, max_depth=4, random_state=42)
    rf_cv_scores = cross_val_score(rf, X_train, y_train, cv=skf, scoring="f1")
    rf.fit(X_train, y_train)

    rf_test_preds = rf.predict(X_test)
    rf_test_probs = rf.predict_proba(X_test)[:, 1]
    rf_cm = confusion_matrix(y_test, rf_test_preds).tolist()

    importances = pd.Series(rf.feature_importances_, index=feature_cols).sort_values(ascending=False)

    rf_metrics = {
        "model_name": "Random Forest Classifier",
        "train_cv_f1_mean": float(rf_cv_scores.mean()),
        "train_cv_f1_std": float(rf_cv_scores.std()),
        "test_accuracy": float(accuracy_score(y_test, rf_test_preds)),
        "test_precision": float(precision_score(y_test, rf_test_preds, zero_division=0)),
        "test_recall": float(recall_score(y_test, rf_test_preds, zero_division=0)),
        "test_f1": float(f1_score(y_test, rf_test_preds, zero_division=0)),
        "test_roc_auc": float(roc_auc_score(y_test, rf_test_probs)),
        "confusion_matrix": rf_cm,
        "feature_importances": importances.to_dict()
    }

    logger.info("=== EVALUATION RESULTS ON 20% TEST SET (8 VENDORS) ===")
    logger.info(f"Logistic Regression: F1={lr_metrics['test_f1']:.4f}, Acc={lr_metrics['test_accuracy']:.4f}, AUC={lr_metrics['test_roc_auc']:.4f}")
    logger.info(f"Random Forest:       F1={rf_metrics['test_f1']:.4f}, Acc={rf_metrics['test_accuracy']:.4f}, AUC={rf_metrics['test_roc_auc']:.4f}")
    logger.info("NOTE ON TEST SET LIMITATION: With 40 vendors total, test set has exactly 8 vendors. Small test sets exhibit high discrete metric sensitivity.")

    # Generate Confusion Matrix Chart
    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    sns.heatmap(np.array(lr_cm), annot=True, fmt="d", cmap="Blues", ax=axes[0],
                xticklabels=["Genuine", "Non-Genuine"], yticklabels=["Genuine", "Non-Genuine"])
    axes[0].set_title("Logistic Regression (Test)")
    axes[0].set_xlabel("Predicted")
    axes[0].set_ylabel("Actual")

    sns.heatmap(np.array(rf_cm), annot=True, fmt="d", cmap="Greens", ax=axes[1],
                xticklabels=["Genuine", "Non-Genuine"], yticklabels=["Genuine", "Non-Genuine"])
    axes[1].set_title("Random Forest (Test)")
    axes[1].set_xlabel("Predicted")
    axes[1].set_ylabel("Actual")

    plt.tight_layout()
    cm_path = charts_dir / "confusion_matrix.png"
    plt.savefig(cm_path, dpi=300)
    plt.close()

    # Generate Feature Importance Chart
    plt.figure(figsize=(9, 5))
    top_feats = importances.head(10).sort_values(ascending=True)
    plt.barh(top_feats.index, top_feats.values, color="#1f77b4")
    plt.title("Top Feature Importances (Random Forest)")
    plt.xlabel("Gini Importance Score")
    plt.tight_layout()
    fi_path = charts_dir / "feature_importance.png"
    plt.savefig(fi_path, dpi=300)
    plt.close()

    model_results = {
        "logistic_regression": lr_metrics,
        "random_forest": rf_metrics,
        "models": {
            "logistic_regression": lr,
            "random_forest": rf,
            "scaler": split_data["scaler"],
            "feature_cols": feature_cols
        }
    }

    return model_results


# =====================================================================
# 6. 100-POINT TRUSTCRED SCORECARD
# =====================================================================
def compute_scorecard(vendor_df: pd.DataFrame, charts_dir: Path, output_dir: Path) -> pd.DataFrame:
    """
    Compute 100-point credit assessment scorecard derived solely from the new dataset.
    Pillars:
    1. Income Stability (25 pts): Weekly receipt CV (15) + customer base breadth & distribution (10)
    2. Repayment Capacity (30 pts): Monthly net cash flow coverage of estimated EMI (30)
    3. Expense Discipline (15 pts): Operational expense-to-receipt ratio (15)
    4. Business Continuity (15 pts): Active calendar days ratio across 90-day observation period (15)
       [Replaces dropped 'business_age_months' which does not exist in the new data]
    5. Evidence Coverage & Genuineness (15 pts): Verified commercial transactions vs circular transfer inflation (15)

    Bands:
    >= 75: strong
    >= 55: moderate
    >= 35: limited
    < 35:  insufficient

    Penalty / Exclusion:
    Vendors flagged with non-genuine turnover are penalized/capped to 'insufficient' (<35)
    with explicit plain-language lender audit notes.
    """
    logger.info("=== STEP 6: COMPUTING 100-POINT SCORECARD ===")

    scorecard_rows = []

    for vid, row in vendor_df.iterrows():
        # Pillar 1: Income Stability (Max 25 pts)
        cv = row["weekly_receipt_cv"]
        if cv < 0.20:
            cv_pts = 15
        elif cv < 0.25:
            cv_pts = 12
        elif cv < 0.30:
            cv_pts = 9
        elif cv < 0.35:
            cv_pts = 6
        else:
            cv_pts = 3

        u_cust = row["unique_customers"]
        conc = row["top_customer_concentration"]
        if u_cust >= 1100 and conc < 0.01:
            cust_pts = 10
        elif u_cust >= 900:
            cust_pts = 7
        else:
            cust_pts = 4
        p1_income_stability = cv_pts + cust_pts

        # Pillar 2: Repayment Capacity (Max 30 pts)
        cov = row["repayment_coverage"]
        if cov >= 2.5:
            p2_repayment_capacity = 30
        elif cov >= 2.0:
            p2_repayment_capacity = 25
        elif cov >= 1.5:
            p2_repayment_capacity = 20
        elif cov >= 1.2:
            p2_repayment_capacity = 15
        elif cov >= 1.0:
            p2_repayment_capacity = 10
        else:
            p2_repayment_capacity = 0

        # Pillar 3: Expense Discipline (Max 15 pts)
        exp_ratio = row["expense_to_receipt_ratio"]
        if exp_ratio <= 0.40:
            p3_expense_discipline = 15
        elif exp_ratio <= 0.50:
            p3_expense_discipline = 12
        elif exp_ratio <= 0.65:
            p3_expense_discipline = 9
        elif exp_ratio <= 0.80:
            p3_expense_discipline = 6
        else:
            p3_expense_discipline = 2

        # Pillar 4: Business Continuity (Max 15 pts)
        act_ratio = row["active_days_ratio"]
        if act_ratio >= 0.95:
            p4_business_continuity = 15
        elif act_ratio >= 0.90:
            p4_business_continuity = 12
        elif act_ratio >= 0.80:
            p4_business_continuity = 8
        elif act_ratio >= 0.70:
            p4_business_continuity = 4
        else:
            p4_business_continuity = 0

        # Pillar 5: Evidence Coverage / Genuineness (Max 15 pts)
        is_fraud = bool(row["fraud_flag"] == 1)
        if is_fraud:
            p5_genuineness = 0
        else:
            p5_genuineness = 15

        raw_total_score = p1_income_stability + p2_repayment_capacity + p3_expense_discipline + p4_business_continuity + p5_genuineness

        # Apply Genuineness Penalty / Exclusion Cap
        if is_fraud:
            final_score = min(raw_total_score, 30)  # Capped strictly in insufficient band
            band = "insufficient"
            decision = "REJECT_OR_AUDIT"
            explanation = (
                f"Flagged for non-genuine turnover: High reciprocal transfer volume "
                f"(₹{row['transfer_volume']:,.2f}, {row['transfer_share_of_receipts']*100:.1f}% of receipts) "
                f"indicates round-tripping vendor accounts. Apparent cash flow lacks genuine commercial backing."
            )
        else:
            final_score = raw_total_score
            if final_score >= 75:
                band = "strong"
                decision = "APPROVED"
            elif final_score >= 55:
                band = "moderate"
                decision = "CONDITIONAL_APPROVAL"
            elif final_score >= 35:
                band = "limited"
                decision = "REQUIRES_COLLATERAL"
            else:
                band = "insufficient"
                decision = "REJECTED"

            explanation = (
                f"Verified genuine business operations across 90 days. "
                f"Avg monthly net cash flow ₹{row['monthly_net_cash_flow']:,.2f} provides "
                f"{cov:.1f}x coverage over estimated monthly debt service of ₹{row['estimated_monthly_emi']:,.2f}. "
                f"Receipt volatility is controlled (CV={cv:.2f}) with a diversified customer base ({u_cust} unique buyers)."
            )

        scorecard_rows.append({
            "vendor_id": vid,
            "loan_amount_requested": row["loan_amount_requested"],
            "monthly_receipts": round(row["monthly_receipts"], 2),
            "monthly_expenses": round(row["monthly_expenses"], 2),
            "monthly_net_cash_flow": round(row["monthly_net_cash_flow"], 2),
            "estimated_monthly_emi": round(row["estimated_monthly_emi"], 2),
            "repayment_coverage": round(cov, 2),
            "weekly_receipt_cv": round(cv, 4),
            "unique_customers": int(u_cust),
            "transfer_volume": round(row["transfer_volume"], 2),
            "fraud_flag": int(row["fraud_flag"]),
            "income_stability_pts": p1_income_stability,
            "repayment_capacity_pts": p2_repayment_capacity,
            "expense_discipline_pts": p3_expense_discipline,
            "business_continuity_pts": p4_business_continuity,
            "genuineness_pts": p5_genuineness,
            "raw_total_score": raw_total_score,
            "final_score": final_score,
            "score_band": band,
            "underwriting_decision": decision,
            "plain_language_explanation": explanation
        })

    scores_df = pd.DataFrame(scorecard_rows)
    scores_df.to_csv(output_dir / "vendor_scores.csv", index=False)
    logger.info(f"Generated scorecard for 40 vendors. Saved to {output_dir / 'vendor_scores.csv'}")

    band_summary = scores_df["score_band"].value_counts().to_dict()
    logger.info(f"Scorecard Bands Summary: {band_summary}")

    # Generate Score Distribution Chart
    plt.figure(figsize=(8, 4.5))
    sns.histplot(data=scores_df, x="final_score", hue="score_band", multiple="stack", bins=15, palette="Set2")
    plt.axvline(75, color="green", linestyle="--", alpha=0.7, label="Strong (>=75)")
    plt.axvline(55, color="orange", linestyle="--", alpha=0.7, label="Moderate (>=55)")
    plt.axvline(35, color="red", linestyle="--", alpha=0.7, label="Limited (>=35)")
    plt.title("Distribution of 100-Point Scorecard by Band")
    plt.xlabel("TrustCred Score (0-100)")
    plt.ylabel("Number of Vendors")
    plt.legend()
    plt.tight_layout()
    plt.savefig(charts_dir / "score_distribution.png", dpi=300)
    plt.close()

    # Generate Repayment vs Cash Flow Chart
    plt.figure(figsize=(8, 5))
    sns.scatterplot(
        data=scores_df,
        x="estimated_monthly_emi",
        y="monthly_net_cash_flow",
        hue="score_band",
        style="underwriting_decision",
        s=100,
        palette="viridis"
    )
    plt.title("Estimated Monthly EMI vs Monthly Net Cash Flow")
    plt.xlabel("Estimated Monthly EMI (₹)")
    plt.ylabel("Monthly Net Cash Flow (₹)")
    plt.tight_layout()
    plt.savefig(charts_dir / "repayment_vs_cashflow.png", dpi=300)
    plt.close()

    return scores_df


# =====================================================================
# 7. MAIN PIPELINE EXECUTION
# =====================================================================
def main():
    repo_root, script_dir, data_dir, charts_dir = get_base_dirs()
    logger.info("Initializing TrustCred AI Training Pipeline")
    logger.info(f"Repository Root: {repo_root}")
    logger.info(f"Data Directory: {data_dir}")

    # 1. Load & Validate
    vendors_df, txns_df, val_report = load_and_validate_data(data_dir)

    # 2. Feature Engineering
    vendor_features_df = engineer_vendor_features(vendors_df, txns_df)

    # 3. Pseudo-Labeling & Unsupervised Cross-Check
    labeled_features_df = generate_genuineness_labels(vendor_features_df)

    # 4. Train/Test Split
    split_data = split_train_test(labeled_features_df, txns_df, script_dir)

    # 5. Train & Evaluate Models
    eval_results = train_and_evaluate_models(split_data, charts_dir)

    # 6. 100-Point Scorecard
    scores_df = compute_scorecard(labeled_features_df, charts_dir, script_dir)

    # 7. Save Model & Metrics Artifacts
    model_artifact = {
        "models": eval_results["models"],
        "metadata": {
            "dataset_rows": len(txns_df),
            "vendors_count": len(vendors_df),
            "train_vendors": len(split_data["train_idx"]),
            "test_vendors": len(split_data["test_idx"]),
            "random_state": 42
        }
    }
    model_path = script_dir / "model.pkl"
    joblib.dump(model_artifact, model_path)
    logger.info(f"Saved trained model bundle to {model_path}")

    # Build comprehensive metrics.json
    metrics_json = {
        "data_validation": val_report,
        "split_summary": {
            "total_vendors": len(labeled_features_df),
            "train_vendors": len(split_data["train_idx"]),
            "test_vendors": len(split_data["test_idx"]),
            "train_fraud_rate": float(split_data["y_train"].mean()),
            "test_fraud_rate": float(split_data["y_test"].mean()),
            "transaction_split": split_data["txn_split_stats"]
        },
        "model_performance": {
            "logistic_regression": {
                "train_cv_f1_mean": eval_results["logistic_regression"]["train_cv_f1_mean"],
                "train_cv_f1_std": eval_results["logistic_regression"]["train_cv_f1_std"],
                "test_accuracy": eval_results["logistic_regression"]["test_accuracy"],
                "test_precision": eval_results["logistic_regression"]["test_precision"],
                "test_recall": eval_results["logistic_regression"]["test_recall"],
                "test_f1": eval_results["logistic_regression"]["test_f1"],
                "test_roc_auc": eval_results["logistic_regression"]["test_roc_auc"],
                "confusion_matrix": eval_results["logistic_regression"]["confusion_matrix"]
            },
            "random_forest": {
                "train_cv_f1_mean": eval_results["random_forest"]["train_cv_f1_mean"],
                "train_cv_f1_std": eval_results["random_forest"]["train_cv_f1_std"],
                "test_accuracy": eval_results["random_forest"]["test_accuracy"],
                "test_precision": eval_results["random_forest"]["test_precision"],
                "test_recall": eval_results["random_forest"]["test_recall"],
                "test_f1": eval_results["random_forest"]["test_f1"],
                "test_roc_auc": eval_results["random_forest"]["test_roc_auc"],
                "confusion_matrix": eval_results["random_forest"]["confusion_matrix"],
                "top_feature_importances": eval_results["random_forest"]["feature_importances"]
            }
        },
        "scorecard_summary": {
            "bands_distribution": scores_df["score_band"].value_counts().to_dict(),
            "underwriting_decisions": scores_df["underwriting_decision"].value_counts().to_dict(),
            "dropped_factors": [
                {
                    "factor": "business_age_months",
                    "reason": "Not present in new transaction-only dataset (only 90 days available)",
                    "replacement": "business_continuity via active_days_consistency"
                },
                {
                    "factor": "repayment_history",
                    "reason": "No loan repayment records present in new dataset",
                    "replacement": "repayment_capacity via net cash flow coverage of estimated EMI"
                }
            ],
            "limitations": [
                "Small sample size: Only 40 total vendors (32 train, 8 test). Test metrics are noisy and subject to discrete variance.",
                "Short observation window: 90 calendar days (July-September 2026), capturing limited seasonality.",
                "Synthetic dataset: Clean separation between genuine commerce and circular transfer rings in demo data."
            ]
        }
    }

    metrics_path = script_dir / "metrics.json"
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics_json, f, indent=2)
    logger.info(f"Saved metrics summary to {metrics_path}")

    print("\n" + "="*70)
    print("TRUSTCRED AI TRAINING & SCORECARD EVALUATION COMPLETED")
    print("="*70)
    print(f"Artifacts generated:")
    print(f"  - Model file:    {model_path}")
    print(f"  - Metrics JSON:  {metrics_path}")
    print(f"  - Vendor Scores: {script_dir / 'vendor_scores.csv'}")
    print(f"  - Train Vendors: {script_dir / 'train_vendors.csv'}")
    print(f"  - Test Vendors:  {script_dir / 'test_vendors.csv'}")
    print(f"  - Charts dir:    {charts_dir}")
    print("="*70 + "\n")


if __name__ == "__main__":
    main()
