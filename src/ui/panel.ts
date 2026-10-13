/**
 * DocuHarvest - Floating Control Panel with Isolated Shadow DOM
 * Industrial-grade technical design system, responsive window clamping,
 * queue search/filtering, bulk controls, live telemetry & ETA,
 * in-panel configuration drawer, clipboard portability, and keyboard accessibility.
 */

import { HarvestSession, PanelEvents } from '../types';
import { computeSessionStats } from '../storage/storage';
import { PANEL_CSS } from './panel-styles';
import { copyMarkdownToClipboard } from '../export/exporter';
import { detectCandidateSelectors } from '../extractor/dom-extractor';

export class PanelController {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private container: HTMLElement | null = null;
  private session: HarvestSession;
  private events: PanelEvents;
  private isDragging: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private containerStartX: number = 0;
  private containerStartY: number = 0;
  private hasMoved: boolean = false;
  private showClearConfirm: boolean = false;
  private queueSearchQuery: string = '';
  private queueStatusFilter: string = 'all';
  private toastMessage: string | null = null;
  private toastTimer: any = null;

  private resizeHandler = () => this.applyPosition();
  private keydownHandler = (e: KeyboardEvent) => this.handleGlobalKeydown(e);

  constructor(session: HarvestSession, events: PanelEvents) {
    this.session = session;
    this.events = events;
  }

  /**
   * Injects or attaches the Shadow DOM panel into the webpage.
   */
  public mount(): void {
    const existing = document.getElementById('docuharvest-root');
    if (existing && existing.parentNode) {
      try {
        existing.parentNode.removeChild(existing);
      } catch {
        // Already removed
      }
    }

    this.host = document.createElement('div');
    this.host.id = 'docuharvest-root';
    this.host.setAttribute('role', 'region');
    this.host.setAttribute('aria-label', 'DocuHarvest Control Panel');
    this.host.style.cssText = `
      all: initial !important;
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 0 !important;
      height: 0 !important;
      overflow: visible !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
    `;

    this.shadow = this.host.attachShadow({ mode: 'open' });

    const styleEl = document.createElement('style');
    styleEl.textContent = PANEL_CSS;
    this.shadow.appendChild(styleEl);

    this.container = document.createElement('div');
    this.shadow.appendChild(this.container);

    const stopPropagation = (e: Event) => e.stopPropagation();
    this.container.addEventListener('click', stopPropagation);
    this.container.addEventListener('mousedown', stopPropagation);
    this.container.addEventListener('mouseup', stopPropagation);
    this.container.addEventListener('touchstart', stopPropagation);

    window.addEventListener('resize', this.resizeHandler);
    window.addEventListener('keydown', this.keydownHandler);

    this.render(this.session);

    const mountTarget = document.body || document.documentElement;
    mountTarget.appendChild(this.host);
  }

  /**
   * Destroys or removes the panel from the DOM safely.
   */
  public destroy(): void {
    window.removeEventListener('resize', this.resizeHandler);
    window.removeEventListener('keydown', this.keydownHandler);
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }

