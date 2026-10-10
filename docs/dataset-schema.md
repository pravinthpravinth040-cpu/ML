# TrustCred AI - Dataset Schema & Methodology

This document defines the schema, data dictionaries, validation rules, and feature methodology for TrustCred AI.
The project uses **exclusively** the verified transaction-flow dataset (`vendors.csv` and `transactions.csv`). All legacy synthetic generation scripts and seed tables have been deprecated and removed.

---

## 1. Primary Datasets

All datasets reside in `ml-training/data/`.

### 1.1 `vendors.csv` (40 rows)
Metadata defining the vendors applying for micro-credit and their requested financing amounts.

| Column | Type | Nullable | Value Range | Description |
|---|---|---|---|---|
| `vendor_id` | String (`V###`) | No | `V001` - `V040` | Unique vendor identifier |
| `loan_amount_requested` | Integer | No | ₹30,000 - ₹75,000 | Amount of working capital / micro-loan requested (INR) |

### 1.2 `transactions.csv` (49,160 rows)
High-frequency UPI-style digital transaction log covering 90 calendar days (`2026-07-01` to `2026-09-28`).

| Column | Type | Nullable | Example Values | Description |
|---|---|---|---|---|
| `txn_id` | String | No | `T000001` - `T049160` | Unique transaction reference ID |
| `date` | Date (`YYYY-MM-DD`) | No | `2026-07-01` - `2026-09-28` | Timestamp date of transaction |
| `from_account` | String | No | `C38018`, `V022`, etc. | Originating account ID |
| `to_account` | String | No | `V022`, `SUP102`, etc. | Destination account ID |
| `amount` | Float | No | ₹1.00 - ₹9,276.43 | Value of the transaction in INR |
| `type` | Categorical | No | `customer_payment`, `expense`, `transfer` | Directional category of funds |

---

## 2. Account Prefix & Transaction Semantics

| Prefix | Entity | Role in Transactions |
|---|---|---|
| `C` (`C#####`) | Retail Customer | Payer in `customer_payment` transactions (Business Receipts) |
| `SUP` (`SUP###`) | Commercial Supplier | Payee in `expense` transactions (Operational Costs) |
| `V` (`V###`) | Small Merchant / Vendor | Beneficiary of customer receipts, payer of expenses, counterparty in transfers |

### Transaction Flow Matrix

| Transaction Type | Row Count | From -> To | Economic Meaning | Typical Amount |
|---|---|---|---|---|
| `customer_payment` | 46,760 | `C#####` -> `V###` | Genuine retail customer paying for goods/services (Income) | Avg: ~₹232 (Max: ₹1,718) |
| `expense` | 1,818 | `V###` -> `SUP###` | Merchant paying wholesale suppliers / inventory / stalls | Avg: ~₹856 (Max: ₹1,500) |
| `transfer` | 582 | `V###` -> `V###` | Account-to-account funds transfer between merchants | Avg: ~₹5,897 (Max: ₹9,276) |

---

## 3. Feature Engineering Dictionary

Each vendor row is transformed into aggregated financial health and authenticity features:

