# TrustCred AI - Pseudo-Labeling Rules & Unsupervised Validation

In the absence of ground-truth historical loan default or regulatory fraud labels in transaction feeds, TrustCred AI implements an auditable **rule-based pseudo-labeling framework** paired with an **unsupervised Isolation Forest cross-check**.

This document outlines the business context, exact mathematical conditions, decision thresholds, and comparative findings.

---

## 1. Context: Detecting Non-Genuine Turnover & Round-Tripping

In micro-enterprise lending, lenders often rely on aggregate turnover (bank credits or UPI inflows) to estimate creditworthiness. However, unscrupulous or distressed borrowers can artificially inflate apparent transaction volume through **circular round-tripping transfers**:
- A small cohort of merchants repeatedly transfers money back and forth (e.g., $V021 \leftrightarrow V022$).
- The money circulates without representing any retail customer commerce or real economic output.
- Such accounts show massive gross volume (₹400,000 - ₹800,000+), masking much smaller underlying commercial receipts.

---

## 2. Rule-Based Pseudo-Labeling Formulation

A vendor is flagged as non-genuine (`fraud_flag = 1`, `is_genuine = 0`) if ANY of the following rules are triggered:

### Rule 1: High Reciprocal / Circular Transfer Share
$$\text{reciprocal\_transfer\_share} = \frac{\text{Volume of transfers with matching reciprocal counterparty}}{\text{total\_transfer\_volume}} > 0.20 \quad (20\%)$$
- **Rationale**: Legitimate inter-merchant payments rarely consist of mirror-image reciprocal transfers between the same two accounts within a 90-day window. In round-tripping rings, $V_A \rightarrow V_B$ is accompanied by $V_B \rightarrow V_A$ in almost equal amounts.

### Rule 2: Apparent Turnover Inflated by Transfers
$$\text{transfer\_share\_of\_receipts} = \frac{\text{transfer\_in\_volume}}{\text{total\_customer\_receipts}} > 0.50 \quad (50\%)$$
- **Rationale**: For street vendors and retail merchants, commercial customer payments should form the overwhelming majority of inflows. In the dataset, genuine merchants have 0 transfers, while manipulated merchants have incoming transfer volumes ranging from **179% to 335%** of their total customer receipts.

### Rule 3: Abnormal Revenue Dilution with High Transfers
$$(\text{receipts\_per\_cust} < 200 \text{ INR}) \quad \text{AND} \quad (\text{transfer\_volume} > 0)$$
- **Rationale**: Merchants engaged in circular transfers exhibit artificially depressed average revenue per genuine customer (~₹98 - ₹178 vs. ~₹266 for genuine merchants), indicating that their actual customer base is lower-ticket while their aggregate apparent turnover is artificially propped up by transfers.

---

## 3. Flagged Cohort in the Dataset

Across the 40 vendors, exactly 9 vendors are flagged by these rules:
- **Reciprocal Pair**: `V021` and `V022` (67 reciprocal transfers each way, ~₹405,000 each way, total ~₹810,000).
- **Circular Trio**: `V007`, `V008`, `V009` (~₹730,000 transfer volume each in circular ring).
- **Circular Quad**: `V033`, `V034`, `V035`, `V036` (~₹479,000 to ~₹586,000 transfer volume each).

All other 31 merchants have **zero transfer volume** (`transfer_volume = 0.0`), clean customer payments, and consistent supplier expenses.

---

## 4. Unsupervised Cross-Check: Isolation Forest

To confirm that the rule-based flags align with multidimensional anomaly detection, an **Isolation Forest** model was trained independently on all 15 vendor feature dimensions:
- `contamination = 9 / 40 = 0.225`
- `random_state = 42`

### Agreement Results
- **Isolation Forest Flagged**: `V007`, `V009`, `V021`, `V022`, `V023`, `V033`, `V035`, `V036`, `V037`
- **Rule-Based Flagged**: `V007`, `V008`, `V009`, `V021`, `V022`, `V033`, `V034`, `V035`, `V036`
- **Agreement**: **36 / 40 vendors (90.0% agreement)**

The high concordance (90%) confirms that the rule-based pseudo-label captures strong multivariate anomalies in the transaction feature manifold without overfitting or relying on subjective heuristics.
