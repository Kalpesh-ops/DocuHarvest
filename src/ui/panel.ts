/**
 * DocuHarvest - Floating Control Panel with Isolated Shadow DOM
 * Viewport pinning, drag physics, event isolation, queue inspector,
 * content preview modal, and multi-format export controls.
 */

import { HarvestSession, PanelEvents } from '../types';
import { computeSessionStats } from '../storage/storage';
import { PANEL_CSS } from './panel-styles';

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

    this.render(this.session);

    const mountTarget = document.body || document.documentElement;
    mountTarget.appendChild(this.host);
  }

  /**
   * Destroys or removes the panel from the DOM safely.
   */
  public destroy(): void {
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

    this.container.className = 'dh-container';
    this.applyPosition();

    const badgeClass = `dh-badge dh-badge-${status}`;
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

    // Action button states
    let actionButtonsHtml = '';
    if (status === 'idle' || status === 'completed') {
      actionButtonsHtml = `
        <button id="dh-btn-start" class="dh-btn dh-btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          ${status === 'completed' ? 'Restart Harvest' : 'Start Collection'}
        </button>
      `;
    } else if (status === 'running') {
      actionButtonsHtml = `
        <button id="dh-btn-pause" class="dh-btn dh-btn-warning">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          Pause
        </button>
        <button id="dh-btn-stop" class="dh-btn dh-btn-danger">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16"/></svg>
          Stop
        </button>
      `;
    } else if (status === 'paused') {
      actionButtonsHtml = `
        <button id="dh-btn-resume" class="dh-btn dh-btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Resume
        </button>
        <button id="dh-btn-stop" class="dh-btn dh-btn-danger">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16"/></svg>
          Stop
        </button>
      `;
    } else if (status === 'stopped' || status === 'error') {
      actionButtonsHtml = `
        <button id="dh-btn-start" class="dh-btn dh-btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Resume / Start
        </button>
        <button id="dh-btn-reset" class="dh-btn dh-btn-secondary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          Reset
        </button>
      `;
    }

    // Queue List Drawer
    let queueDrawerHtml = '';
    const discoveredList = this.session.pagesOrder.map(url => this.session.discoveredPages[url]).filter(Boolean);

    if (this.session.panelQueueVisible) {
      if (discoveredList.length > 0) {
        const itemsHtml = discoveredList.map(page => {
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
            actionBtn = `<button class="dh-btn-mini dh-btn-skip" data-url="${this.escapeHtml(page.url)}">Skip</button>`;
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
        }).join('');

        queueDrawerHtml = `
          <div class="dh-queue-drawer">
            ${itemsHtml}
          </div>
        `;
      } else {
        queueDrawerHtml = `
          <div class="dh-queue-drawer" style="padding: 10px; text-align: center; color: #8b949e; font-size: 11px;">
            Queue is empty. Click "Start Collection" to discover pages.
          </div>
        `;
      }
    }

    // Export Bar (Markdown, JSON, CSV)
    const exportBarHtml = stats.collected > 0 ? `
      <div class="dh-export-bar">
        <span class="dh-export-label">Download Bundle (${stats.collected} pages, ~${stats.totalWords} words)</span>
        <div class="dh-export-buttons-row">
          <button id="dh-btn-export-md" class="dh-export-btn dh-export-btn-primary" title="Export primary documentation-bundle.md">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Markdown (.md)
          </button>
          <button id="dh-btn-export-json" class="dh-export-btn" title="Export structured documentation-bundle.json">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            JSON
          </button>
          <button id="dh-btn-export-csv" class="dh-export-btn" title="Export tabular documentation-bundle.csv">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
            CSV
          </button>
        </div>
      </div>
    ` : '';

    // Clear Data / Reset Confirmation
    let clearDataHtml = '';
    if (this.showClearConfirm) {
      clearDataHtml = `
        <div class="dh-confirm-box">
          <div class="dh-confirm-msg">Delete all collected documentation and reset state? This cannot be undone.</div>
          <div class="dh-confirm-actions">
            <button id="dh-btn-confirm-clear" class="dh-btn dh-btn-danger" style="padding: 4px 8px; font-size: 11px;">Yes, Delete All</button>
            <button id="dh-btn-cancel-clear" class="dh-btn dh-btn-secondary" style="padding: 4px 8px; font-size: 11px;">Cancel</button>
          </div>
        </div>
      `;
    } else {
      clearDataHtml = `
        <div class="dh-footer-bar">
          <button id="dh-btn-clear-data" class="dh-btn-text-danger" title="Clear all collected documentation data">Clear Stored Data</button>
          <div class="dh-footer-meta">
            <span title="All data stored strictly in local browser storage">Local (Zero Telemetry)</span>
            <span>•</span>
            <span title="Open Source License">MIT</span>
            <span>•</span>
            <span>v0.1.0</span>
          </div>
        </div>
      `;
    }

    // Preview Modal Overlay
    let previewModalHtml = '';
    if (this.session.previewPageUrl && this.session.collectedPages[this.session.previewPageUrl]) {
      const previewPage = this.session.collectedPages[this.session.previewPageUrl];
      const breadcrumbStr = previewPage.breadcrumbs ? previewPage.breadcrumbs.join(' > ') : '';

      previewModalHtml = `
        <div class="dh-preview-modal">
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
            <button id="dh-btn-close-preview" class="dh-btn-icon" title="Close preview">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="dh-preview-body">${this.escapeHtml(previewPage.markdown)}</div>
        </div>
      `;
    }

    this.container.innerHTML = `
      <div class="dh-header" id="dh-drag-handle">
        <div class="dh-brand">
          <div class="dh-icon">DH</div>
          <span class="dh-title">DocuHarvest</span>
        </div>
        <div class="dh-header-actions">
          <button id="dh-btn-minimize" class="dh-btn-icon" title="Minimize panel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button id="dh-btn-close" class="dh-btn-icon dh-btn-close" title="Exit / Close panel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <div class="dh-body">
        <!-- Status & Progress Percentage -->
        <div class="dh-status-bar">
          <div class="${badgeClass}">
            <span class="dh-dot"></span>
            <span>${statusLabel}</span>
          </div>
          <span class="dh-progress-pill">${stats.progressPercentage}%</span>
        </div>

        <!-- Progress Bar -->
        <div class="dh-progress-track">
          <div class="dh-progress-fill" style="width: ${stats.progressPercentage}%"></div>
        </div>

        <!-- Precision Telemetry Matrix (replaces generic 3 cards in a row) -->
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
            <span class="dh-telemetry-val">${stats.totalWords > 0 ? `${Math.round(stats.totalWords / 100) / 10}k` : '0'}</span>
            <span class="dh-telemetry-lbl">Words</span>
          </div>
        </div>

        <!-- Current Page Context -->
        <div class="dh-page-card">
          <span class="dh-page-label">Current Page</span>
          <div class="dh-page-title" title="${this.escapeHtml(currentPageName)}">${this.escapeHtml(currentPageName)}</div>
          <div class="dh-page-url" title="${this.escapeHtml(currentUrl)}">${this.escapeHtml(currentUrl)}</div>
        </div>

        <!-- Current Operation Log -->
        <div class="dh-op-box">
          <svg class="dh-op-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/>
          </svg>
          <span class="dh-op-text" title="${this.escapeHtml(currentOperation)}">${this.escapeHtml(currentOperation)}</span>
        </div>

        <!-- Control Buttons -->
        <div class="dh-actions">
          ${actionButtonsHtml}
        </div>

        <!-- Visible Queue Inspector Button -->
        <button id="dh-btn-toggle-queue" class="dh-queue-toggle-btn">
          <span>Page Queue (${stats.discovered} pages)</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
      <div class="dh-icon" style="width: 16px; height: 16px; font-size: 9px;">DH</div>
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
    if (pos && pos.x >= 0 && pos.y >= 0) {
      const clampedX = Math.max(10, Math.min(window.innerWidth - 60, pos.x));
      const clampedY = Math.max(10, Math.min(window.innerHeight - 60, pos.y));
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
      if (target.closest('button')) return;

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
    bind('dh-btn-start', () => this.events.onStart());
    bind('dh-btn-pause', () => this.events.onPause());
    bind('dh-btn-resume', () => this.events.onResume());
    bind('dh-btn-stop', () => this.events.onStop());
    bind('dh-btn-reset', () => this.events.onReset());
    bind('dh-btn-export-md', () => this.events.onExportMarkdown());
    bind('dh-btn-export-json', () => this.events.onExportJson());
    bind('dh-btn-export-csv', () => this.events.onExportCsv());
    bind('dh-btn-toggle-queue', () => this.events.onToggleQueue());
    bind('dh-btn-close-preview', () => this.events.onPreviewPage(null));

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
    });

    // Preview button clicks
    this.shadow.querySelectorAll<HTMLButtonElement>('.dh-btn-preview').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const url = btn.getAttribute('data-url');
        if (url) {
          this.events.onPreviewPage(url);
        }
      };
    });

    // Per-item action buttons
    this.shadow.querySelectorAll<HTMLButtonElement>('.dh-btn-skip').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const url = btn.getAttribute('data-url');
        if (url && this.events.onSkipPage) {
          this.events.onSkipPage(url);
        }
      };
    });

    this.shadow.querySelectorAll<HTMLButtonElement>('.dh-btn-retry').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const url = btn.getAttribute('data-url');
        if (url && this.events.onRetryPage) {
          this.events.onRetryPage(url);
        }
      };
    });
  }

  private escapeHtml(str: string): string {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