1. **`monthly_receipts`**: Total customer payments received divided by 3 (`total_receipts / 3.0`).
2. **`monthly_expenses`**: Total supplier payments divided by 3 (`total_expenses / 3.0`).
3. **`monthly_net_cash_flow`**: `monthly_receipts - monthly_expenses` (excludes non-commercial transfers).
4. **`weekly_receipt_cv`**: Coefficient of variation ($\sigma / \mu$) of weekly customer receipts across 13 ISO weeks.
5. **`unique_customers`**: Count of distinct `from_account` customer IDs paying the merchant.
6. **`repeat_customer_share`**: Percentage of customers with $>1$ customer payment.
7. **`top_customer_concentration`**: Ratio of highest single customer's payment volume to total receipts.
8. **`transfer_in_volume`**: Cumulative value of incoming vendor transfers (`V -> V`).
9. **`transfer_out_volume`**: Cumulative value of outgoing vendor transfers (`V -> V`).
10. **`transfer_volume`**: Cumulative in + out transfer activity (`transfer_in + transfer_out`).
11. **`transfer_share_of_receipts`**: Ratio of incoming transfer volume to total genuine customer receipts.
12. **`reciprocal_transfer_share`**: Percentage of transfer volume occurring between reciprocal pairs ($A \rightarrow B$ and $B \rightarrow A$).
13. **`expense_to_receipt_ratio`**: Operational expense ratio (`total_expenses / total_receipts`).
14. **`active_days_ratio`**: Number of active business transaction days divided by the 90-day observation window.
15. **`estimated_monthly_emi`**: Illustrative debt service for requested loan: Flat 20% annual interest over 12 months = $\frac{P \times 1.20}{12} = 0.10 \times P$.
16. **`repayment_coverage`**: Debt Service Coverage Ratio = $\frac{\text{monthly\_net\_cash\_flow}}{\text{estimated\_monthly\_emi}}$.
17. **`receipts_per_cust`**: Average ticket size per unique customer = $\frac{\text{total\_receipts}}{\text{unique\_customers}}$.

---

## 4. Factors Dropped from Legacy Version

The original synthetic prototype included several hypothetical factors that cannot be substantiated by transaction logs alone. These factors have been systematically dropped:

| Dropped Factor | Reason for Removal | Replacement / Handling |
|---|---|---|
| `business_age_months` | The new dataset provides only a 90-day transaction log; true business registration age is absent. | Replaced by **Active-Days Consistency** (`active_days_ratio`) measuring business operating continuity over the 90 days. |
| `loan_repayment_history` | No historical loan repayment records exist in the verified dataset. | Replaced by **Repayment Capacity Buffer** (`repayment_coverage`) measuring net operating cash flow against illustrative EMI. |
| `udyam_registration` / Document Hashes | External regulatory certificates are not present in transaction feeds. | Replaced by **Transaction Flow Genuineness** assessing circular transfer inflation. |

---

## 5. 100-Point Scorecard Framework

| Scorecard Pillar | Max Points | Metric Foundation | Criteria |
|---|---|---|---|
| **1. Income Stability** | 25 pts | `weekly_receipt_cv` + `unique_customers` | CV < 0.20 (15 pts), CV < 0.25 (12 pts), CV < 0.30 (9 pts). Customer base > 1100 (10 pts), > 900 (7 pts). |
| **2. Repayment Capacity** | 30 pts | `repayment_coverage` (DSCR against EMI) | $\ge 2.5\times$ (30 pts), $\ge 2.0\times$ (25 pts), $\ge 1.5\times$ (20 pts), $\ge 1.2\times$ (15 pts), $\ge 1.0\times$ (10 pts), $<1.0\times$ (0 pts). |
| **3. Expense Discipline** | 15 pts | `expense_to_receipt_ratio` | $\le 40\%$ (15 pts), $\le 50\%$ (12 pts), $\le 65\%$ (9 pts), $\le 80\%$ (6 pts), $>80\%$ (2 pts). |
| **4. Business Continuity** | 15 pts | `active_days_ratio` | $\ge 95\%$ (15 pts), $\ge 90\%$ (12 pts), $\ge 80\%$ (8 pts), $<80\%$ (0 pts). |
| **5. Evidence Coverage & Genuineness** | 15 pts | Circular transfer / round-tripping check | Verified genuine transactions (15 pts). Flagged non-genuine circular turnover (0 pts). |

### Underwriting Decision Bands
- **Strong ($\ge 75$ points)**: Approved for requested micro-credit.
- **Moderate ($55 - 74$ points)**: Conditional approval with reduced credit limit.
- **Limited ($35 - 54$ points)**: High risk; requires collateral or guarantor.
- **Insufficient ($< 35$ points)**: Underwriting rejection. Vendors flagged with non-genuine turnover are capped strictly into this band.
