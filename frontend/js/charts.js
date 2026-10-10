/**
 * TrustCred AI - Charts Controller (js/charts.js)
 * ==============================================
 * Renders interactive visual analytics using Chart.js:
 * 1. Monthly Receipts Trend (Line & Bar)
 * 2. Loan Amount vs 3-Month Net Cash Flow Bar
 * 3. 5-Pillar Scorecard Radar / Breakdown Bar
 *
 * Fully supports dark/light mode switches, responsiveness,
 * and prefers-reduced-motion.
 */

const TrustCredCharts = (function() {
  'use strict';

  // Active chart instances
  let monthlyChartInstance = null;
  let cashflowCompareChartInstance = null;
  let factorRadarChartInstance = null;

  /**
   * Determine current chart theme colors based on html theme attribute.
   */
  function getThemeColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      textColor: isDark ? '#E2E8F0' : '#1E293B',
      mutedColor: isDark ? '#94A3B8' : '#64748B',
      gridColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      cardBg: isDark ? '#1E293B' : '#FFFFFF',
      primary: '#6366F1',
      primaryLight: isDark ? 'rgba(99, 102, 241, 0.25)' : 'rgba(99, 102, 241, 0.15)',
      emerald: '#10B981',
      emeraldLight: isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.15)',
      rose: '#F43F5E',
      roseLight: isDark ? 'rgba(244, 63, 94, 0.25)' : 'rgba(244, 63, 94, 0.15)',
      amber: '#F59E0B'
    };
  }

  /**
   * Format numbers as Indian Rupee strings
   */
  function formatINR(val) {
    return '₹' + Math.round(val).toLocaleString('en-IN');
  }

  /**
   * Render monthly receipts bar/line chart
   */
  function renderMonthlyReceiptsChart(canvasId, monthlyReceipts, isSuspicious = false) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    if (monthlyChartInstance) {
      monthlyChartInstance.destroy();
      monthlyChartInstance = null;
    }

    const theme = getThemeColors();
    const months = ['2026-07', '2026-08', '2026-09'];
    const monthLabels = ['July 2026', 'August 2026', 'September 2026'];
    const dataValues = months.map(m => (monthlyReceipts && monthlyReceipts[m]) ? Number(monthlyReceipts[m]) : 0);

    const primaryColor = isSuspicious ? theme.rose : theme.primary;
    const bgColor = isSuspicious ? theme.roseLight : theme.primaryLight;

    const ctx = canvas.getContext('2d');
    monthlyChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthLabels,
        datasets: [
          {
            type: 'bar',
            label: 'Monthly Receipts (₹)',
            data: dataValues,
            backgroundColor: bgColor,
            borderColor: primaryColor,
            borderWidth: 2,
            borderRadius: 8,
            order: 2
          },
          {
            type: 'line',
            label: 'Receipt Trend',
            data: dataValues,
            borderColor: isSuspicious ? '#E11D48' : '#4F46E5',
            backgroundColor: 'transparent',
            pointBackgroundColor: isSuspicious ? '#E11D48' : '#4F46E5',
            pointRadius: 5,
            pointHoverRadius: 7,
            borderWidth: 3,
            tension: 0.3,
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: theme.cardBg,
            titleColor: theme.textColor,
            bodyColor: theme.textColor,
            borderColor: theme.gridColor,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: function(context) {
                return ` ${context.dataset.label}: ${formatINR(context.raw)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: theme.mutedColor,
              font: { family: "'Inter', sans-serif", size: 12 }
            }
          },
          y: {
            grid: {
              color: theme.gridColor
            },
            ticks: {
              color: theme.mutedColor,
              font: { family: "'Inter', sans-serif", size: 11 },
              callback: function(val) {
                return '₹' + (val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val);
              }
            }
          }
        }
      }
    });
  }

  /**
   * Render Loan Request vs Monthly Net Cash Flow comparison chart
   */
  function renderCashflowCompareChart(canvasId, loanRequested, monthlyNetCashFlow, estimatedEmi) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    if (cashflowCompareChartInstance) {
      cashflowCompareChartInstance.destroy();
      cashflowCompareChartInstance = null;
    }

    const theme = getThemeColors();
    const ctx = canvas.getContext('2d');

    cashflowCompareChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Loan Requested', 'Avg Monthly Net Flow', 'Est. Monthly EMI (12m)'],
        datasets: [{
          data: [loanRequested, monthlyNetCashFlow, estimatedEmi],
          backgroundColor: [
            'rgba(99, 102, 241, 0.75)',
            'rgba(16, 185, 129, 0.75)',
            'rgba(245, 158, 11, 0.75)'
          ],
          borderColor: [
            '#4F46E5',
            '#059669',
            '#D97706'
          ],
          borderWidth: 2,
          borderRadius: 8
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.cardBg,
            titleColor: theme.textColor,
            bodyColor: theme.textColor,
            borderColor: theme.gridColor,
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                return ` ${formatINR(context.raw)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: theme.gridColor },
            ticks: {
              color: theme.mutedColor,
              callback: function(val) {
                return '₹' + (val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val);
              }
            }
          },
          y: {
            grid: { display: false },
            ticks: {
              color: theme.textColor,
              font: { family: "'Inter', sans-serif", weight: '500' }
            }
          }
        }
      }
    });
  }

  /**
   * Re-render active charts when theme (light/dark) changes.
   */
  function refreshThemes(currentVendor) {
    if (monthlyChartInstance && currentVendor) {
      renderMonthlyReceiptsChart(
        'monthlyReceiptsChart',
        currentVendor.monthly_receipts,
        currentVendor.scoreDetails?.is_flagged
      );
    }
    if (cashflowCompareChartInstance && currentVendor) {
      renderCashflowCompareChart(
        'cashflowCompareChart',
        currentVendor.loan_amount_requested,
        currentVendor.scoreDetails?.metrics?.monthly_net_cash_flow || (currentVendor.net_cashflow / 3),
        currentVendor.scoreDetails?.metrics?.estimated_emi || 0
      );
    }
  }

  return {
    renderMonthlyReceiptsChart,
    renderCashflowCompareChart,
    refreshThemes
  };
})();

window.TrustCredCharts = TrustCredCharts;
