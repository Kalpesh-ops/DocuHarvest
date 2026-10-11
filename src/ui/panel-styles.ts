/**
 * DocuHarvest - Shadow DOM Scoped Styles
 * Complete CSS design system isolated from the host page.
 */

export const PANEL_CSS = `
:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: #f1f5f9;
  box-sizing: border-box;
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.dh-container {
  position: fixed;
  z-index: 2147483647;
  pointer-events: auto;
  user-select: none;
  width: 390px;
  max-width: 94vw;
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05);
  transition: box-shadow 0.2s ease, opacity 0.2s ease;
  overflow: hidden;
}

.dh-container.dragging {
  opacity: 0.92;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 2px rgba(99, 102, 241, 0.5);
  cursor: grabbing !important;
}

/* Header & Drag Area */
.dh-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: rgba(30, 41, 59, 0.6);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  cursor: grab;
}

.dh-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dh-icon {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: linear-gradient(135deg, #10b981, #06b6d4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 12px;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.4);
}

.dh-title {
  font-size: 13px;
  font-weight: 600;
  color: #f8fafc;
  letter-spacing: -0.01em;
}

.dh-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dh-btn-icon {
  background: transparent;
  border: none;
  color: #94a3b8;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.dh-btn-icon:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #f8fafc;
}

/* Body */
.dh-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 85vh;
  overflow-y: auto;
}

/* Status & Badges */
.dh-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dh-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.dh-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.dh-badge-idle {
  background: rgba(148, 163, 184, 0.15);
  color: #cbd5e1;
  border: 1px solid rgba(148, 163, 184, 0.25);
}
.dh-badge-idle .dh-dot { background: #94a3b8; }

.dh-badge-running {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}
.dh-badge-running .dh-dot {
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
  animation: dh-pulse 1.5s infinite;
}

.dh-badge-paused {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}
.dh-badge-paused .dh-dot { background: #f59e0b; }

.dh-badge-stopped {
  background: rgba(244, 63, 94, 0.15);
  color: #fb7185;
  border: 1px solid rgba(244, 63, 94, 0.3);
}
.dh-badge-stopped .dh-dot { background: #f43f5e; }

.dh-badge-completed {
  background: rgba(6, 182, 212, 0.15);
  color: #22d3ee;
  border: 1px solid rgba(6, 182, 212, 0.3);
}
.dh-badge-completed .dh-dot {
  background: #06b6d4;
  box-shadow: 0 0 8px #06b6d4;
}

.dh-badge-error {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.35);
}
.dh-badge-error .dh-dot { background: #ef4444; }

@keyframes dh-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}

.dh-progress-pill {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
}

/* Progress bar */
.dh-progress-track {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  overflow: hidden;
}

.dh-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #10b981, #06b6d4);
  border-radius: 9999px;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Stats Grid */
.dh-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.dh-stat-box {
  background: rgba(30, 41, 59, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.dh-stat-val {
  font-size: 16px;
  font-weight: 700;
  color: #f8fafc;
}

.dh-stat-val.highlight {
  color: #10b981;
}

.dh-stat-lbl {
  font-size: 10px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-top: 2px;
}

/* Current Page Card */
.dh-page-card {
  background: rgba(30, 41, 59, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dh-page-label {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.dh-page-title {
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dh-page-url {
  font-size: 11px;
  color: #0ea5e9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

/* Operation Log */
.dh-op-box {
  font-size: 11px;
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.dh-op-icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
}

.dh-op-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Actions Controls */
.dh-actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.dh-btn {
  flex: 1;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.dh-btn-primary {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.dh-btn-primary:hover {
  background: linear-gradient(135deg, #34d399, #10b981);
  box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4);
}

.dh-btn-warning {
  background: rgba(245, 158, 11, 0.18);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.35);
}

.dh-btn-warning:hover {
  background: rgba(245, 158, 11, 0.28);
}

.dh-btn-danger {
  background: rgba(244, 63, 94, 0.15);
  color: #fb7185;
  border: 1px solid rgba(244, 63, 94, 0.3);
}

.dh-btn-danger:hover {
  background: rgba(244, 63, 94, 0.25);
}

.dh-btn-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.dh-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #f8fafc;
}

/* Queue List Section */
.dh-queue-toggle-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: all 0.15s ease;
}

.dh-queue-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.09);
  color: #f8fafc;
}

.dh-queue-drawer {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.dh-queue-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.03);
  font-size: 11px;
  gap: 6px;
}

.dh-queue-item-info {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.dh-queue-item-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #e2e8f0;
  font-weight: 500;
}

.dh-queue-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dh-dot-pending { background: #64748b; }
.dh-dot-in_progress { background: #38bdf8; box-shadow: 0 0 6px #38bdf8; }
.dh-dot-completed { background: #10b981; }
.dh-dot-partial { background: #f59e0b; box-shadow: 0 0 4px rgba(245, 158, 11, 0.5); }
.dh-dot-failed { background: #ef4444; }
.dh-dot-skipped { background: #f59e0b; }

.dh-queue-meta {
  font-size: 10px;
  color: #94a3b8;
  flex-shrink: 0;
}

.dh-queue-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dh-btn-mini {
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 4px;
  color: #94a3b8;
  font-size: 10px;
  padding: 2px 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.dh-btn-mini:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #f8fafc;
}

/* Export Bar */
.dh-export-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 10px;
}

.dh-export-label {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.dh-export-buttons-row {
  display: flex;
  gap: 6px;
}

.dh-export-btn {
  flex: 1;
  padding: 7px 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  background: rgba(6, 182, 212, 0.12);
  color: #22d3ee;
  border: 1px solid rgba(6, 182, 212, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: all 0.15s ease;
}

.dh-export-btn:hover {
  background: rgba(6, 182, 212, 0.22);
}

.dh-export-btn-primary {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2));
  color: #34d399;
  border-color: rgba(16, 185, 129, 0.35);
}

.dh-export-btn-primary:hover {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(6, 182, 212, 0.3));
}

/* Clear Data & Reset Action */
.dh-footer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 4px;
}

.dh-btn-text-danger {
  background: transparent;
  border: none;
  color: #f43f5e;
  font-size: 11px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.dh-btn-text-danger:hover {
  background: rgba(244, 63, 94, 0.12);
}

/* Confirmation Box */
.dh-confirm-box {
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid rgba(244, 63, 94, 0.4);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dh-confirm-msg {
  font-size: 11px;
  color: #fecdd3;
  line-height: 1.4;
}

.dh-confirm-actions {
  display: flex;
  gap: 8px;
}

/* Content Preview Modal */
.dh-preview-modal {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.98);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  z-index: 10;
  display: flex;
  flex-direction: column;
  padding: 14px;
  gap: 10px;
}

.dh-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 8px;
}

.dh-preview-title {
  font-size: 13px;
  font-weight: 700;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
}

.dh-preview-meta {
  font-size: 11px;
  color: #94a3b8;
  display: flex;
  gap: 8px;
}

.dh-preview-body {
  flex: 1;
  overflow-y: auto;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #e2e8f0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

/* Minimized Floating Pill */
.dh-minimized-pill {
  position: fixed;
  z-index: 2147483647;
  pointer-events: auto;
  user-select: none;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 9999px;
  padding: 8px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
  cursor: pointer;
  transition: all 0.2s ease;
}

.dh-minimized-pill:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.65);
  border-color: rgba(16, 185, 129, 0.4);
}

.dh-pill-title {
  font-size: 12px;
  font-weight: 600;
  color: #f8fafc;
}

.dh-pill-count {
  font-size: 11px;
  font-weight: 700;
  color: #10b981;
  background: rgba(16, 185, 129, 0.15);
  padding: 2px 7px;
  border-radius: 9999px;
}
`;
