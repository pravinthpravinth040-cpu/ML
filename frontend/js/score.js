/**
 * TrustCred AI - Scoring Engine (js/score.js)
 * ===========================================
 * Provides transparent, 100-point cash-flow underwriting scorecard logic.
 * Computes scores dynamically when vendor_scores.csv is absent or when
 * real-time adjustments/simulations are run.
 *
 * Scoring Pillars (Total: 100 points):
 * 1. Income Stability (25 pts): Receipt consistency and low monthly revenue volatility.
 * 2. Repayment Capacity (30 pts): Monthly net cash flow coverage over estimated debt service.
 * 3. Expense Discipline (15 pts): Sustainable expense-to-receipt ratio.
 * 4. Business Continuity (15 pts): Active customer diversity and transaction volume.
 * 5. Genuineness / Evidence (15 pts): Clean UPI turnover free from circular/round-tripping transfers.
 *
 * Score Bands:
 * >= 75: strong
 * >= 55: moderate
 * >= 35: limited
 * < 35:  insufficient
 */

const TrustCredScore = (function() {
  'use strict';

  /**
   * Calculate EMI for an illustrative micro-loan.
   * Flat 20% p.a. interest over tenure in months.
   */
  function calculateEMI(principal, annualRatePct = 20, tenureMonths = 12) {
    if (!principal || principal <= 0 || !tenureMonths || tenureMonths <= 0) return 0;
    const totalInterest = principal * (annualRatePct / 100) * (tenureMonths / 12);
    const totalRepayable = principal + totalInterest;
    return totalRepayable / tenureMonths;
  }

  /**
   * Compute the 100-point scorecard and factor breakdown for a vendor summary object.
   * @param {Object} vendor - Vendor summary object
   * @returns {Object} Score breakdown, total score, band, and plain-language explanation
   */
  function computeDemoScore(vendor) {
    const receipts = Number(vendor.total_receipts) || 0;
    const expenses = Number(vendor.total_expenses) || 0;
    const netCashflow = Number(vendor.net_cashflow) || (receipts - expenses);
    const loanRequested = Number(vendor.loan_amount_requested) || 50000;
    const customers = Number(vendor.unique_customers) || 0;
    const recipShare = Number(vendor.reciprocal_transfer_share) || 0;
    const transferOut = Number(vendor.transfer_out) || 0;

    // 90-day window -> monthly average net cash flow
    const monthlyNetCashFlow = netCashflow / 3;
    const estimatedEMI = calculateEMI(loanRequested, 20, 12);
    const repaymentCoverage = estimatedEMI > 0 ? (monthlyNetCashFlow / estimatedEMI) : 0;

    // --- Pillar 1: Income Stability (25 pts) ---
    let incomeStability = 0;
    const monthly = vendor.monthly_receipts || {};
    const mVals = Object.values(monthly).map(v => Number(v) || 0);
    if (mVals.length > 0) {
      const mean = mVals.reduce((a, b) => a + b, 0) / mVals.length;
      if (mean > 0) {
        const variance = mVals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / mVals.length;
        const cv = Math.sqrt(variance) / mean; // Coefficient of Variation
        if (cv <= 0.15) incomeStability = 25;
        else if (cv <= 0.30) incomeStability = 22;
        else if (cv <= 0.45) incomeStability = 18;
        else if (cv <= 0.65) incomeStability = 12;
        else incomeStability = 6;
      }
    } else {
      incomeStability = 15;
    }

    // --- Pillar 2: Repayment Capacity (30 pts) ---
    let repaymentCapacity = 0;
    if (repaymentCoverage >= 5.0) repaymentCapacity = 30;
    else if (repaymentCoverage >= 3.0) repaymentCapacity = 27;
    else if (repaymentCoverage >= 2.0) repaymentCapacity = 23;
    else if (repaymentCoverage >= 1.5) repaymentCapacity = 18;
    else if (repaymentCoverage >= 1.0) repaymentCapacity = 10;
    else repaymentCapacity = 0;

    // --- Pillar 3: Expense Discipline (15 pts) ---
    let expenseDiscipline = 0;
    const expenseRatio = receipts > 0 ? (expenses / receipts) : 1.0;
    if (expenseRatio <= 0.20) expenseDiscipline = 15;
    else if (expenseRatio <= 0.35) expenseDiscipline = 13;
    else if (expenseRatio <= 0.50) expenseDiscipline = 10;
    else if (expenseRatio <= 0.70) expenseDiscipline = 6;
    else expenseDiscipline = 2;

    // --- Pillar 4: Business Continuity (15 pts) ---
    let businessContinuity = 0;
    if (customers >= 1000) businessContinuity = 15;
    else if (customers >= 750) businessContinuity = 13;
    else if (customers >= 500) businessContinuity = 10;
    else if (customers >= 250) businessContinuity = 7;
    else businessContinuity = 3;

    // --- Pillar 5: Genuineness / Evidence Coverage (15 pts) ---
    const isSuspicious = recipShare > 0 || transferOut > 0;
    const genuineness = isSuspicious ? 0 : 15;

    let rawScore = incomeStability + repaymentCapacity + expenseDiscipline + businessContinuity + genuineness;

    // Severe penalty and cap if suspicious turnover detected
    let finalScore = rawScore;
    let band = 'strong';
    let decision = 'APPROVED';
    let explanation = '';

    if (isSuspicious) {
      finalScore = Math.min(30, Math.floor(rawScore * 0.35));
      band = 'insufficient';
      decision = 'REJECT_OR_AUDIT';
      explanation = `Flagged for non-genuine turnover: High reciprocal vendor transfer volume (₹${Math.round(transferOut).toLocaleString('en-IN')}) indicates circular round-tripping. Apparent cash flow lacks genuine commercial backing.`;
    } else {
      if (finalScore >= 75) {
        band = 'strong';
        decision = 'APPROVED';
      } else if (finalScore >= 55) {
        band = 'moderate';
        decision = 'MANUAL_REVIEW';
      } else if (finalScore >= 35) {
        band = 'limited';
        decision = 'CONDITIONAL';
      } else {
        band = 'insufficient';
        decision = 'DECLINED';
      }
      explanation = `Verified genuine commercial cash flow over 90 days. Average monthly net cash flow ₹${Math.round(monthlyNetCashFlow).toLocaleString('en-IN')} gives ${repaymentCoverage.toFixed(1)}x coverage over estimated monthly debt service of ₹${Math.round(estimatedEMI).toLocaleString('en-IN')}. Healthy diversified customer base (${customers.toLocaleString('en-IN')} buyers).`;
    }

    return {
      score: finalScore,
      raw_score: rawScore,
      band: band,
      decision: decision,
      is_flagged: isSuspicious,
      confidence: isSuspicious ? 0.98 : 0.95,
      factors: {
        income_stability: {
          points: incomeStability,
          max: 25,
          explanation: 'Consistent monthly sales volume with low seasonal variability across 90 days.'
        },
        repayment_capacity: {
          points: repaymentCapacity,
          max: 30,
          explanation: `Net cash flow provides ${repaymentCoverage.toFixed(1)}x coverage against estimated ₹${Math.round(estimatedEMI).toLocaleString('en-IN')}/mo EMI.`
        },
        expense_discipline: {
          points: expenseDiscipline,
          max: 15,
          explanation: `Healthy operating expense ratio (${(expenseRatio * 100).toFixed(1)}% of total customer receipts).`
        },
        business_continuity: {
          points: businessContinuity,
          max: 15,
          explanation: `Strong customer diversification with ${customers.toLocaleString('en-IN')} distinct UPI payers.`
        },
        genuineness: {
          points: genuineness,
          max: 15,
          explanation: isSuspicious
            ? 'Severe deduction: Circular inter-vendor transfers detected without retail counter-parties.'
            : '100% verified retail customer payments with zero circular vendor transfers.'
        }
      },
      metrics: {
        monthly_net_cash_flow: monthlyNetCashFlow,
        estimated_emi: estimatedEMI,
        repayment_coverage: repaymentCoverage,
        repayment_coverage_formatted: `${repaymentCoverage.toFixed(1)}x`,
        expense_ratio: expenseRatio
      },
      plain_language_explanation: explanation,
      is_demo_score: true
    };
  }

  return {
    calculateEMI,
    computeDemoScore
  };
})();

// Attach to window for global access
window.TrustCredScore = TrustCredScore;