    if (this.host && this.host.parentNode) {
      try {
        this.host.parentNode.removeChild(this.host);
      } catch {
        // Already removed
      }
    }
  }

  public unmount(): void {
    this.destroy();
  }

  /**
   * Shows a transient positive notification toast.
   */
  public showToast(msg: string): void {
    this.toastMessage = msg;
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.render(this.session);
    this.toastTimer = setTimeout(() => {
      this.toastMessage = null;
      this.toastTimer = null;
      this.render(this.session);
    }, 2200);
  }

  /**
   * Global keyboard shortcut handler.
   */
  private handleGlobalKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.session.previewPageUrl) {
        e.preventDefault();
        this.events.onPreviewPage(null);
      } else if (this.showClearConfirm) {
        e.preventDefault();
        this.showClearConfirm = false;
        this.render(this.session);
      } else if (this.session.panelSettingsVisible && this.events.onToggleSettings) {
        e.preventDefault();
        this.events.onToggleSettings();
      } else if (this.session.panelQueueVisible) {
        e.preventDefault();
        this.events.onToggleQueue();
      } else {
        e.preventDefault();
        this.events.onToggleMinimize();
      }
    } else if (e.altKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault();
      this.events.onToggleMinimize();
    }
  }

  /**
   * Updates the panel with latest session state.
   */
  public render(session: HarvestSession): void {
    this.session = session;
    if (!this.container) return;

    if (this.session.panelMinimized) {
      this.renderMinimized();
    } else {
      this.renderFull();
    }
  }

  /**
   * Renders the full expanded floating panel.
   */
  private renderFull(): void {
    if (!this.container) return;

    const stats = computeSessionStats(this.session);
    const { status, currentPageName, currentUrl, currentOperation } = this.session;
    const discoveredList = this.session.pagesOrder.map(url => this.session.discoveredPages[url]).filter(Boolean);

    this.container.className = 'dh-container';
    this.applyPosition();

    const badgeClass = `dh-badge dh-badge-${status}`;
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

    // Calculate throughput and ETA
    let etaText = `~${stats.remaining} left`;
    if (status === 'running' && this.session.startedAt && stats.collected > 0) {
      const elapsedSec = (Date.now() - this.session.startedAt) / 1000;
      const secPerPage = elapsedSec / stats.collected;
      const remainingSec = Math.round(secPerPage * stats.remaining);
      if (remainingSec < 60) {
        etaText = `ETA: <1m`;
      } else {
        const mins = Math.floor(remainingSec / 60);
        const secs = remainingSec % 60;
        etaText = `ETA: ~${mins}m ${secs}s`;
      }
    }

    // Action button states
    let actionButtonsHtml = '';
    if (status === 'idle' || status === 'completed') {
      actionButtonsHtml = `
        <button id="dh-btn-start" class="dh-btn dh-btn-primary">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          ${status === 'completed' ? 'Restart Harvest' : 'Start Collection'}
        </button>
      `;
    } else if (status === 'review') {
      const selectedCount = discoveredList.filter(p => p.selected !== false).length;
      actionButtonsHtml = `
        <button id="dh-btn-confirm-harvest" class="dh-btn dh-btn-primary">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Compile Selected (${selectedCount})
        </button>
        <button id="dh-btn-cancel-review" class="dh-btn dh-btn-secondary">
          Cancel
        </button>
      `;
    } else if (status === 'running') {
      actionButtonsHtml = `
        <button id="dh-btn-pause" class="dh-btn dh-btn-warning">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          Pause
        </button>
        <button id="dh-btn-stop" class="dh-btn dh-btn-danger">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16"/></svg>
          Stop
        </button>
      `;
    } else if (status === 'paused') {
      actionButtonsHtml = `
        <button id="dh-btn-resume" class="dh-btn dh-btn-primary">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Resume
        </button>
        <button id="dh-btn-stop" class="dh-btn dh-btn-danger">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16"/></svg>
          Stop
        </button>
      `;
    } else if (status === 'stopped' || status === 'error') {
      actionButtonsHtml = `
        <button id="dh-btn-start" class="dh-btn dh-btn-primary">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Resume / Start
        </button>
        <button id="dh-btn-reset" class="dh-btn dh-btn-secondary">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          Reset
        </button>
      `;
    }

    // Configuration Settings Drawer (Flaw 6)
    let settingsDrawerHtml = '';
    if (this.session.panelSettingsVisible) {
      const cfg = this.session.config;
      let detectedCandidates: Array<{ selector: string; label: string; wordCount: number }> = [];
      try {
        detectedCandidates = detectCandidateSelectors(document);
      } catch {
        detectedCandidates = [];
      }
      const isCustomSelector = !!cfg.contentSelector && !detectedCandidates.some(c => c.selector === cfg.contentSelector);

      const candidateOptionsHtml = detectedCandidates.map(c => `
        <option value="${this.escapeHtml(c.selector)}" ${cfg.contentSelector === c.selector ? 'selected' : ''}>
          ${this.escapeHtml(c.label)}
        </option>
      `).join('');

      settingsDrawerHtml = `
        <div id="dh-settings-drawer" class="dh-settings-drawer">
          <div class="dh-settings-title">Extraction Parameters</div>
          <div class="dh-settings-row">
            <label class="dh-settings-label">Rate Limit Pause (ms):</label>
            <input id="dh-cfg-ratelimit" type="number" class="dh-settings-input" value="${cfg.rateLimitMs}" min="100" max="10000" step="100">
          </div>
          <div class="dh-settings-row">
            <label class="dh-settings-label">URL Prefix Restriction:</label>
            <input id="dh-cfg-urlprefix" type="text" class="dh-settings-input" value="${this.escapeHtml(cfg.urlPrefix)}" placeholder="/docs">
          </div>
          <div class="dh-settings-row" style="flex-direction: column; align-items: stretch; gap: 4px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <label class="dh-settings-label">Content Container Selector:</label>
              <button type="button" id="dh-btn-pick-element" class="dh-btn-mini" title="Click on webpage to visually select content container" style="font-size: 10px; padding: 2px 6px;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>
                Pick from Page
              </button>
            </div>
            <select id="dh-cfg-selector-dropdown" class="dh-settings-input" style="cursor: pointer;">
              <option value="">Auto-Detect (Smart Fallback)</option>
              ${candidateOptionsHtml}
              <option value="__custom__" ${isCustomSelector ? 'selected' : ''}>Custom CSS Selector...</option>
            </select>
            <input id="dh-cfg-selector" type="text" class="dh-settings-input" value="${this.escapeHtml(cfg.contentSelector || '')}" placeholder="main, article, .content" style="${isCustomSelector || cfg.contentSelector ? '' : 'display: none;'} margin-top: 2px;">
          </div>
          <label class="dh-settings-checkbox-row">
            <input id="dh-cfg-accordions" type="checkbox" ${cfg.expandAccordions ? 'checked' : ''}>
            <span>Expand documentation accordions</span>
          </label>
          <label class="dh-settings-checkbox-row">
            <input id="dh-cfg-tabs" type="checkbox" ${cfg.captureTabs ? 'checked' : ''}>
            <span>Capture multi-tab code snippets</span>
          </label>
          <label class="dh-settings-checkbox-row">
            <input id="dh-cfg-autoscroll" type="checkbox" ${cfg.autoScroll ? 'checked' : ''}>
            <span>Auto-scroll viewport during capture</span>
          </label>
          <div class="dh-settings-actions">
            <button id="dh-btn-save-settings" class="dh-btn dh-btn-primary" style="padding: 4px 8px; font-size: 10px;">Save Configuration</button>
            <button id="dh-btn-close-settings" class="dh-btn dh-btn-secondary" style="padding: 4px 8px; font-size: 10px;">Cancel</button>
          </div>
        </div>
      `;
    }

    // Staged Pages Review Box
    let reviewBoxHtml = '';
    if (status === 'review') {
      const allPagesSelected = discoveredList.length > 0 && discoveredList.every(p => p.selected !== false);
      const allScrollSelected = discoveredList.length > 0 && discoveredList.every(p => p.requiresScroll !== false);
      const selectedCount = discoveredList.filter(p => p.selected !== false).length;

      const reviewItemsHtml = discoveredList.map(page => {
        let displayPath = page.url;
        try {
          const u = new URL(page.url);
          displayPath = u.pathname + u.search;
        } catch {
          // fallback
        }

        return `
          <div class="dh-review-item">
            <label class="dh-review-item-main">
              <input type="checkbox" class="dh-review-chk-page" data-url="${this.escapeHtml(page.url)}" ${page.selected !== false ? 'checked' : ''}>
              <div class="dh-review-item-details">
                <span class="dh-review-item-title" title="${this.escapeHtml(page.title)}">${this.escapeHtml(page.title)}</span>
                <span class="dh-review-item-url" title="${this.escapeHtml(page.url)}">${this.escapeHtml(displayPath)}</span>
              </div>
            </label>
            <label class="dh-review-scroll-label" title="Enable auto-scrolling viewport during extraction for dynamic/lazy content">
              <input type="checkbox" class="dh-review-chk-scroll" data-url="${this.escapeHtml(page.url)}" ${page.requiresScroll !== false ? 'checked' : ''}>
              <span>Scroll</span>
            </label>
          </div>
        `;
      }).join('');

      reviewBoxHtml = `
        <div class="dh-review-container">
          <div class="dh-review-header">
            <div class="dh-review-title">Staged Pages Review (${discoveredList.length})</div>
            <div class="dh-review-notice">Verify compilation scope. Uncheck leaf pages that lack return navigation, and configure auto-scrolling per page.</div>
          </div>
          <div class="dh-review-toolbar">
            <label class="dh-review-bulk-label">
              <input type="checkbox" id="dh-review-chk-all-pages" ${allPagesSelected ? 'checked' : ''}>
              <span>Select All (${selectedCount}/${discoveredList.length})</span>
            </label>
            <label class="dh-review-bulk-label">
              <input type="checkbox" id="dh-review-chk-all-scroll" ${allScrollSelected ? 'checked' : ''}>
              <span>Scroll All</span>
            </label>
          </div>
          <div class="dh-review-list">
            ${reviewItemsHtml || '<div style="padding: 10px; text-align: center; color: #8b949e; font-size: 11px;">No pages discovered.</div>'}
          </div>
        </div>
      `;
    }

    // Queue List Drawer with Search & Filters (Flaws 9, 10, 13)
    let queueDrawerHtml = '';

    if (this.session.panelQueueVisible) {
      let filtered = discoveredList;

      if (this.queueStatusFilter !== 'all') {
        filtered = filtered.filter(p => p.status === this.queueStatusFilter);
      }

      if (this.queueSearchQuery.trim()) {
        const q = this.queueSearchQuery.trim().toLowerCase();
        filtered = filtered.filter(p => p.title.toLowerCase().includes(q) || p.url.toLowerCase().includes(q));
      }

      const itemsHtml = filtered.length > 0 ? filtered.map(page => {
        let metaHtml = '';
        let actionBtn = '';
        const isCollected = !!this.session.collectedPages[page.url];

        if (page.status === 'completed') {
          metaHtml = `<span class="dh-queue-meta">${page.wordCount || 0}w</span>`;
        } else if (page.status === 'partial') {
          metaHtml = `<span class="dh-queue-meta" style="color: #d29922;" title="${this.escapeHtml(page.warning || 'Partial extraction')}">Partial (${page.wordCount || 0}w)</span>`;
        } else if (page.status === 'in_progress') {
          metaHtml = `<span class="dh-queue-meta" style="color: #58a6ff;">Extracting</span>`;
        } else if (page.status === 'failed') {
          metaHtml = `<span class="dh-queue-meta" style="color: #f85149;" title="${this.escapeHtml(page.error || '')}">Failed</span>`;
          actionBtn = `<button class="dh-btn-mini dh-btn-retry" data-url="${this.escapeHtml(page.url)}">Retry</button>`;
        } else if (page.status === 'skipped') {
          metaHtml = `<span class="dh-queue-meta" style="color: #8b949e;">Skipped</span>`;
        } else if (page.status === 'pending') {
          actionBtn = `
            <button class="dh-btn-mini dh-btn-prioritize" data-url="${this.escapeHtml(page.url)}" title="Move to top of queue">Top</button>
            <button class="dh-btn-mini dh-btn-skip" data-url="${this.escapeHtml(page.url)}">Skip</button>
          `;
        }

        const previewBtn = isCollected
          ? `<button class="dh-btn-mini dh-btn-preview" data-url="${this.escapeHtml(page.url)}" title="Preview extracted markdown">Preview</button>`
          : '';

        return `
          <div class="dh-queue-item">
            <div class="dh-queue-item-info">
              <span class="dh-queue-status-dot dh-dot-${page.status}"></span>
              <span class="dh-queue-item-title" title="${this.escapeHtml(page.title)}">${this.escapeHtml(page.title)}</span>
            </div>
            <div class="dh-queue-actions">
              ${metaHtml}
              ${previewBtn}
              ${actionBtn}
            </div>
          </div>
        `;
      }).join('') : `
        <div style="padding: 10px; text-align: center; color: #8b949e; font-size: 11px;">
          ${discoveredList.length === 0 ? 'Queue is empty. Click "Start Collection" to discover pages.' : 'No pages match the current filter.'}
        </div>
      `;

      queueDrawerHtml = `
        <div class="dh-queue-drawer">
          <!-- Queue Search & Filter Bar -->
          <div class="dh-queue-search-row">
            <input id="dh-queue-search" type="text" class="dh-queue-search-input" placeholder="Search queue by title or URL..." value="${this.escapeHtml(this.queueSearchQuery)}">
          </div>
          <div class="dh-queue-filters">
            <button class="dh-queue-filter-btn ${this.queueStatusFilter === 'all' ? 'active' : ''}" data-filter="all">ALL (${discoveredList.length})</button>
            <button class="dh-queue-filter-btn ${this.queueStatusFilter === 'pending' ? 'active' : ''}" data-filter="pending">PENDING (${stats.remaining})</button>
            <button class="dh-queue-filter-btn ${this.queueStatusFilter === 'completed' ? 'active' : ''}" data-filter="completed">DONE (${stats.collected})</button>
            <button class="dh-queue-filter-btn ${this.queueStatusFilter === 'failed' ? 'active' : ''}" data-filter="failed">ERR (${stats.failed})</button>
            <button class="dh-queue-filter-btn ${this.queueStatusFilter === 'skipped' ? 'active' : ''}" data-filter="skipped">SKIP (${stats.skipped})</button>
          </div>
          <div class="dh-queue-bulk-bar">
            <button id="dh-btn-skip-all-pending" class="dh-btn-mini" title="Skip all currently pending items in queue">Skip All Pending</button>
            <button id="dh-btn-retry-all-failed" class="dh-btn-mini" title="Re-queue all failed items">Retry All Failed</button>
          </div>
          ${itemsHtml}
        </div>
      `;
    }

    // Export Bar (Markdown, JSON, CSV, Copy MD) (Flaws 18, 19, 20)
    const exportBarHtml = stats.collected > 0 ? `
      <div class="dh-export-bar">
        <span class="dh-export-label">Export Data (${stats.collected} pages, ~${stats.totalWords} words)</span>
        <div class="dh-export-buttons-row">
          <button id="dh-btn-export-md" class="dh-export-btn dh-export-btn-primary" title="Export markdown bundle">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            .MD
          </button>
          <button id="dh-btn-export-json" class="dh-export-btn" title="Export structured JSON">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            JSON
          </button>
          <button id="dh-btn-export-csv" class="dh-export-btn" title="Export tabular CSV">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
            CSV
          </button>
          <button id="dh-btn-copy-md" class="dh-export-btn" title="Copy compiled markdown to clipboard">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          </button>
        </div>
      </div>
    ` : '';

    // Clear Data / Reset Confirmation
    let clearDataHtml = '';
    if (this.showClearConfirm) {
      clearDataHtml = `
        <div class="dh-confirm-box">
          <div class="dh-confirm-msg">Delete all ${stats.collected} collected documentation pages (~${stats.totalWords} words)? This cannot be undone.</div>
          <div class="dh-confirm-actions">
            <button id="dh-btn-confirm-clear" class="dh-btn dh-btn-danger" style="padding: 4px 8px; font-size: 11px;">Yes, Delete All</button>
            <button id="dh-btn-cancel-clear" class="dh-btn dh-btn-secondary" style="padding: 4px 8px; font-size: 11px;">Cancel</button>
          </div>
        </div>
      `;
    } else {
      const sessionBytes = JSON.stringify(this.session).length;
      const storageKb = Math.round(sessionBytes / 1024);
      clearDataHtml = `
        <div class="dh-footer-bar">
          <button id="dh-btn-clear-data" class="dh-btn-text-danger" title="Clear all collected documentation data">Clear Stored Data</button>
          <div class="dh-footer-meta">
            <span title="Estimated storage size in local browser database">Storage: ${storageKb} KB</span>
            <span>•</span>
            <span title="All data stored strictly in local browser storage">Local Private</span>
            <span>•</span>
            <span title="Open Source License">MIT</span>
          </div>
        </div>
      `;
    }

    // Preview Modal Overlay (Flaw 3, 20)
    let previewModalHtml = '';
    if (this.session.previewPageUrl && this.session.collectedPages[this.session.previewPageUrl]) {
      const previewPage = this.session.collectedPages[this.session.previewPageUrl];
      const breadcrumbStr = previewPage.breadcrumbs ? previewPage.breadcrumbs.join(' > ') : '';

      previewModalHtml = `
        <div class="dh-preview-modal" role="dialog" aria-label="Page Preview">
          <div class="dh-preview-header">
            <div>
              <div class="dh-preview-title">${this.escapeHtml(previewPage.title)}</div>
              <div class="dh-preview-meta">
                <span>${previewPage.wordCount} words</span>
                <span>•</span>
                <span>${previewPage.isComplete ? 'COMPLETE' : 'PARTIAL'}</span>
                ${breadcrumbStr ? `<span>•</span> <span>${this.escapeHtml(breadcrumbStr)}</span>` : ''}
              </div>
            </div>
            <div style="display: flex; gap: 4px; align-items: center;">
              <button id="dh-btn-copy-preview" class="dh-btn-mini" title="Copy page markdown to clipboard">Copy MD</button>
              <button id="dh-btn-close-preview" class="dh-btn-icon" title="Close preview (Esc)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
          <div class="dh-preview-body">${this.escapeHtml(previewPage.markdown)}</div>
        </div>
      `;
    }

    // Toast Notice (Flaw 19)
    const toastHtml = this.toastMessage ? `<div class="dh-toast">${this.escapeHtml(this.toastMessage)}</div>` : '';

    this.container.innerHTML = `
      <div class="dh-header" id="dh-drag-handle">
        <div class="dh-brand">
          <svg class="dh-brand-logo" width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="7" fill="#161b22" stroke="#30363d" stroke-width="1.5"/>
            <rect x="7" y="7" width="13" height="17" rx="2" fill="#21262d" stroke="#30363d" stroke-width="1"/>
            <rect x="10" y="9" width="14" height="17" rx="2" fill="#0d1117" stroke="#58a6ff" stroke-width="1.2"/>
            <line x1="13" y1="13" x2="20" y2="13" stroke="#8b949e" stroke-width="1.2" stroke-linecap="round"/>
            <line x1="13" y1="16.5" x2="21" y2="16.5" stroke="#8b949e" stroke-width="1.2" stroke-linecap="round"/>
            <line x1="13" y1="20" x2="18" y2="20" stroke="#8b949e" stroke-width="1.2" stroke-linecap="round"/>
            <path d="M19 5.5C24.5 5.5 28 9.5 28 15C28 19 25 22.5 21 23.5C22.5 21 23 18.5 23 15.5C23 10.5 19 6.5 14 6.5C15.5 5.8 17.2 5.5 19 5.5Z" fill="#3fb950"/>
            <path d="M21 8.5C23.5 11 23.5 14 21 16.5C18.5 14 18.5 11 21 8.5Z" fill="#56d364"/>
          </svg>
          <span class="dh-title">DocuHarvest</span>
          <span class="dh-version-tag">v0.1.0</span>
        </div>
        <div class="dh-header-actions">
          <button id="dh-btn-toggle-settings" class="dh-btn-icon ${this.session.panelSettingsVisible ? 'active' : ''}" title="Configuration Settings">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <button id="dh-btn-minimize" class="dh-btn-icon" title="Minimize panel (Alt+Shift+D)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button id="dh-btn-close" class="dh-btn-icon dh-btn-close" title="Exit / Close panel">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <div class="dh-body" aria-live="polite">
        <!-- Status & Progress Percentage (Flaw 11) -->
        <div class="dh-status-bar">
          <div class="${badgeClass}">
            <span class="dh-dot"></span>
            <span>${statusLabel}</span>
          </div>
          <span class="dh-progress-pill">${stats.collected + stats.skipped}/${stats.discovered} (${stats.progressPercentage}%)</span>
        </div>

        <!-- Progress Bar -->
        <div class="dh-progress-track">
          <div class="dh-progress-fill" style="width: ${stats.progressPercentage}%"></div>
        </div>

        <!-- Precision Telemetry Matrix with Throughput & ETA (Flaw 15) -->
        <div class="dh-telemetry-matrix">
          <div class="dh-telemetry-cell">
            <span class="dh-telemetry-val">${stats.discovered}</span>
            <span class="dh-telemetry-lbl">Discovered</span>
          </div>
          <div class="dh-telemetry-cell">
            <span class="dh-telemetry-val highlight">${stats.collected}</span>
            <span class="dh-telemetry-lbl">Collected</span>
          </div>
          <div class="dh-telemetry-cell">
            <span class="dh-telemetry-val">${stats.remaining}</span>
            <span class="dh-telemetry-lbl">Remaining</span>
          </div>
          <div class="dh-telemetry-cell">
            <span class="dh-telemetry-val" title="${etaText}">${status === 'running' ? etaText : `~${Math.round(stats.totalWords / 100) / 10}k w`}</span>
            <span class="dh-telemetry-lbl">${status === 'running' ? 'Progress' : 'Words'}</span>
          </div>
        </div>

        <!-- Inline Settings Drawer -->
        ${settingsDrawerHtml}

        <!-- Current Page Context with URL Prefix (Flaw 7) -->
        <div class="dh-page-card">
          <div class="dh-page-card-header">
            <span class="dh-page-label">Current Target</span>
            <span class="dh-prefix-badge" title="Active URL prefix boundary">Prefix: ${this.escapeHtml(this.session.config.urlPrefix || 'None')}</span>
          </div>
          <div class="dh-page-title" title="${this.escapeHtml(currentPageName)}">${this.escapeHtml(currentPageName)}</div>
          <div class="dh-page-url" title="${this.escapeHtml(currentUrl)}">${this.escapeHtml(currentUrl)}</div>
        </div>

        <!-- Operation Log (Flaw 14) -->
        <div class="dh-op-box" title="${this.escapeHtml(currentOperation)}">
          <svg class="dh-op-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/>
          </svg>
          <span class="dh-op-text">${this.escapeHtml(currentOperation)}</span>
        </div>

        <!-- Staged Pages Review Checklist -->
        ${reviewBoxHtml}

        <!-- Control Buttons -->
        <div class="dh-actions">
          ${actionButtonsHtml}
        </div>

        <!-- Visible Queue Inspector Button (Flaw 9) -->
        <button id="dh-btn-toggle-queue" class="dh-queue-toggle-btn" aria-expanded="${this.session.panelQueueVisible}">
          <span>Queue Inspector (${stats.discovered} pages)</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${this.session.panelQueueVisible ? '<polyline points="18 15 12 9 6 15"/>' : '<polyline points="6 9 12 15 18 9"/>'}
          </svg>
        </button>

        ${queueDrawerHtml}

        <!-- Export Buttons -->
        ${exportBarHtml}

        <!-- Clear Data -->
        ${clearDataHtml}

        <!-- Preview Modal -->
        ${previewModalHtml}

        <!-- Toast Notice -->
        ${toastHtml}
      </div>
    `;

    this.attachEventListeners();
    this.setupDragHandler('dh-drag-handle');
  }

  /**
   * Renders the compact minimized badge.
   */
  private renderMinimized(): void {
    if (!this.container) return;

    const stats = computeSessionStats(this.session);
    const { status } = this.session;

    this.container.className = 'dh-minimized-pill';
    this.applyPosition();

    this.container.innerHTML = `
      <svg class="dh-pill-logo" width="16" height="16" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="7" fill="#161b22" stroke="#30363d" stroke-width="1.5"/>
        <rect x="7" y="7" width="13" height="17" rx="2" fill="#21262d" stroke="#30363d" stroke-width="1"/>
        <rect x="10" y="9" width="14" height="17" rx="2" fill="#0d1117" stroke="#58a6ff" stroke-width="1.2"/>
        <path d="M19 5.5C24.5 5.5 28 9.5 28 15C28 19 25 22.5 21 23.5C22.5 21 23 18.5 23 15.5C23 10.5 19 6.5 14 6.5C15.5 5.8 17.2 5.5 19 5.5Z" fill="#3fb950"/>
      </svg>
      <span class="dh-pill-title">DocuHarvest</span>
      <span class="dh-pill-count">${stats.collected}/${stats.discovered}</span>
      <span class="dh-dot" style="background: ${status === 'running' ? '#3fb950' : '#8b949e'}"></span>
      <button id="dh-btn-close-pill" class="dh-btn-icon dh-btn-close dh-pill-close" title="Exit / Close panel" style="width: 20px; height: 20px; margin-left: 2px;">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;

    const closePillBtn = this.container.querySelector<HTMLButtonElement>('#dh-btn-close-pill');
    if (closePillBtn) {
      closePillBtn.onclick = (e) => {
        e.stopPropagation();
        if (this.events.onClose) {
          this.events.onClose();
        } else {
          this.destroy();
        }
      };
    }

    this.container.onclick = (e) => {
      e.stopPropagation();
      if (!this.hasMoved) {
        this.events.onToggleMinimize();
      }
    };

    this.setupDragHandler(null);
  }

  private applyPosition(): void {
    if (!this.container) return;

    const pos = this.session.panelPosition;
    const maxW = Math.max(10, window.innerWidth - (this.container.offsetWidth || 380) - 10);
    const maxH = Math.max(10, window.innerHeight - (this.container.offsetHeight || 100) - 10);

    if (pos && pos.x >= 0 && pos.y >= 0) {
      const clampedX = Math.max(10, Math.min(maxW, pos.x));
      const clampedY = Math.max(10, Math.min(maxH, pos.y));
      this.container.style.left = `${clampedX}px`;
      this.container.style.top = `${clampedY}px`;
      this.container.style.right = 'auto';
      this.container.style.bottom = 'auto';
    } else {
      this.container.style.right = '20px';
      this.container.style.top = '20px';
      this.container.style.left = 'auto';
      this.container.style.bottom = 'auto';
    }
  }

  private setupDragHandler(handleId: string | null): void {
    const handle = handleId && this.shadow ? this.shadow.getElementById(handleId) : this.container;
    if (!handle || !this.container) return;

    handle.onpointerdown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('input')) return;

      e.preventDefault();
      e.stopPropagation();

      this.isDragging = true;
      this.hasMoved = false;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      const rect = this.container!.getBoundingClientRect();
      this.containerStartX = rect.left;
      this.containerStartY = rect.top;

      this.container!.classList.add('dragging');
      handle.setPointerCapture(e.pointerId);

      handle.onpointermove = (moveEvent: PointerEvent) => {
        if (!this.isDragging || !this.container) return;
        moveEvent.stopPropagation();

        const deltaX = moveEvent.clientX - this.dragStartX;
        const deltaY = moveEvent.clientY - this.dragStartY;

        if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
          this.hasMoved = true;
        }

        let newX = this.containerStartX + deltaX;
        let newY = this.containerStartY + deltaY;

        const maxW = window.innerWidth - this.container.offsetWidth - 10;
        const maxH = window.innerHeight - this.container.offsetHeight - 10;
        newX = Math.max(10, Math.min(maxW, newX));
        newY = Math.max(10, Math.min(maxH, newY));

        this.container.style.left = `${newX}px`;
        this.container.style.top = `${newY}px`;
        this.container.style.right = 'auto';
      };

      handle.onpointerup = (upEvent: PointerEvent) => {
        if (!this.isDragging) return;
        upEvent.stopPropagation();
        this.isDragging = false;
        this.container?.classList.remove('dragging');

        try {
          handle.releasePointerCapture(upEvent.pointerId);
        } catch {
          // released
        }

        handle.onpointermove = null;
        handle.onpointerup = null;

        if (this.hasMoved && this.container) {
          const rect = this.container.getBoundingClientRect();
          const finalPos = { x: rect.left, y: rect.top };
          this.events.onPositionChange(finalPos);
        }
      };
    };
  }

  private attachEventListeners(): void {
    if (!this.shadow) return;

    const bind = (id: string, handler: () => void) => {
      const el = this.shadow!.getElementById(id);
      if (el) {
        el.onclick = (e) => {
          e.stopPropagation();
          handler();
        };
      }
    };

    bind('dh-btn-minimize', () => this.events.onToggleMinimize());
    bind('dh-btn-close', () => {
      if (this.events.onClose) {
        this.events.onClose();
      } else {
        this.destroy();
      }
    });

    bind('dh-btn-toggle-settings', () => {
      if (this.events.onToggleSettings) {
        this.events.onToggleSettings();
      }
    });

    bind('dh-btn-close-settings', () => {
      if (this.events.onToggleSettings) {
        this.events.onToggleSettings();
      }
    });

    bind('dh-btn-save-settings', () => {
      const rateLimitEl = this.shadow!.getElementById('dh-cfg-ratelimit') as HTMLInputElement | null;
      const urlPrefixEl = this.shadow!.getElementById('dh-cfg-urlprefix') as HTMLInputElement | null;
      const selectorEl = this.shadow!.getElementById('dh-cfg-selector') as HTMLInputElement | null;
      const accordionsEl = this.shadow!.getElementById('dh-cfg-accordions') as HTMLInputElement | null;
      const tabsEl = this.shadow!.getElementById('dh-cfg-tabs') as HTMLInputElement | null;
      const autoScrollEl = this.shadow!.getElementById('dh-cfg-autoscroll') as HTMLInputElement | null;

      if (this.events.onUpdateConfig) {
        this.events.onUpdateConfig({
          rateLimitMs: rateLimitEl ? parseInt(rateLimitEl.value, 10) || 1200 : 1200,
          urlPrefix: urlPrefixEl ? urlPrefixEl.value.trim() : this.session.config.urlPrefix,
          contentSelector: selectorEl ? selectorEl.value.trim() : undefined,
          expandAccordions: accordionsEl ? accordionsEl.checked : true,
          captureTabs: tabsEl ? tabsEl.checked : true,
          autoScroll: autoScrollEl ? autoScrollEl.checked : false,
        });
        this.showToast('Configuration updated');
      }
    });

    bind('dh-btn-start', () => this.events.onStart());
    bind('dh-btn-pause', () => this.events.onPause());
    bind('dh-btn-resume', () => this.events.onResume());
    bind('dh-btn-stop', () => this.events.onStop());
    bind('dh-btn-reset', () => this.events.onReset());

    // Selector dropdown change handler
    const selectorDropdown = this.shadow!.getElementById('dh-cfg-selector-dropdown') as HTMLSelectElement | null;
    const selectorInput = this.shadow!.getElementById('dh-cfg-selector') as HTMLInputElement | null;
    if (selectorDropdown && selectorInput) {
      selectorDropdown.onchange = (e) => {
        e.stopPropagation();
        const val = selectorDropdown.value;
        if (val === '__custom__') {
          selectorInput.style.display = 'block';
          selectorInput.focus();
        } else {
          selectorInput.value = val;
          selectorInput.style.display = val ? 'block' : 'none';
        }
      };
    }

    bind('dh-btn-pick-element', () => this.startElementPicker());

    // Review stage action buttons
    bind('dh-btn-confirm-harvest', () => {
      const selectedUrls: string[] = [];
      const scrollPrefs: Record<string, boolean> = {};

      this.shadow!.querySelectorAll<HTMLInputElement>('.dh-review-chk-page').forEach(chk => {
        const url = chk.getAttribute('data-url');
        if (url && chk.checked) {
          selectedUrls.push(url);
        }
      });

      this.shadow!.querySelectorAll<HTMLInputElement>('.dh-review-chk-scroll').forEach(chk => {
        const url = chk.getAttribute('data-url');
        if (url) {
          scrollPrefs[url] = chk.checked;
        }
      });

      if (this.events.onConfirmHarvest) {
        this.events.onConfirmHarvest(selectedUrls, scrollPrefs);
      } else {
        this.events.onStart();
      }
    });

    bind('dh-btn-cancel-review', () => {
      if (this.events.onReset) {
        this.events.onReset();
      }
    });

    // Review bulk toggles
    const allPagesChk = this.shadow!.getElementById('dh-review-chk-all-pages') as HTMLInputElement | null;
    if (allPagesChk) {
      allPagesChk.onchange = (e) => {
        e.stopPropagation();
        const checked = allPagesChk.checked;
        if (this.events.onSelectAllPages) {
          this.events.onSelectAllPages(checked);
        } else {
          for (const page of Object.values(this.session.discoveredPages)) {
            page.selected = checked;
          }
          this.render(this.session);
        }
      };
    }

    const allScrollChk = this.shadow!.getElementById('dh-review-chk-all-scroll') as HTMLInputElement | null;
    if (allScrollChk) {
      allScrollChk.onchange = (e) => {
        e.stopPropagation();
        const checked = allScrollChk.checked;
        if (this.events.onSelectAllScroll) {
          this.events.onSelectAllScroll(checked);
        } else {
          for (const page of Object.values(this.session.discoveredPages)) {
            page.requiresScroll = checked;
          }
          this.render(this.session);
        }
      };
    }

    // Review item toggles
    this.shadow!.querySelectorAll<HTMLInputElement>('.dh-review-chk-page').forEach(chk => {
      chk.onchange = (e) => {
        e.stopPropagation();
        const url = chk.getAttribute('data-url');
        if (url) {
          if (this.events.onTogglePageSelection) {
            this.events.onTogglePageSelection(url, chk.checked);
          } else if (this.session.discoveredPages[url]) {
            this.session.discoveredPages[url].selected = chk.checked;
            this.render(this.session);
          }
        }
      };
    });

    this.shadow!.querySelectorAll<HTMLInputElement>('.dh-review-chk-scroll').forEach(chk => {
      chk.onchange = (e) => {
        e.stopPropagation();
        const url = chk.getAttribute('data-url');
        if (url) {
          if (this.events.onTogglePageScroll) {
            this.events.onTogglePageScroll(url, chk.checked);
          } else if (this.session.discoveredPages[url]) {
            this.session.discoveredPages[url].requiresScroll = chk.checked;
            this.render(this.session);
          }
        }
      };
    });

    bind('dh-btn-export-md', () => {
      this.events.onExportMarkdown();
      this.showToast('Exported Markdown bundle');
    });

    bind('dh-btn-export-json', () => {
      this.events.onExportJson();
      this.showToast('Exported JSON bundle');
    });

    bind('dh-btn-export-csv', () => {
      this.events.onExportCsv();
      this.showToast('Exported CSV bundle');
    });

    bind('dh-btn-copy-md', async () => {
      if (this.events.onCopyMarkdown) {
        this.events.onCopyMarkdown();
      } else {
        await copyMarkdownToClipboard(this.session);
      }
      this.showToast('Copied bundle to clipboard');
    });

    bind('dh-btn-copy-preview', async () => {
      if (this.session.previewPageUrl && this.session.collectedPages[this.session.previewPageUrl]) {
        const md = this.session.collectedPages[this.session.previewPageUrl].markdown;
        try {
          await navigator.clipboard.writeText(md);
          this.showToast('Page markdown copied');
        } catch {
          this.showToast('Copy failed');
        }
      }
    });

    bind('dh-btn-toggle-queue', () => this.events.onToggleQueue());
    bind('dh-btn-close-preview', () => this.events.onPreviewPage(null));

    // Queue search input
    const searchInput = this.shadow!.getElementById('dh-queue-search') as HTMLInputElement | null;
    if (searchInput) {
      searchInput.oninput = (e) => {
        e.stopPropagation();
        this.queueSearchQuery = searchInput.value;
        this.render(this.session);
      };
    }

    // Queue filter tabs
    this.shadow!.querySelectorAll<HTMLButtonElement>('.dh-queue-filter-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const filter = btn.getAttribute('data-filter') || 'all';
        this.queueStatusFilter = filter;
        this.render(this.session);
      };
    });

    // Queue bulk actions
    bind('dh-btn-skip-all-pending', () => {
      if (this.events.onSkipAllPending) {
        this.events.onSkipAllPending();
        this.showToast('Skipped pending queue');
      }
    });

    bind('dh-btn-retry-all-failed', () => {
      if (this.events.onRetryAllFailed) {
        this.events.onRetryAllFailed();
        this.showToast('Re-queued failed pages');
      }
    });

    // Clear data confirmation handlers
    bind('dh-btn-clear-data', () => {
      this.showClearConfirm = true;
      this.render(this.session);
    });

    bind('dh-btn-cancel-clear', () => {
      this.showClearConfirm = false;
      this.render(this.session);
    });

    bind('dh-btn-confirm-clear', () => {
      this.showClearConfirm = false;
      this.events.onClearData();
      this.showToast('Storage wiped and reset');
    });

    // Preview button clicks
    this.shadow!.querySelectorAll<HTMLButtonElement>('.dh-btn-preview').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const url = btn.getAttribute('data-url');
        if (url) {
          this.events.onPreviewPage(url);
        }
      };
    });

    // Per-item action buttons
    this.shadow!.querySelectorAll<HTMLButtonElement>('.dh-btn-skip').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const url = btn.getAttribute('data-url');
        if (url && this.events.onSkipPage) {
          this.events.onSkipPage(url);
        }
      };
    });

    this.shadow!.querySelectorAll<HTMLButtonElement>('.dh-btn-retry').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const url = btn.getAttribute('data-url');
        if (url && this.events.onRetryPage) {
          this.events.onRetryPage(url);
        }
      };
    });

    this.shadow!.querySelectorAll<HTMLButtonElement>('.dh-btn-prioritize').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const url = btn.getAttribute('data-url');
        if (url && this.events.onPrioritizePage) {
          this.events.onPrioritizePage(url);
          this.showToast('Moved to top of queue');
        }
      };
    });
  }

  /**
   * Interactive visual element picker for selecting custom content container.
   */
  private startElementPicker(): void {
    const existing = document.getElementById('dh-picker-highlight');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'dh-picker-highlight';
    overlay.style.cssText = `
      position: fixed !important;
      pointer-events: none !important;
      z-index: 2147483646 !important;
      border: 2px solid #58a6ff !important;
      background: rgba(88, 166, 255, 0.08) !important;
      box-sizing: border-box !important;
      transition: all 0.05s ease !important;
      display: none;
    `;
    document.body.appendChild(overlay);

    const onMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target || target.closest('#docuharvest-root') || target.id === 'dh-picker-highlight') {
        overlay.style.display = 'none';
        return;
      }
      const rect = target.getBoundingClientRect();
      overlay.style.display = 'block';
      overlay.style.top = `${rect.top}px`;
      overlay.style.left = `${rect.left}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
    };

    const cleanup = () => {
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      overlay.remove();
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && !target.closest('#docuharvest-root') && target.id !== 'dh-picker-highlight') {
        e.preventDefault();
        e.stopPropagation();
        cleanup();

        let sel = target.tagName.toLowerCase();
        if (target.id) {
          sel = `#${target.id}`;
        } else if (target.className && typeof target.className === 'string') {
          const firstClass = target.className.split(/\s+/).filter(c => c && !c.startsWith('dh-'))[0];
          if (firstClass) {
            sel = `${sel}.${firstClass}`;
          }
        }

        const input = this.shadow?.getElementById('dh-cfg-selector') as HTMLInputElement | null;
        const dropdown = this.shadow?.getElementById('dh-cfg-selector-dropdown') as HTMLSelectElement | null;
        if (input) {
          input.value = sel;
          input.style.display = 'block';
        }
        if (dropdown) {
          dropdown.value = '__custom__';
        }
        if (this.events.onUpdateConfig) {
          this.events.onUpdateConfig({ contentSelector: sel });
        }
        this.showToast(`Selected container: ${sel}`);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
        this.showToast('Inspection canceled');
      }
    };

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    this.showToast('Hover and click container element (Esc to cancel)');
  }

  private escapeHtml(str: string): string {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
