/**
 * TrustCred AI - Manual Vendor Controller (js/manual.js)
 * ======================================================
 * Manages manual vendor entry (Quick form and Advanced transaction CSV parser),
 * inline validation, live debounced score preview, localStorage synchronization,
 * undo toasts, export/import, and integration with TrustCredScore.
 */

const TrustCredManual = (function () {
  'use strict';

  const STORAGE_KEY = 'trustcred_manual_vendors';
  let memoryManualVendors = [];
  let isStorageAvailable = true;
  let undoTimeoutId = null;
  let lastDeletedVendor = null;
  let previewDebounceTimer = null;
  let activeTab = 'quick'; // 'quick' or 'txns'
  let parsedCsvVendorData = null;

  // Initialize storage availability check
  try {
    const testKey = '__tc_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      memoryManualVendors = JSON.parse(saved);
    }
  } catch (e) {
    isStorageAvailable = false;
    console.warn('LocalStorage unavailable. Manual vendors will be held in session memory only.', e);
  }

  /**
   * Save current manual vendors to localStorage or memory.
   */
  function saveToStorage() {
    if (isStorageAvailable) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryManualVendors));
      } catch (e) {
        console.error('Failed to write manual vendors to localStorage:', e);
      }
    }
  }

  /**
   * Get all manual vendor objects.
   */
  function getManualVendors() {
    return memoryManualVendors;
  }

  /**
   * Suggest next available vendor ID (e.g. M001, M002...)
   */
  function suggestNextId(allExistingVendors = []) {
    const existingIds = new Set(allExistingVendors.map(v => v.vendor_id.toUpperCase()));
    let num = 1;
    while (num <= 999) {
      const candidate = 'M' + String(num).padStart(3, '0');
      if (!existingIds.has(candidate)) return candidate;
      num++;
    }
    return 'M999';
  }

  /**
   * Format currency helper
   */
  function inr(n) {
    return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
  }

  // =========================================================================
  // 1. MODAL & DRAWER OPEN / CLOSE
  // =========================================================================

  function openManualEntryDrawer(vendorToEdit = null) {
    const drawer = document.getElementById('manualEntryDrawer');
    const overlay = document.getElementById('drawerOverlay');
    if (!drawer) return;

    resetManualForm();

    if (vendorToEdit) {
      populateFormForEdit(vendorToEdit);
      document.getElementById('manualDrawerTitle').textContent = `Edit Vendor ${vendorToEdit.vendor_id}`;
    } else {
      const suggested = suggestNextId(window.TrustCredApp?.getAllVendors() || []);
      const idInput = document.getElementById('manVendorId');
      if (idInput) idInput.value = suggested;
      document.getElementById('manualDrawerTitle').textContent = 'Add Vendor Manually';
    }

    drawer.classList.add('drawer--open');
    if (overlay) overlay.classList.add('overlay--visible');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Focus first input
    setTimeout(() => {
      const first = document.getElementById('manVendorId');
      if (first) first.focus();
      updateLiveScorePreview();
    }, 120);
  }

  function closeManualEntryDrawer() {
    const drawer = document.getElementById('manualEntryDrawer');
    const overlay = document.getElementById('drawerOverlay');
    if (drawer) {
      drawer.classList.remove('drawer--open');
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (overlay) {
      overlay.classList.remove('overlay--visible');
    }
    document.body.style.overflow = '';
  }

  // =========================================================================
  // 2. FORM TAB SWITCHING & RESET
  // =========================================================================

  function switchTab(tabName) {
    activeTab = tabName;
    const tabQuickBtn = document.getElementById('tabBtnQuick');
    const tabTxnBtn = document.getElementById('tabBtnTxns');
    const panelQuick = document.getElementById('panelQuickEntry');
    const panelTxn = document.getElementById('panelTxnEntry');

    if (tabName === 'quick') {
      tabQuickBtn?.classList.add('tab--active');
      tabTxnBtn?.classList.remove('tab--active');
      panelQuick?.classList.remove('hidden');
      panelTxn?.classList.add('hidden');
    } else {
      tabTxnBtn?.classList.add('tab--active');
      tabQuickBtn?.classList.remove('tab--active');
      panelTxn?.classList.remove('hidden');
      panelQuick?.classList.add('hidden');
    }
    updateLiveScorePreview();
  }

  function resetManualForm() {
    const form = document.getElementById('manualVendorForm');
    if (form) form.reset();
    document.querySelectorAll('.field-error-text, .field-warning-text').forEach(el => el.remove());
    document.querySelectorAll('.is-invalid, .is-warning').forEach(el => el.classList.remove('is-invalid', 'is-warning'));
    parsedCsvVendorData = null;
    const previewBox = document.getElementById('csvPreviewContainer');
    if (previewBox) previewBox.innerHTML = '';
    switchTab('quick');
  }

  function populateFormForEdit(v) {
    document.getElementById('manVendorId').value = v.vendor_id;
    document.getElementById('manVendorId').setAttribute('readonly', 'true');
    document.getElementById('manLoanAmount').value = v.loan_amount_requested;

    const m = v.monthly_receipts || {};
    document.getElementById('manSalesM1').value = m['2026-07'] || '';
    document.getElementById('manSalesM2').value = m['2026-08'] || '';
    document.getElementById('manSalesM3').value = m['2026-09'] || '';

    // If monthly expenses recorded
    const expMonthly = (v.total_expenses / 3).toFixed(0);
    document.getElementById('manExpM1').value = expMonthly;
    document.getElementById('manExpM2').value = expMonthly;
    document.getElementById('manExpM3').value = expMonthly;

    document.getElementById('manCustomers').value = v.unique_customers;
    document.getElementById('manTxnCount').value = v.txn_count || '';
    document.getElementById('manTransferOut').value = v.transfer_out || 0;
    document.getElementById('manTransferIn').value = v.transfer_in || 0;

    const sel = document.getElementById('manCircularFlag');
    if (sel) {
      if (v.reciprocal_transfer_share >= 0.9) sel.value = 'yes';
      else if (v.reciprocal_transfer_share >= 0.4) sel.value = 'maybe';
      else sel.value = 'no';
    }
  }

  // =========================================================================
  // 3. SAMPLE DATA GENERATOR
  // =========================================================================

  function loadSampleData() {
    const suggested = suggestNextId(window.TrustCredApp?.getAllVendors() || []);
    document.getElementById('manVendorId').value = suggested;
    document.getElementById('manLoanAmount').value = '50000';
    document.getElementById('manSalesM1').value = '145000';
    document.getElementById('manSalesM2').value = '152000';
    document.getElementById('manSalesM3').value = '138000';
    document.getElementById('manExpM1').value = '28000';
    document.getElementById('manExpM2').value = '31000';
    document.getElementById('manExpM3').value = '29000';
    document.getElementById('manCustomers').value = '420';
    document.getElementById('manTxnCount').value = '485';
    document.getElementById('manTransferOut').value = '0';
    document.getElementById('manTransferIn').value = '0';
    document.getElementById('manCircularFlag').value = 'no';

    // Sample for transaction CSV tab
    const csvSample = `date,from_account,to_account,amount,type
2026-07-05,C00124,${suggested},450.00,customer_payment
2026-07-06,C00198,${suggested},820.00,customer_payment
2026-07-10,${suggested},SUP102,1200.00,expense
2026-08-02,C00512,${suggested},650.00,customer_payment
2026-08-15,${suggested},SUP102,950.00,expense
2026-09-01,C00843,${suggested},1100.00,customer_payment
2026-09-20,${suggested},SUP105,1500.00,expense`;
    const csvInput = document.getElementById('manCsvInput');
    if (csvInput) csvInput.value = csvSample;

    updateLiveScorePreview();
  }

  // =========================================================================
  // 4. TRANSACTION CSV PARSER & CALCULATOR
  // =========================================================================

  function parseCsvTransactions(csvText, vendorId) {
    if (!csvText || !csvText.trim()) {
      return { error: 'Transaction CSV cannot be empty.' };
    }

    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) {
      return { error: 'CSV must have a header row and at least 1 transaction.' };
    }

    const header = lines[0].split(',').map(s => s.trim().toLowerCase());
    const reqCols = ['date', 'from_account', 'to_account', 'amount', 'type'];
    const missing = reqCols.filter(c => !header.includes(c));
    if (missing.length > 0) {
      return { error: `Missing required CSV column(s): ${missing.join(', ')}` };
    }

    const colIdx = {
      date: header.indexOf('date'),
      from: header.indexOf('from_account'),
      to: header.indexOf('to_account'),
      amount: header.indexOf('amount'),
      type: header.indexOf('type')
    };

    const validRows = [];
    const invalidRows = [];

    const allowedTypes = new Set(['customer_payment', 'expense', 'transfer']);
    const vid = vendorId.toUpperCase();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      const rowNum = i + 1;

      if (parts.length < header.length) {
        invalidRows.push({ row: rowNum, reason: 'Incomplete columns' });
        continue;
      }

      const d = parts[colIdx.date];
      const fromAcc = parts[colIdx.from].toUpperCase();
      const toAcc = parts[colIdx.to].toUpperCase();
      const amt = Number(parts[colIdx.amount]);
      const typ = parts[colIdx.type].toLowerCase();

      if (!d || isNaN(new Date(d).getTime())) {
        invalidRows.push({ row: rowNum, reason: `Invalid date "${d}"` });
        continue;
      }
      if (isNaN(amt) || amt <= 0 || amt > 10000000) {
        invalidRows.push({ row: rowNum, reason: `Invalid amount "${parts[colIdx.amount]}"` });
        continue;
      }
      if (!allowedTypes.has(typ)) {
        invalidRows.push({ row: rowNum, reason: `Unknown type "${typ}"` });
        continue;
      }

      validRows.push({
        date: d,
        from_account: fromAcc,
        to_account: toAcc,
        amount: amt,
        type: typ
      });
    }

    if (validRows.length === 0) {
      return { error: 'No valid transaction records could be parsed.', invalidRows };
    }

    // Compute vendor aggregation
    let totalReceipts = 0;
    let totalExpenses = 0;
    let transferOut = 0;
    let transferIn = 0;
    const uniqueCustomers = new Set();
    const monthlyReceipts = { '2026-07': 0, '2026-08': 0, '2026-09': 0 };

    // Track transfer pairs for reciprocal check: from -> to
    const transferSentTo = new Map(); // vid -> target -> amount
    const transferRecvFrom = new Map(); // vid -> source -> amount

    validRows.forEach(row => {
      const month = row.date.slice(0, 7);

      if (row.type === 'customer_payment' && row.to_account === vid) {
        totalReceipts += row.amount;
        uniqueCustomers.add(row.from_account);
        if (monthlyReceipts[month] !== undefined) {
          monthlyReceipts[month] += row.amount;
        } else {
          monthlyReceipts[month] = row.amount;
        }
      } else if (row.type === 'expense' && row.from_account === vid) {
        totalExpenses += row.amount;
      } else if (row.type === 'transfer') {
        if (row.from_account === vid) {
          transferOut += row.amount;
          transferSentTo.set(row.to_account, (transferSentTo.get(row.to_account) || 0) + row.amount);
        }
        if (row.to_account === vid) {
          transferIn += row.amount;
          transferRecvFrom.set(row.from_account, (transferRecvFrom.get(row.from_account) || 0) + row.amount);
        }
      }
    });

    // Check reciprocal transfers: sender also received from counterparty
    let reciprocalTransferVol = 0;
    transferSentTo.forEach((amt, counterparty) => {
      if (transferRecvFrom.has(counterparty)) {
        reciprocalTransferVol += amt;
      }
    });

    const recipShare = transferOut > 0 ? Math.min(1, reciprocalTransferVol / transferOut) : 0;

    return {
      success: true,
      validRows,
      invalidRows,
      computed: {
        total_receipts: Math.round(totalReceipts * 100) / 100,
        total_expenses: Math.round(totalExpenses * 100) / 100,
        net_cashflow: Math.round((totalReceipts - totalExpenses) * 100) / 100,
        unique_customers: uniqueCustomers.size,
        txn_count: validRows.length,
        transfer_out: Math.round(transferOut * 100) / 100,
        transfer_in: Math.round(transferIn * 100) / 100,
        reciprocal_transfer_share: recipShare,
        monthly_receipts: monthlyReceipts
      }
    };
  }

  // =========================================================================
  // 5. VALIDATION & EXTRACTION
  // =========================================================================

  function clearErrors() {
    document.querySelectorAll('.field-error-text, .field-warning-text').forEach(el => el.remove());
    document.querySelectorAll('.is-invalid, .is-warning').forEach(el => el.classList.remove('is-invalid', 'is-warning'));
  }

  function setFieldError(fieldId, msg) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.classList.add('is-invalid');
    const err = document.createElement('div');
    err.className = 'field-error-text';
    err.setAttribute('role', 'alert');
    err.innerHTML = `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg> ${msg}`;
    el.parentNode.appendChild(err);
  }

  function setFieldWarning(fieldId, msg) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.classList.add('is-warning');
    const warn = document.createElement('div');
    warn.className = 'field-warning-text';
    warn.innerHTML = `⚠️ ${msg}`;
    el.parentNode.appendChild(warn);
  }

  /**
   * Validate and assemble vendor object from form
   */
  function buildVendorFromForm(isFinalSubmit = false) {
    clearErrors();
    let hasError = false;

    const idInput = document.getElementById('manVendorId');
    const vid = (idInput?.value || '').trim().toUpperCase();

    if (!vid) {
      if (isFinalSubmit) setFieldError('manVendorId', 'Vendor ID / Name is required.');
      hasError = true;
    } else if (vid.length > 30) {
      setFieldError('manVendorId', 'Maximum 30 characters allowed.');
      hasError = true;
    } else {
      // Check duplicate ID against dataset and existing manual vendors (unless editing this same vendor)
      const isEditing = idInput.hasAttribute('readonly');
      if (!isEditing) {
        const all = window.TrustCredApp?.getAllVendors() || [];
        if (all.some(v => v.vendor_id.toUpperCase() === vid)) {
          setFieldError('manVendorId', `Vendor ID "${vid}" already exists. Please choose a unique ID.`);
          hasError = true;
        }
      }
    }

    const loanVal = Number(document.getElementById('manLoanAmount')?.value);
    if (!loanVal || isNaN(loanVal) || loanVal < 10000 || loanVal > 100000) {
      if (isFinalSubmit) setFieldError('manLoanAmount', 'Requested loan must be between ₹10,000 and ₹1,00,000.');
      hasError = true;
    }

    if (activeTab === 'quick') {
      const s1 = Number(document.getElementById('manSalesM1')?.value);
      const s2 = Number(document.getElementById('manSalesM2')?.value);
      const s3 = Number(document.getElementById('manSalesM3')?.value);

      if (isNaN(s1) || s1 < 0 || s1 > 10000000) {
        if (isFinalSubmit) setFieldError('manSalesM1', 'Enter valid Month 1 sales (0 to 1 crore).');
        hasError = true;
      }
      if (isNaN(s2) || s2 < 0 || s2 > 10000000) {
        if (isFinalSubmit) setFieldError('manSalesM2', 'Enter valid Month 2 sales (0 to 1 crore).');
        hasError = true;
      }
      if (isNaN(s3) || s3 < 0 || s3 > 10000000) {
        if (isFinalSubmit) setFieldError('manSalesM3', 'Enter valid Month 3 sales (0 to 1 crore).');
        hasError = true;
      }

      const e1 = Number(document.getElementById('manExpM1')?.value);
      const e2 = Number(document.getElementById('manExpM2')?.value);
      const e3 = Number(document.getElementById('manExpM3')?.value);

      if (isNaN(e1) || e1 < 0 || e1 > 10000000) {
        if (isFinalSubmit) setFieldError('manExpM1', 'Enter valid Month 1 expenses.');
        hasError = true;
      }
      if (isNaN(e2) || e2 < 0 || e2 > 10000000) {
        if (isFinalSubmit) setFieldError('manExpM2', 'Enter valid Month 2 expenses.');
        hasError = true;
      }
      if (isNaN(e3) || e3 < 0 || e3 > 10000000) {
        if (isFinalSubmit) setFieldError('manExpM3', 'Enter valid Month 3 expenses.');
        hasError = true;
      }

      const cust = Number(document.getElementById('manCustomers')?.value);
      if (isNaN(cust) || cust <= 0 || !Number.isInteger(cust)) {
        if (isFinalSubmit) setFieldError('manCustomers', 'Enter whole number of unique customers (>0).');
        hasError = true;
      }

      if (hasError) return null;

      const totalReceipts = s1 + s2 + s3;
      const totalExpenses = e1 + e2 + e3;
      const netCashflow = totalReceipts - totalExpenses;

      // Friendly warning if expenses exceed 3x sales
      if (totalExpenses > totalReceipts * 3 && totalReceipts > 0) {
        setFieldWarning('manExpM1', 'Note: Total expenses exceed 3x sales.');
      }

      const tout = Number(document.getElementById('manTransferOut')?.value) || 0;
      const tin = Number(document.getElementById('manTransferIn')?.value) || 0;
      const flagChoice = document.getElementById('manCircularFlag')?.value || 'no';

      let recipShare = 0;
      if (flagChoice === 'yes') recipShare = 1.0;
      else if (flagChoice === 'maybe') recipShare = 0.5;
      else recipShare = 0.0;

      const txnCount = Number(document.getElementById('manTxnCount')?.value) || Math.max(cust, 100);

      return {
        vendor_id: vid,
        loan_amount_requested: loanVal,
        total_receipts: totalReceipts,
        total_expenses: totalExpenses,
        net_cashflow: netCashflow,
        unique_customers: cust,
        txn_count: txnCount,
        transfer_out: tout,
        transfer_in: tin,
        reciprocal_transfer_share: recipShare,
        monthly_receipts: {
          '2026-07': s1,
          '2026-08': s2,
          '2026-09': s3
        },
        is_manual: true
      };
    } else {
      // Transaction CSV mode
      if (!parsedCsvVendorData || !parsedCsvVendorData.computed) {
        if (isFinalSubmit) {
          const csvText = document.getElementById('manCsvInput')?.value || '';
          const res = parseCsvTransactions(csvText, vid || 'M_TEMP');
          if (res.error) {
            setFieldError('manCsvInput', res.error);
            return null;
          }
          parsedCsvVendorData = res;
        } else {
          return null;
        }
      }

      if (hasError) return null;

      const comp = parsedCsvVendorData.computed;
      return {
        vendor_id: vid,
        loan_amount_requested: loanVal,
        total_receipts: comp.total_receipts,
        total_expenses: comp.total_expenses,
        net_cashflow: comp.net_cashflow,
        unique_customers: comp.unique_customers,
        txn_count: comp.txn_count,
        transfer_out: comp.transfer_out,
        transfer_in: comp.transfer_in,
        reciprocal_transfer_share: comp.reciprocal_transfer_share,
        monthly_receipts: comp.monthly_receipts,
        is_manual: true
      };
    }
  }

  // =========================================================================
  // 6. LIVE SCORE PREVIEW (DEBOUNCED)
  // =========================================================================

  function updateLiveScorePreview() {
    clearTimeout(previewDebounceTimer);
    previewDebounceTimer = setTimeout(() => {
      const previewScoreEl = document.getElementById('manPreviewScore');
      const previewBandEl = document.getElementById('manPreviewBand');
      if (!previewScoreEl || !previewBandEl) return;

      const tempVendor = buildVendorFromForm(false);
      if (!tempVendor || tempVendor.total_receipts === 0) {
        previewScoreEl.textContent = '--';
        previewBandEl.textContent = 'Awaiting input';
        previewBandEl.className = 'status-badge status-badge--neutral';
        return;
      }

      // Compute using core scoring function
      const scoreRes = window.TrustCredScore.computeDemoScore(tempVendor);
      previewScoreEl.textContent = `${scoreRes.score}/100`;
      previewBandEl.textContent = scoreRes.band.toUpperCase();
      previewBandEl.className = `score-badge badge--${scoreRes.band}`;
    }, 250);
  }

  // =========================================================================
  // 7. SAVE & INTEGRATION
  // =========================================================================

  function handleFormSubmit(e) {
    e.preventDefault();
    const vendorObj = buildVendorFromForm(true);

    if (!vendorObj) {
      // Focus first error field for accessibility
      const firstInvalid = document.querySelector('.is-invalid');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    // Compute final scorecard
    const scoreRes = window.TrustCredScore.computeDemoScore(vendorObj);

    // Apply manual data modifications as per requirement:
    // 1. Tagged as manual
    // 2. Confidence is one level lower (0.70 instead of 0.95), with plain reason
    scoreRes.confidence = Math.max(0.65, scoreRes.confidence - 0.25);
    scoreRes.plain_language_explanation =
      `[Manually entered - not verified] ${scoreRes.plain_language_explanation} This data was typed in by hand and has not been checked against payment records.`;
    scoreRes.is_manual = true;

    vendorObj.scoreDetails = scoreRes;

    // Check if replacing existing
    const existingIdx = memoryManualVendors.findIndex(v => v.vendor_id === vendorObj.vendor_id);
    if (existingIdx >= 0) {
      memoryManualVendors[existingIdx] = vendorObj;
    } else {
      memoryManualVendors.push(vendorObj);
    }

    saveToStorage();
    closeManualEntryDrawer();

    // Notify app to re-merge vendors and render
    if (window.TrustCredApp?.onManualVendorsChanged) {
      window.TrustCredApp.onManualVendorsChanged();
    }

    // Automatically inspect newly scored manual vendor
    setTimeout(() => {
      if (window.TrustCredApp?.openVendorDrawer) {
        window.TrustCredApp.openVendorDrawer(vendorObj.vendor_id);
      }
    }, 200);
  }

  // =========================================================================
  // 8. DELETE & 5-SECOND UNDO TOAST
  // =========================================================================

  function deleteManualVendor(vendorId) {
    const idx = memoryManualVendors.findIndex(v => v.vendor_id === vendorId);
    if (idx === -1) return;

    if (!confirm(`Are you sure you want to delete manual vendor ${vendorId}?`)) {
      return;
    }

    lastDeletedVendor = {
      vendor: memoryManualVendors[idx],
      index: idx
    };

    memoryManualVendors.splice(idx, 1);
    saveToStorage();

    // Close drawer if open
    window.TrustCredApp?.closeVendorDrawer();
    window.TrustCredApp?.onManualVendorsChanged();

    showUndoToast(vendorId);
  }

  function showUndoToast(vendorId) {
    clearTimeout(undoTimeoutId);
    const toast = document.getElementById('manualUndoToast');
    const toastText = document.getElementById('manualUndoText');
    if (!toast) return;

    if (toastText) toastText.textContent = `Deleted vendor ${vendorId}.`;
    toast.classList.add('toast--visible');

    undoTimeoutId = setTimeout(() => {
      toast.classList.remove('toast--visible');
      lastDeletedVendor = null;
    }, 5000);
  }

  function undoLastDelete() {
    if (!lastDeletedVendor) return;
    memoryManualVendors.splice(lastDeletedVendor.index, 0, lastDeletedVendor.vendor);
    saveToStorage();
    lastDeletedVendor = null;

    const toast = document.getElementById('manualUndoToast');
    if (toast) toast.classList.remove('toast--visible');

    window.TrustCredApp?.onManualVendorsChanged();
  }

  // =========================================================================
  // 9. EXPORT & IMPORT (JSON / CSV)
  // =========================================================================

  function exportManualVendors(format = 'json') {
    if (memoryManualVendors.length === 0) {
      alert('No manual vendors to export.');
      return;
    }

    let blob, filename;
    if (format === 'json') {
      const cleanData = memoryManualVendors.map(v => {
        const copy = { ...v };
        delete copy.scoreDetails;
        return copy;
      });
      blob = new Blob([JSON.stringify(cleanData, null, 2)], { type: 'application/json' });
      filename = `trustcred_manual_vendors_${Date.now()}.json`;
    } else {
      // CSV
      const headers = ['vendor_id', 'loan_amount_requested', 'total_receipts', 'total_expenses', 'net_cashflow', 'unique_customers', 'txn_count', 'transfer_out', 'transfer_in', 'reciprocal_transfer_share'];
      const rows = memoryManualVendors.map(v => headers.map(h => v[h] !== undefined ? v[h] : '').join(','));
      const csvStr = [headers.join(','), ...rows].join('\n');
      blob = new Blob([csvStr], { type: 'text/csv' });
      filename = `trustcred_manual_vendors_${Date.now()}.csv`;
    }

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function importManualVendorsFromJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed)) {
          alert('Invalid format: Imported file must be an array of vendor objects.');
          return;
        }

        let addedCount = 0;
        parsed.forEach(v => {
          if (v.vendor_id && v.loan_amount_requested) {
            v.is_manual = true;
            // score using core logic
            v.scoreDetails = window.TrustCredScore.computeDemoScore(v);
            v.scoreDetails.confidence = Math.max(0.65, v.scoreDetails.confidence - 0.25);
            v.scoreDetails.is_manual = true;

            const existingIdx = memoryManualVendors.findIndex(m => m.vendor_id === v.vendor_id);
            if (existingIdx >= 0) {
              memoryManualVendors[existingIdx] = v;
            } else {
              memoryManualVendors.push(v);
            }
            addedCount++;
          }
        });

        saveToStorage();
        window.TrustCredApp?.onManualVendorsChanged();
        alert(`Successfully imported ${addedCount} manual vendor records.`);
      } catch (err) {
        alert('Failed to parse JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // =========================================================================
  // 10. SETUP EVENT LISTENERS
  // =========================================================================

  function init() {
    // Open Drawer buttons (desktop button & mobile FAB)
    document.getElementById('btnOpenManualEntry')?.addEventListener('click', () => openManualEntryDrawer());
    document.getElementById('fabAddManual')?.addEventListener('click', () => openManualEntryDrawer());

    // Drawer close buttons
    document.getElementById('closeManualDrawerBtn')?.addEventListener('click', closeManualEntryDrawer);
    document.getElementById('cancelManualBtn')?.addEventListener('click', closeManualEntryDrawer);

    // Tab buttons
    document.getElementById('tabBtnQuick')?.addEventListener('click', () => switchTab('quick'));
    document.getElementById('tabBtnTxns')?.addEventListener('click', () => switchTab('txns'));

    // Sample data loader
    document.getElementById('btnLoadSampleManual')?.addEventListener('click', loadSampleData);

    // Form submit
    document.getElementById('manualVendorForm')?.addEventListener('submit', handleFormSubmit);

    // Live preview listeners
    const liveFields = ['manVendorId', 'manLoanAmount', 'manSalesM1', 'manSalesM2', 'manSalesM3', 'manExpM1', 'manExpM2', 'manExpM3', 'manCustomers', 'manTransferOut', 'manCircularFlag'];
    liveFields.forEach(id => {
      document.getElementById(id)?.addEventListener('input', updateLiveScorePreview);
      document.getElementById(id)?.addEventListener('change', updateLiveScorePreview);
    });

    // CSV Parse preview
    document.getElementById('btnParseCsvPreview')?.addEventListener('click', () => {
      const vid = document.getElementById('manVendorId')?.value || 'M001';
      const text = document.getElementById('manCsvInput')?.value || '';
      const res = parseCsvTransactions(text, vid);
      const container = document.getElementById('csvPreviewContainer');
      if (!container) return;

      if (res.error) {
        container.innerHTML = `<div class="csv-error-summary">${res.error}</div>`;
        parsedCsvVendorData = null;
      } else {
        parsedCsvVendorData = res;
        const validCount = res.validRows.length;
        const invalidCount = res.invalidRows.length;
        const previewRows = res.validRows.slice(0, 10);

        let tableHtml = `
          <div style="font-size: 0.85rem; margin-bottom: 6px;">
            <strong>${validCount} valid rows parsed</strong>. Total Inflows: ${inr(res.computed.total_receipts)} | Outflows: ${inr(res.computed.total_expenses)}
            ${invalidCount > 0 ? `<span style="color:var(--color-danger); margin-left:8px;">(${invalidCount} invalid rows discarded)</span>` : ''}
          </div>
          <div class="csv-preview-table-wrap">
            <table class="csv-preview-table">
              <thead>
                <tr><th>Date</th><th>From</th><th>To</th><th>Amount</th><th>Type</th></tr>
              </thead>
              <tbody>
                ${previewRows.map(r => `<tr><td>${r.date}</td><td>${r.from_account}</td><td>${r.to_account}</td><td>${inr(r.amount)}</td><td>${r.type}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        `;

        if (invalidCount > 0) {
          tableHtml += `
            <div class="csv-error-summary">
              <strong>Invalid Rows Discarded:</strong>
              <ul style="margin: 4px 0 0 16px;">
                ${res.invalidRows.slice(0, 5).map(inv => `<li>Row ${inv.row}: ${inv.reason}</li>`).join('')}
              </ul>
            </div>
          `;
        }
        container.innerHTML = tableHtml;
      }
      updateLiveScorePreview();
    });

    // Undo button
    document.getElementById('manualUndoBtn')?.addEventListener('click', undoLastDelete);

    // Export & Import listeners
    document.getElementById('btnExportManualJson')?.addEventListener('click', () => exportManualVendors('json'));
    document.getElementById('btnExportManualCsv')?.addEventListener('click', () => exportManualVendors('csv'));
    document.getElementById('btnImportManualJson')?.addEventListener('click', () => {
      document.getElementById('manualImportFileInput')?.click();
    });
    document.getElementById('manualImportFileInput')?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        importManualVendorsFromJson(e.target.files[0]);
        e.target.value = '';
      }
    });
  }

  // Run init on DOMContentLoaded or immediate if loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    getManualVendors,
    openManualEntryDrawer,
    closeManualEntryDrawer,
    deleteManualVendor,
    exportManualVendors,
    importManualVendorsFromJson
  };
})();

window.TrustCredManual = TrustCredManual;
