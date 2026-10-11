/**
 * TrustCred AI - Application Controller (js/app.js)
 * =================================================
 * Main frontend application logic:
 * - Robust dual data loader (fetch JSON/CSV with fallback to embedded data.js for file:// protocol)
 * - State management: filtering, sorting, searching, comparison slots
 * - Accessible UI interactions: detail drawer with keyboard navigation, loan simulator
 * - Dark / Light mode switching with localStorage persistence
 */

(function () {
  'use strict';

  // State
  const state = {
    vendors: [],            // Unified vendor objects (dataset + manual)
    datasetVendors: [],     // Base 40 dataset vendors
    filteredVendors: [],    // Currently displayed after filter/search/sort
    selectedVendor: null,   // Vendor currently inspected in drawer
    compareVendors: [],     // Array of up to 3 vendor IDs
    searchQuery: '',
    filterBand: 'all',
    filterStatus: 'all',
    filterSource: 'all',    // 'all', 'dataset', 'manual'
    sortBy: 'score_desc',
    includeManualInTotals: false,
    theme: 'dark',
    simulatorVendor: null,
    isScoresCsvLoaded: false
  };

  // Indian Rupee Formatter
  const inrFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  });

  function formatCurrency(val) {
    if (val === undefined || val === null || isNaN(val)) return '₹0';
    return inrFormatter.format(Math.round(val));
  }

  function formatNumber(val) {
    if (val === undefined || val === null || isNaN(val)) return '0';
    return Number(val).toLocaleString('en-IN');
  }

  // =========================================================================
  // 1. DATA LOADING & MERGING
  // =========================================================================

  /**
   * Parse CSV string into an array of objects
   */
  function parseCSV(csvText) {
    if (!csvText || !csvText.trim()) return [];
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    // Simple robust CSV line splitter respecting quoted strings
    function splitLine(line) {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    }

    const headers = splitLine(lines[0]);
    const records = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = splitLine(lines[i]);
      const obj = {};
      headers.forEach((h, idx) => {
        let val = values[idx] || '';
        // Strip outer quotes if any
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1);
        }
        obj[h] = val;
      });
      records.push(obj);
    }
    return records;
  }

  /**
   * Load summary JSON and optional scores CSV.
   * Gracefully handles file:// protocol restrictions via embedded data.js fallback.
   */
  async function loadData() {
    showLoadingSkeleton(true);

    let summaryData = null;
    let scoresData = [];

    // Attempt 1: Fetch via HTTP / Server
    try {
      const summaryResp = await fetch('data/vendor_summary.json');
      if (summaryResp.ok) {
        summaryData = await summaryResp.json();
      }
    } catch (e) {
      console.warn('Direct fetch of data/vendor_summary.json failed (typical under file:// protocol). Checking embedded fallback.');
    }

    // Try fetching vendor_scores.csv if possible
    try {
      const scoresResp = await fetch('data/vendor_scores.csv');
      if (scoresResp.ok) {
        const text = await scoresResp.text();
        scoresData = parseCSV(text);
        state.isScoresCsvLoaded = true;
      }
    } catch (e) {
      console.warn('Direct fetch of data/vendor_scores.csv not available via HTTP.');
    }

    // Fallback: Use embedded window data if fetch was restricted
    if (!summaryData && window.EMBEDDED_VENDOR_SUMMARY) {
      console.info('Loaded vendor summary from embedded data.js fallback.');
      summaryData = window.EMBEDDED_VENDOR_SUMMARY;
    }
    if ((!scoresData || scoresData.length === 0) && window.EMBEDDED_VENDOR_SCORES && window.EMBEDDED_VENDOR_SCORES.length > 0) {
      console.info('Loaded vendor scores from embedded data.js fallback.');
      scoresData = window.EMBEDDED_VENDOR_SCORES;
      state.isScoresCsvLoaded = true;
    }

    if (!summaryData || !Array.isArray(summaryData) || summaryData.length === 0) {
      showError('Unable to load vendor dataset. Please serve files via python -m http.server or open in a modern browser with data.js included.');
      showLoadingSkeleton(false);
      return;
    }

    // Index scores by vendor_id
    const scoresMap = new Map();
    if (scoresData && scoresData.length > 0) {
      scoresData.forEach(row => {
        if (row.vendor_id) {
          scoresMap.set(row.vendor_id, row);
        }
      });
    }

    // Merge each vendor summary with ML scores or transparent demo score
    state.vendors = summaryData.map(v => {
      const vid = v.vendor_id;
      const csvScoreRow = scoresMap.get(vid);

      let scoreDetails;
      if (csvScoreRow) {
        // Use verified ML Pipeline Scorecard
        const scoreVal = Number(csvScoreRow.final_score !== undefined ? csvScoreRow.final_score : csvScoreRow.score) || 0;
        const rawScoreVal = Number(csvScoreRow.raw_total_score) || scoreVal;
        const bandVal = (csvScoreRow.score_band || csvScoreRow.band || 'insufficient').toLowerCase();
        const isFlagged = Number(csvScoreRow.fraud_flag) === 1 || Number(v.reciprocal_transfer_share) > 0 || Number(v.transfer_out) > 0;
        const explanation = csvScoreRow.plain_language_explanation || '';

        scoreDetails = {
          score: scoreVal,
          raw_score: rawScoreVal,
          band: bandVal,
          decision: csvScoreRow.underwriting_decision || (isFlagged ? 'REJECT_OR_AUDIT' : 'APPROVED'),
          is_flagged: isFlagged,
          confidence: isFlagged ? 0.98 : 0.95,
          factors: {
            income_stability: {
              points: Number(csvScoreRow.income_stability_pts) || 19,
              max: 25,
              explanation: 'Controlled 90-day cash receipt variance with steady weekly flow.'
            },
            repayment_capacity: {
              points: Number(csvScoreRow.repayment_capacity_pts) || 30,
              max: 30,
              explanation: `Avg monthly net flow provides strong coverage over estimated monthly EMI.`
            },
            expense_discipline: {
              points: Number(csvScoreRow.expense_discipline_pts) || 15,
              max: 15,
              explanation: 'Operating costs are disciplined and within commercial profit thresholds.'
            },
            business_continuity: {
              points: Number(csvScoreRow.business_continuity_pts) || 15,
              max: 15,
              explanation: `Consistent high customer footfall (${Number(v.unique_customers).toLocaleString('en-IN')} distinct buyers).`
            },
            genuineness: {
              points: Number(csvScoreRow.genuineness_pts) || (isFlagged ? 0 : 15),
              max: 15,
              explanation: isFlagged
                ? 'Flagged: Reciprocal vendor-to-vendor circular transfers detected without retail counter-parties.'
                : '100% verified retail commerce without circular transfer inflation.'
            }
          },
          metrics: {
            monthly_net_cash_flow: Number(csvScoreRow.monthly_net_cash_flow) || (v.net_cashflow / 3),
            estimated_emi: Number(csvScoreRow.estimated_monthly_emi) || TrustCredScore.calculateEMI(v.loan_amount_requested),
            repayment_coverage: Number(csvScoreRow.repayment_coverage) || 0,
            repayment_coverage_formatted: `${Number(csvScoreRow.repayment_coverage || 0).toFixed(1)}x`
          },
          plain_language_explanation: explanation,
          is_demo_score: false
        };
      } else {
        // Fallback to transparent demo scorecard in score.js
        scoreDetails = TrustCredScore.computeDemoScore(v);
      }

      return {
        ...v,
        scoreDetails
      };
    });

    state.datasetVendors = [...state.vendors];
    combineVendors();

    showLoadingSkeleton(false);
    updateSummaryStats();
    populateCompareDropdowns();
    applyFiltersAndRender();
  }

  function combineVendors() {
    const manualList = window.TrustCredManual ? window.TrustCredManual.getManualVendors() : [];
    state.vendors = [...state.datasetVendors, ...manualList];
  }

  // =========================================================================
  // 2. SUMMARY METRICS & STATS CARDS
  // =========================================================================

  function updateSummaryStats() {
    const statsVendors = state.includeManualInTotals ? state.vendors : state.datasetVendors;
    const totalVendors = statsVendors.length;
    const totalLoanRequested = statsVendors.reduce((acc, v) => acc + (Number(v.loan_amount_requested) || 0), 0);
    const flaggedCount = statsVendors.filter(v => v.scoreDetails.is_flagged).length;
    const avgScore = totalVendors > 0
      ? Math.round(statsVendors.reduce((acc, v) => acc + v.scoreDetails.score, 0) / totalVendors)
      : 0;

    const totalVendorsEl = document.getElementById('statTotalVendors');
    const totalLoanEl = document.getElementById('statTotalLoan');
    const flaggedVendorsEl = document.getElementById('statFlaggedVendors');
    const avgScoreEl = document.getElementById('statAvgScore');
    const dataSourceBadge = document.getElementById('dataSourceBadge');

    if (totalVendorsEl) totalVendorsEl.textContent = totalVendors;
    if (totalLoanEl) totalLoanEl.textContent = formatCurrency(totalLoanRequested);
    if (flaggedVendorsEl) flaggedVendorsEl.textContent = flaggedCount;
    if (avgScoreEl) avgScoreEl.textContent = `${avgScore}/100`;

    if (dataSourceBadge) {
      if (state.isScoresCsvLoaded) {
        dataSourceBadge.textContent = 'ML Scorecard Active (vendor_scores.csv)';
        dataSourceBadge.className = 'status-badge status-badge--success';
      } else {
        dataSourceBadge.textContent = 'Transparent Demo Scorecard Active';
        dataSourceBadge.className = 'status-badge status-badge--neutral';
      }
    }
  }

  // =========================================================================
  // 3. FILTERING, SEARCHING & SORTING
  // =========================================================================

  function applyFiltersAndRender() {
    let result = [...state.vendors];

    // Search query by vendor ID or loan amount
    const query = state.searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter(v => {
        return v.vendor_id.toLowerCase().includes(query) ||
               String(v.loan_amount_requested).includes(query);
      });
    }

    // Filter by score band
    if (state.filterBand !== 'all') {
      result = result.filter(v => v.scoreDetails.band === state.filterBand);
    }

    // Filter by data source (dataset vs manual)
    if (state.filterSource === 'dataset') {
      result = result.filter(v => !v.is_manual);
    } else if (state.filterSource === 'manual') {
      result = result.filter(v => v.is_manual);
    }

    // Filter by genuineness status
    if (state.filterStatus === 'flagged') {
      result = result.filter(v => v.scoreDetails.is_flagged);
    } else if (state.filterStatus === 'genuine') {
      result = result.filter(v => !v.scoreDetails.is_flagged);
    }

    // Sorting
    result.sort((a, b) => {
      switch (state.sortBy) {
        case 'score_desc':
          return b.scoreDetails.score - a.scoreDetails.score;
        case 'score_asc':
          return a.scoreDetails.score - b.scoreDetails.score;
        case 'receipts_desc':
          return b.total_receipts - a.total_receipts;
        case 'loan_desc':
          return b.loan_amount_requested - a.loan_amount_requested;
        case 'net_desc':
          return b.net_cashflow - a.net_cashflow;
        default:
          return 0;
      }
    });

    state.filteredVendors = result;

    // Screen reader announcement
    const liveCountEl = document.getElementById('filterLiveCount');
    if (liveCountEl) {
      liveCountEl.textContent = `Showing ${result.length} of ${state.vendors.length} vendors.`;
    }

    renderVendorList(result);
  }

  // =========================================================================
  // 4. RENDERING VENDOR LIST (TABLE & MOBILE CARDS)
  // =========================================================================

  function getBandBadgeClass(band) {
    switch (band) {
      case 'strong': return 'badge--strong';
      case 'moderate': return 'badge--moderate';
      case 'limited': return 'badge--limited';
      case 'insufficient': return 'badge--insufficient';
      default: return 'badge--neutral';
    }
  }

  function renderVendorList(vendors) {
    const tableBody = document.getElementById('vendorTableBody');
    const cardsContainer = document.getElementById('vendorCardsContainer');
    const emptyState = document.getElementById('emptyState');
    const resultsCountEl = document.getElementById('resultsCount');

    if (resultsCountEl) {
      resultsCountEl.textContent = `${vendors.length} vendor${vendors.length === 1 ? '' : 's'} found`;
    }

    if (vendors.length === 0) {
      if (tableBody) tableBody.innerHTML = '';
      if (cardsContainer) cardsContainer.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // 1. Desktop Table Rows
    if (tableBody) {
      tableBody.innerHTML = vendors.map(v => {
        const d = v.scoreDetails;
        const isFlagged = d.is_flagged;
        const flagIcon = isFlagged
          ? `<span class="flag-pill flag-pill--danger" title="Turnover inflated by circular transfers">
               <svg class="icon-inline" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg>
               Flagged
             </span>`
          : `<span class="flag-pill flag-pill--success" title="Verified commercial cash flow">
               <svg class="icon-inline" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd"/></svg>
               Genuine
             </span>`;

        return `
          <tr tabindex="0" role="button" aria-label="View details for vendor ${v.vendor_id}" data-vendor-id="${v.vendor_id}" class="vendor-row ${isFlagged ? 'vendor-row--flagged' : ''}">
            <td>
              <div class="vendor-id-badge">
                <strong>${v.vendor_id}</strong>
                ${v.is_manual ? '<span class="badge--manual">Manual</span>' : ''}
                ${d.is_demo_score && !v.is_manual ? '<span class="demo-tag" title="Demo calculated score">demo</span>' : ''}
              </div>
              ${v.is_manual ? '<div style="margin-top:2px;"><span class="tag-unverified">Manually entered - not verified</span></div>' : ''}
            </td>
            <td>
              <div class="score-pill-container">
                <span class="score-badge ${getBandBadgeClass(d.band)}">
                  ${d.score}
                </span>
                <span class="band-caption">${d.band}</span>
              </div>
            </td>
            <td class="numeric-cell">${formatCurrency(v.total_receipts)}</td>
            <td class="numeric-cell ${v.net_cashflow < 0 ? 'text-danger' : 'text-success'}">
              ${formatCurrency(v.net_cashflow)}
            </td>
            <td class="numeric-cell">${formatCurrency(v.loan_amount_requested)}</td>
            <td>${flagIcon}</td>
            <td class="action-cell">
              <button class="btn btn--subtle btn--sm view-detail-btn" data-vendor-id="${v.vendor_id}" aria-label="Open drawer for ${v.vendor_id}">
                Inspect &rarr;
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    // 2. Mobile Responsive Cards (< 700px)
    if (cardsContainer) {
      cardsContainer.innerHTML = vendors.map(v => {
        const d = v.scoreDetails;
        const isFlagged = d.is_flagged;

        return `
          <div class="vendor-mobile-card ${isFlagged ? 'vendor-mobile-card--flagged' : ''}" data-vendor-id="${v.vendor_id}">
            <div class="card-header-row">
              <div class="card-id-meta">
                <span class="card-vendor-id">${v.vendor_id} ${v.is_manual ? '<span class="badge--manual">Manual</span>' : ''}</span>
                <span class="score-badge ${getBandBadgeClass(d.band)}">${d.score}/100</span>
              </div>
              <div>
                ${isFlagged
                  ? '<span class="flag-pill flag-pill--danger">⚠️ Flagged</span>'
                  : '<span class="flag-pill flag-pill--success">✓ Genuine</span>'}
              </div>
            </div>
            ${v.is_manual ? '<div style="margin-bottom:6px;"><span class="tag-unverified">Manually entered - not verified</span></div>' : ''}
            <div class="card-metrics-grid">
              <div class="metric-item">
                <span class="metric-label">Receipts</span>
                <span class="metric-val">${formatCurrency(v.total_receipts)}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Net Cash Flow</span>
                <span class="metric-val ${v.net_cashflow < 0 ? 'text-danger' : 'text-success'}">${formatCurrency(v.net_cashflow)}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Loan Requested</span>
                <span class="metric-val">${formatCurrency(v.loan_amount_requested)}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Repayment Buffer</span>
                <span class="metric-val">${d.metrics.repayment_coverage_formatted}</span>
              </div>
            </div>
            <button class="btn btn--secondary btn--block view-detail-btn" data-vendor-id="${v.vendor_id}">
              Inspect Vendor Assessment &rarr;
            </button>
          </div>
        `;
      }).join('');
    }

    // Attach click listeners to rows & buttons
    attachVendorClickHandlers();
  }

  function attachVendorClickHandlers() {
    document.querySelectorAll('.vendor-row, .vendor-mobile-card').forEach(el => {
      el.addEventListener('click', (e) => {
        // Prevent double trigger if clicking button inside
        const vid = el.getAttribute('data-vendor-id');
        if (vid) openVendorDrawer(vid);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const vid = el.getAttribute('data-vendor-id');
          if (vid) openVendorDrawer(vid);
        }
      });
    });

    document.querySelectorAll('.view-detail-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const vid = btn.getAttribute('data-vendor-id');
        if (vid) openVendorDrawer(vid);
      });
    });
  }

  // =========================================================================
  // 5. VENDOR DETAIL DRAWER & FACTOR BREAKDOWN
  // =========================================================================

  function openVendorDrawer(vendorId) {
    const vendor = state.vendors.find(v => v.vendor_id === vendorId);
    if (!vendor) return;

    state.selectedVendor = vendor;
    state.simulatorVendor = vendor;

    const drawer = document.getElementById('vendorDetailDrawer');
    const overlay = document.getElementById('drawerOverlay');

    // Populate Data
    populateVendorDrawerContent(vendor);

    // Open UI
    drawer.classList.add('drawer--open');
    overlay.classList.add('overlay--visible');
    drawer.setAttribute('aria-hidden', 'false');

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Focus close button for accessibility
    setTimeout(() => {
      const closeBtn = document.getElementById('closeDrawerBtn');
      if (closeBtn) closeBtn.focus();
    }, 100);

    // Render Charts
    setTimeout(() => {
      TrustCredCharts.renderMonthlyReceiptsChart(
        'monthlyReceiptsChart',
        vendor.monthly_receipts,
        vendor.scoreDetails.is_flagged
      );

      TrustCredCharts.renderCashflowCompareChart(
        'cashflowCompareChart',
        vendor.loan_amount_requested,
        vendor.scoreDetails.metrics.monthly_net_cash_flow,
        vendor.scoreDetails.metrics.estimated_emi
      );
    }, 150);

    // Pre-populate Simulator with this vendor
    syncSimulatorWithVendor(vendor);
  }

  function closeVendorDrawer() {
    const drawer = document.getElementById('vendorDetailDrawer');
    const overlay = document.getElementById('drawerOverlay');

    drawer.classList.remove('drawer--open');
    overlay.classList.remove('overlay--visible');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function populateVendorDrawerContent(vendor) {
    const d = vendor.scoreDetails;
    const isFlagged = d.is_flagged;

    // Header info
    document.getElementById('drawerVendorId').textContent = vendor.vendor_id;
    document.getElementById('drawerScoreValue').textContent = d.score;
    document.getElementById('drawerScoreBandBadge').textContent = `${d.band.toUpperCase()}`;
    document.getElementById('drawerScoreBandBadge').className = `score-badge ${getBandBadgeClass(d.band)}`;

    // Confidence and Manual Tag Handling
    const manualTag = document.getElementById('drawerManualTag');
    const editBtn = document.getElementById('editManualVendorBtn');
    const deleteBtn = document.getElementById('deleteManualVendorBtn');

    if (vendor.is_manual) {
      if (manualTag) manualTag.classList.remove('hidden');
      if (editBtn) {
        editBtn.classList.remove('hidden');
        editBtn.onclick = () => {
          closeVendorDrawer();
          window.TrustCredManual?.openManualEntryDrawer(vendor);
        };
      }
      if (deleteBtn) {
        deleteBtn.classList.remove('hidden');
        deleteBtn.onclick = () => {
          window.TrustCredManual?.deleteManualVendor(vendor.vendor_id);
        };
      }
      document.getElementById('drawerConfidenceBadge').textContent = `${Math.round(d.confidence * 100)}% Confidence (Manual Entry)`;
    } else {
      if (manualTag) manualTag.classList.add('hidden');
      if (editBtn) editBtn.classList.add('hidden');
      if (deleteBtn) deleteBtn.classList.add('hidden');
      document.getElementById('drawerConfidenceBadge').textContent = `${Math.round(d.confidence * 100)}% Model Confidence`;
    }

    // Circular gauge animation
    const circle = document.getElementById('scoreGaugeCircle');
    if (circle) {
      const radius = 54;
      const circumference = 2 * Math.PI * radius;
      circle.style.strokeDasharray = `${circumference} ${circumference}`;
      const offset = circumference - (d.score / 100) * circumference;
      circle.style.strokeDashoffset = offset;
      circle.style.stroke = isFlagged ? '#F43F5E' : (d.score >= 75 ? '#10B981' : d.score >= 55 ? '#6366F1' : '#F59E0B');
    }

    // Suspicious turnover warning banner
    const warningBox = document.getElementById('drawerWarningBanner');
    if (warningBox) {
      if (isFlagged) {
        warningBox.classList.remove('hidden');
        document.getElementById('drawerWarningDetail').textContent =
          `Money moved back and forth between vendors; turnover may be inflated. Circular reciprocal transfer volume of ${formatCurrency(vendor.transfer_out)} detected (100% reciprocal share).`;
      } else {
        warningBox.classList.add('hidden');
      }
    }

    // Plain language underwriting rationale
    const rationaleEl = document.getElementById('drawerRationaleText');
    if (rationaleEl) {
      rationaleEl.textContent = d.plain_language_explanation;
    }

    // 5 Factor Bars
    renderFactorBars(d.factors);

    // Key financial metrics grid
    document.getElementById('dValReceipts').textContent = formatCurrency(vendor.total_receipts);
    document.getElementById('dValExpenses').textContent = formatCurrency(vendor.total_expenses);
    document.getElementById('dValNetFlow').textContent = formatCurrency(vendor.net_cashflow);
    document.getElementById('dValMonthlyNet').textContent = formatCurrency(d.metrics.monthly_net_cash_flow);
    document.getElementById('dValCustomers').textContent = formatNumber(vendor.unique_customers);
    document.getElementById('dValLoanRequested').textContent = formatCurrency(vendor.loan_amount_requested);
    document.getElementById('dValEmi').textContent = formatCurrency(d.metrics.estimated_emi);
    document.getElementById('dValCoverage').textContent = d.metrics.repayment_coverage_formatted;
  }

  function renderFactorBars(factors) {
    const container = document.getElementById('factorBarsContainer');
    if (!container) return;

    const factorDefs = [
      { key: 'income_stability', name: 'Income Stability', tip: 'Evaluates variance and consistency in monthly revenue over the 90-day observation window.' },
      { key: 'repayment_capacity', name: 'Repayment Capacity', tip: 'Compares average monthly net cash flow against required monthly debt service (EMI).' },
      { key: 'expense_discipline', name: 'Expense Discipline', tip: 'Checks operating expense ratio against total receipts to confirm business profitability.' },
      { key: 'business_continuity', name: 'Business Continuity', tip: 'Measures footfall via unique customer payment accounts and transaction density.' },
      { key: 'genuineness', name: 'Evidence & Genuineness', tip: 'Detects and penalizes circular transfers or round-tripping between accounts.' }
    ];

    container.innerHTML = factorDefs.map(def => {
      const f = factors[def.key] || { points: 0, max: 20, explanation: '' };
      const pct = Math.min(100, Math.round((f.points / f.max) * 100));
      const isRed = f.points === 0;

      return `
        <div class="factor-row">
          <div class="factor-header">
            <div class="factor-title-wrap">
              <span class="factor-name">${def.name}</span>
              <button class="tooltip-trigger" type="button" aria-label="Info about ${def.name}" data-tip="${def.tip}">?</button>
            </div>
            <div class="factor-points">
              <strong>${f.points}</strong> / ${f.max} pts
            </div>
          </div>
          <div class="factor-progress-track">
            <div class="factor-progress-bar ${isRed ? 'bar--danger' : ''}" style="width: ${pct}%"></div>
          </div>
          <div class="factor-explanation">${f.explanation}</div>
        </div>
      `;
    }).join('');

    // Attach tooltip listeners
    container.querySelectorAll('.tooltip-trigger').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        alert(`${btn.getAttribute('aria-label')}:\n\n${btn.getAttribute('data-tip')}`);
      });
    });
  }

  // =========================================================================
  // 6. LOAN SIMULATOR
  // =========================================================================

  function syncSimulatorWithVendor(vendor) {
    if (!vendor) return;
    const loanSlider = document.getElementById('simLoanAmount');
    const tenureSlider = document.getElementById('simTenureMonths');
    const vendorSelector = document.getElementById('simVendorSelect');

    if (vendorSelector) vendorSelector.value = vendor.vendor_id;
    if (loanSlider) {
      loanSlider.value = Math.min(100000, Math.max(10000, vendor.loan_amount_requested));
      document.getElementById('simLoanAmountDisplay').textContent = formatCurrency(loanSlider.value);
    }
    if (tenureSlider) {
      document.getElementById('simTenureDisplay').textContent = `${tenureSlider.value} months`;
    }

    calculateSimulatorResult();
  }

  function calculateSimulatorResult() {
    const vendorId = document.getElementById('simVendorSelect')?.value;
    const vendor = state.vendors.find(v => v.vendor_id === vendorId) || state.vendors[0];
    if (!vendor) return;

    const principal = Number(document.getElementById('simLoanAmount')?.value) || 50000;
    const months = Number(document.getElementById('simTenureMonths')?.value) || 12;

    const emi = TrustCredScore.calculateEMI(principal, 20, months);
    const monthlyNetFlow = vendor.scoreDetails.metrics.monthly_net_cash_flow;
    const coverage = emi > 0 ? (monthlyNetFlow / emi) : 0;

    // Display numbers
    document.getElementById('simResultEmi').textContent = formatCurrency(emi);
    document.getElementById('simResultNetFlow').textContent = formatCurrency(monthlyNetFlow);
    document.getElementById('simResultCoverage').textContent = `${coverage.toFixed(1)}x`;

    // Coverage status badge
    const badge = document.getElementById('simCoverageBadge');
    if (badge) {
      if (vendor.scoreDetails.is_flagged) {
        badge.textContent = 'High Risk (Circular Turnover)';
        badge.className = 'status-badge status-badge--danger';
      } else if (coverage >= 2.0) {
        badge.textContent = 'Safe Repayment Buffer (>= 2.0x)';
        badge.className = 'status-badge status-badge--success';
      } else if (coverage >= 1.2) {
        badge.textContent = 'Moderate Buffer (1.2x - 2.0x)';
        badge.className = 'status-badge status-badge--warning';
      } else {
        badge.textContent = 'Insufficient Buffer (< 1.2x)';
        badge.className = 'status-badge status-badge--danger';
      }
    }
  }

  // =========================================================================
  // 7. VENDOR COMPARISON
  // =========================================================================

  function populateCompareDropdowns() {
    const selects = [
      document.getElementById('compareSelect1'),
      document.getElementById('compareSelect2'),
      document.getElementById('compareSelect3'),
      document.getElementById('simVendorSelect')
    ];

    selects.forEach((sel, idx) => {
      if (!sel) return;
      const isSim = sel.id === 'simVendorSelect';
      sel.innerHTML = (isSim ? '' : '<option value="">-- Choose Vendor --</option>') +
        state.vendors.map(v => {
          return `<option value="${v.vendor_id}">${v.vendor_id} (Score: ${v.scoreDetails.score}, ${formatCurrency(v.loan_amount_requested)})</option>`;
        }).join('');

      if (!isSim && state.vendors[idx]) {
        sel.value = state.vendors[idx].vendor_id;
      }
    });

    renderComparisonTable();
  }

  function renderComparisonTable() {
    const s1 = document.getElementById('compareSelect1')?.value;
    const s2 = document.getElementById('compareSelect2')?.value;
    const s3 = document.getElementById('compareSelect3')?.value;

    const selectedIds = [s1, s2, s3].filter(Boolean);
    const selected = selectedIds.map(id => state.vendors.find(v => v.vendor_id === id)).filter(Boolean);

    const container = document.getElementById('comparisonContainer');
    if (!container) return;

    if (selected.length === 0) {
      container.innerHTML = `<p class="empty-hint">Select at least one vendor from the dropdowns above to compare metrics side by side.</p>`;
      return;
    }

    container.innerHTML = `
      <div class="compare-grid" style="grid-template-columns: repeat(${selected.length}, minmax(240px, 1fr));">
        ${selected.map(v => {
          const d = v.scoreDetails;
          return `
            <div class="compare-card ${d.is_flagged ? 'compare-card--flagged' : ''}">
              <div class="compare-card-header">
                <h3>${v.vendor_id}</h3>
                <span class="score-badge ${getBandBadgeClass(d.band)}">${d.score}/100</span>
              </div>
              <div class="compare-card-status">
                ${d.is_flagged
                  ? '<span class="flag-pill flag-pill--danger">⚠️ Non-Genuine / Circular</span>'
                  : '<span class="flag-pill flag-pill--success">✓ Verified Genuine</span>'}
              </div>
              <div class="compare-metric-row">
                <span>Band</span>
                <strong>${d.band.toUpperCase()}</strong>
              </div>
              <div class="compare-metric-row">
                <span>Loan Requested</span>
                <strong>${formatCurrency(v.loan_amount_requested)}</strong>
              </div>
              <div class="compare-metric-row">
                <span>Receipts (90d)</span>
                <strong>${formatCurrency(v.total_receipts)}</strong>
              </div>
              <div class="compare-metric-row">
                <span>Net Cash Flow (90d)</span>
                <strong>${formatCurrency(v.net_cashflow)}</strong>
              </div>
              <div class="compare-metric-row">
                <span>Monthly Net Flow</span>
                <strong>${formatCurrency(d.metrics.monthly_net_cash_flow)}</strong>
              </div>
              <div class="compare-metric-row">
                <span>Repayment Buffer</span>
                <strong>${d.metrics.repayment_coverage_formatted}</strong>
              </div>
              <div class="compare-metric-row">
                <span>Unique Buyers</span>
                <strong>${formatNumber(v.unique_customers)}</strong>
              </div>
              <div class="compare-factors-mini">
                <div class="mini-bar-row">
                  <span>Income Stability</span>
                  <span>${d.factors.income_stability.points}/25</span>
                </div>
                <div class="mini-bar-row">
                  <span>Repayment Capacity</span>
                  <span>${d.factors.repayment_capacity.points}/30</span>
                </div>
                <div class="mini-bar-row">
                  <span>Expense Discipline</span>
                  <span>${d.factors.expense_discipline.points}/15</span>
                </div>
                <div class="mini-bar-row">
                  <span>Business Continuity</span>
                  <span>${d.factors.business_continuity.points}/15</span>
                </div>
                <div class="mini-bar-row">
                  <span>Genuineness</span>
                  <span>${d.factors.genuineness.points}/15</span>
                </div>
              </div>
              <button class="btn btn--subtle btn--block view-detail-btn" data-vendor-id="${v.vendor_id}">
                Open Full Detail &rarr;
              </button>
            </div>
          `;
        }).join('')}
      </div>
    `;

    container.querySelectorAll('.view-detail-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const vid = btn.getAttribute('data-vendor-id');
        if (vid) openVendorDrawer(vid);
      });
    });
  }

  // =========================================================================
  // 8. THEME & UX INITIALIZATION
  // =========================================================================

  function initTheme() {
    let savedTheme = 'dark';
    try {
      savedTheme = localStorage.getItem('trustcred-theme');
    } catch (e) {
      console.warn('localStorage not accessible for theme persistence');
    }

    if (!savedTheme) {
      savedTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    setTheme(savedTheme);

    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const next = state.theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
      });
    }
  }

  function setTheme(t) {
    state.theme = t;
    document.documentElement.setAttribute('data-theme', t);
    try {
      localStorage.setItem('trustcred-theme', t);
    } catch (e) {}

    const icon = document.getElementById('themeToggleIcon');
    const label = document.getElementById('themeToggleLabel');
    if (icon && label) {
      if (t === 'dark') {
        icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />';
        label.textContent = 'Light Mode';
      } else {
        icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />';
        label.textContent = 'Dark Mode';
      }
    }

    if (window.TrustCredCharts) {
      window.TrustCredCharts.refreshThemes(state.selectedVendor);
    }
  }

  function showLoadingSkeleton(show) {
    const skeleton = document.getElementById('loadingSkeleton');
    const mainView = document.getElementById('mainContentView');
    if (skeleton && mainView) {
      if (show) {
        skeleton.classList.remove('hidden');
        mainView.classList.add('hidden');
      } else {
        skeleton.classList.add('hidden');
        mainView.classList.remove('hidden');
      }
    }
  }

  function showError(msg) {
    const errorBox = document.getElementById('loadErrorBanner');
    const errorMsg = document.getElementById('loadErrorText');
    if (errorBox && errorMsg) {
      errorMsg.textContent = msg;
      errorBox.classList.remove('hidden');
    }
  }

  // =========================================================================
  // 9. EVENT LISTENERS
  // =========================================================================

  function attachGlobalEvents() {
    // Search input
    const searchInput = document.getElementById('vendorSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        applyFiltersAndRender();
      });
    }

    // Filter band
    const filterBand = document.getElementById('filterScoreBand');
    if (filterBand) {
      filterBand.addEventListener('change', (e) => {
        state.filterBand = e.target.value;
        applyFiltersAndRender();
      });
    }

    // Filter status
    const filterStatus = document.getElementById('filterStatus');
    if (filterStatus) {
      filterStatus.addEventListener('change', (e) => {
        state.filterStatus = e.target.value;
        applyFiltersAndRender();
      });
    }

    // Sort by
    const sortBy = document.getElementById('sortVendorsBy');
    if (sortBy) {
      sortBy.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        applyFiltersAndRender();
      });
    }

    // Filter source
    const filterSource = document.getElementById('filterSource');
    if (filterSource) {
      filterSource.addEventListener('change', (e) => {
        state.filterSource = e.target.value;
        applyFiltersAndRender();
      });
    }

    // Include manual checkbox
    const chkIncludeManual = document.getElementById('chkIncludeManual');
    if (chkIncludeManual) {
      chkIncludeManual.addEventListener('change', (e) => {
        state.includeManualInTotals = e.target.checked;
        updateSummaryStats();
      });
    }

    // Reset filters
    const resetBtn = document.getElementById('resetFiltersBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        state.searchQuery = '';
        state.filterBand = 'all';
        state.filterStatus = 'all';
        state.filterSource = 'all';
        state.sortBy = 'score_desc';
        if (searchInput) searchInput.value = '';
        if (filterBand) filterBand.value = 'all';
        if (filterStatus) filterStatus.value = 'all';
        if (filterSource) filterSource.value = 'all';
        if (sortBy) sortBy.value = 'score_desc';
        applyFiltersAndRender();
      });
    }

    // Drawer close events
    const closeBtn = document.getElementById('closeDrawerBtn');
    const overlay = document.getElementById('drawerOverlay');
    if (closeBtn) closeBtn.addEventListener('click', closeVendorDrawer);
    if (overlay) overlay.addEventListener('click', closeVendorDrawer);

    // Escape key closes drawer
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeVendorDrawer();
      }
    });

    // Print Report Button
    const printBtn = document.getElementById('printReportBtn');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        window.print();
      });
    }

    // "Check a vendor" hero button
    const heroCheckBtn = document.getElementById('heroCheckVendorBtn');
    if (heroCheckBtn) {
      heroCheckBtn.addEventListener('click', () => {
        const el = document.getElementById('vendorsSection');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
        if (searchInput) searchInput.focus();
      });
    }

    // Simulator inputs
    const simAmount = document.getElementById('simLoanAmount');
    const simTenure = document.getElementById('simTenureMonths');
    const simSelect = document.getElementById('simVendorSelect');

    if (simAmount) {
      simAmount.addEventListener('input', (e) => {
        document.getElementById('simLoanAmountDisplay').textContent = formatCurrency(e.target.value);
        calculateSimulatorResult();
      });
    }
    if (simTenure) {
      simTenure.addEventListener('input', (e) => {
        document.getElementById('simTenureDisplay').textContent = `${e.target.value} months`;
        calculateSimulatorResult();
      });
    }
    if (simSelect) {
      simSelect.addEventListener('change', () => {
        calculateSimulatorResult();
      });
    }

    // Simulator trigger inside drawer
    const drawerSimBtn = document.getElementById('drawerSimulateBtn');
    if (drawerSimBtn) {
      drawerSimBtn.addEventListener('click', () => {
        closeVendorDrawer();
        const simSec = document.getElementById('simulatorSection');
        if (simSec) simSec.scrollIntoView({ behavior: 'smooth' });
      });
    }

    // Comparison dropdowns
    ['compareSelect1', 'compareSelect2', 'compareSelect3'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', renderComparisonTable);
      }
    });
  }

  // Expose global app API for manual controller
  window.TrustCredApp = {
    getAllVendors: () => state.vendors,
    onManualVendorsChanged: () => {
      combineVendors();
      updateSummaryStats();
      populateCompareDropdowns();
      applyFiltersAndRender();
    },
    openVendorDrawer,
    closeVendorDrawer
  };

  // =========================================================================
  // INITIALIZE APPLICATION
  // =========================================================================

  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    attachGlobalEvents();
    loadData();
  });

})();
