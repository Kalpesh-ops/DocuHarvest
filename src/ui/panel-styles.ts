/**
 * DocuHarvest - Shadow DOM Scoped Styles
 * Professional, industrial-grade engineering aesthetic.
 * Strict adherence to utility-first, high-density, flat technical design:
 * - Solid surfaces with 1px border hierarchy (no liquid glass / blur)
 * - Zero drop shadows (clean borders and contrast)
 * - Precision corner radii (2px-4px, no soft bubble/pill radii)
 * - Calibrated dark technical palette (no purple/black, no neon, no pastels)
 * - Instantaneous, solid hover states (no bouncy translateY transforms)
 * - Clean monospace telemetry and native system typography
 */

export const PANEL_CSS = `
:host {
  all: initial;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 12px;
  line-height: 1.4;
  color: #c9d1d9;
  box-sizing: border-box;
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* Main Panel Container */
.dh-container {
  position: fixed;
  z-index: 2147483647;
  pointer-events: auto;
  user-select: none;
  width: 380px;
  max-width: 94vw;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 4px;
  box-shadow: none;
  overflow: hidden;
}

.dh-container.dragging {
  border-color: #58a6ff;
  cursor: grabbing !important;
}

/* Header & Drag Area */
.dh-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #161b22;
  border-bottom: 1px solid #30363d;
  cursor: grab;
}

.dh-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dh-icon {
  width: 18px;
  height: 18px;
  border-radius: 2px;
  background: #238636;
  border: 1px solid #2ea043;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-weight: 700;
  font-size: 10px;
  letter-spacing: -0.02em;
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
}

.dh-title {
  font-size: 12px;
  font-weight: 600;
  color: #f0f6fc;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.dh-header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.dh-btn-icon {
  background: transparent;
  border: 1px solid transparent;
  color: #8b949e;
  width: 24px;
  height: 24px;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.1s ease, border-color 0.1s ease, color 0.1s ease;
}

.dh-btn-icon:hover {
  background: #21262d;
  border-color: #30363d;
  color: #f0f6fc;
}

.dh-btn-close:hover {
  background: #3d1d24 !important;
  border-color: #671e27 !important;
  color: #f85149 !important;
}

/* Body */
.dh-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 85vh;
  overflow-y: auto;
  background: #0d1117;
}

/* Status Bar */
.dh-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 2px;
  padding: 6px 10px;
}

.dh-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
}

.dh-dot {
  width: 6px;
  height: 6px;
  border-radius: 1px;
}

.dh-badge-idle {
  color: #8b949e;
}
.dh-badge-idle .dh-dot { background: #8b949e; }

.dh-badge-running {
  color: #3fb950;
}
.dh-badge-running .dh-dot {
  background: #3fb950;
}

.dh-badge-paused {
  color: #d29922;
}
.dh-badge-paused .dh-dot { background: #d29922; }

.dh-badge-stopped {
  color: #f85149;
}
.dh-badge-stopped .dh-dot { background: #f85149; }

.dh-badge-completed {
  color: #58a6ff;
}
.dh-badge-completed .dh-dot {
  background: #58a6ff;
}

.dh-badge-error {
  color: #f85149;
}
.dh-badge-error .dh-dot { background: #f85149; }

.dh-progress-pill {
  font-size: 11px;
  font-weight: 600;
  color: #c9d1d9;
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
}

/* Precision Progress Bar */
.dh-progress-track {
  width: 100%;
  height: 3px;
  background: #21262d;
  border-radius: 0;
  overflow: hidden;
}

.dh-progress-fill {
  height: 100%;
  background: #238636;
  border-radius: 0;
  transition: width 0.2s linear;
}

/* Integrated Telemetry Matrix (replaces generic 3 cards in a row) */
.dh-telemetry-matrix {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 2px;
  overflow: hidden;
}

.dh-telemetry-cell {
  display: flex;
  flex-direction: column;
  padding: 6px 8px;
  border-right: 1px solid #21262d;
  text-align: center;
}

.dh-telemetry-cell:last-child {
  border-right: none;
}

.dh-telemetry-val {
  font-size: 13px;
  font-weight: 700;
  color: #f0f6fc;
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
}

.dh-telemetry-val.highlight {
  color: #3fb950;
}

.dh-telemetry-lbl {
  font-size: 9px;
  font-weight: 600;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 1px;
}

/* Current Page Card */
.dh-page-card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 2px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.dh-page-label {
  font-size: 9px;
  font-weight: 600;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.dh-page-title {
  font-size: 11px;
  font-weight: 600;
  color: #f0f6fc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dh-page-url {
  font-size: 10px;
  color: #58a6ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
}

/* Operation Log */
.dh-op-box {
  font-size: 10px;
  color: #8b949e;
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 2px;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
}

.dh-op-icon {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  color: #3fb950;
}

.dh-op-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #c9d1d9;
}

/* Actions Controls */
.dh-actions {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}

.dh-btn {
  flex: 1;
  padding: 7px 10px;
  border-radius: 2px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-shadow: none;
  transition: background-color 0.1s ease, border-color 0.1s ease, color 0.1s ease;
  font-family: system-ui, -apple-system, sans-serif;
}

.dh-btn-primary {
  background: #238636;
  border-color: #2ea043;
  color: #ffffff;
}

.dh-btn-primary:hover {
  background: #2ea043;
  border-color: #3fb950;
}

.dh-btn-warning {
  background: #21262d;
  border-color: #6e4f00;
  color: #d29922;
}

.dh-btn-warning:hover {
  background: #2c210a;
  border-color: #bb8009;
}

.dh-btn-danger {
  background: #21262d;
  border-color: #671e27;
  color: #f85149;
}

.dh-btn-danger:hover {
  background: #3d1d24;
  border-color: #b62324;
}

.dh-btn-secondary {
  background: #21262d;
  border-color: #30363d;
  color: #c9d1d9;
}

.dh-btn-secondary:hover {
  background: #30363d;
  border-color: #8b949e;
  color: #f0f6fc;
}

/* Queue List Section */
.dh-queue-toggle-btn {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 2px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #c9d1d9;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  box-shadow: none;
  transition: background-color 0.1s ease, border-color 0.1s ease;
}

.dh-queue-toggle-btn:hover {
  background: #21262d;
  border-color: #8b949e;
  color: #f0f6fc;
}

.dh-queue-drawer {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 2px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.dh-queue-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px;
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 2px;
  font-size: 11px;
  gap: 6px;
}

.dh-queue-item:hover {
  border-color: #30363d;
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
  color: #c9d1d9;
  font-weight: 500;
}

.dh-queue-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 1px;
  flex-shrink: 0;
}

.dh-dot-pending { background: #8b949e; }
.dh-dot-in_progress { background: #58a6ff; }
.dh-dot-completed { background: #3fb950; }
.dh-dot-partial { background: #d29922; }
.dh-dot-failed { background: #f85149; }
.dh-dot-skipped { background: #8b949e; }

.dh-queue-meta {
  font-size: 10px;
  color: #8b949e;
  flex-shrink: 0;
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
}

.dh-queue-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dh-btn-mini {
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 2px;
  color: #c9d1d9;
  font-size: 10px;
  padding: 2px 6px;
  cursor: pointer;
  transition: background-color 0.1s ease, border-color 0.1s ease;
}

.dh-btn-mini:hover {
  background: #30363d;
  border-color: #8b949e;
  color: #f0f6fc;
}

/* Export Bar */
.dh-export-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px solid #21262d;
  padding-top: 8px;
}

.dh-export-label {
  font-size: 9px;
  font-weight: 600;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.dh-export-buttons-row {
  display: flex;
  gap: 6px;
}

.dh-export-btn {
  flex: 1;
  padding: 6px 8px;
  border-radius: 2px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  background: #161b22;
  color: #c9d1d9;
  border: 1px solid #30363d;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  box-shadow: none;
  transition: background-color 0.1s ease, border-color 0.1s ease, color 0.1s ease;
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
}

.dh-export-btn:hover {
  background: #21262d;
  border-color: #8b949e;
  color: #f0f6fc;
}

.dh-export-btn-primary {
  background: #1f2937;
  border-color: #374151;
  color: #3fb950;
}

.dh-export-btn-primary:hover {
  background: #161b22;
  border-color: #2ea043;
  color: #2ea043;
}

/* Clear Data & Reset Action */
.dh-footer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #21262d;
  padding-top: 8px;
}

.dh-footer-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: #6e7681;
}

.dh-btn-text-danger {
  background: transparent;
  border: none;
  color: #f85149;
  font-size: 10px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 2px;
  transition: color 0.1s ease;
}

.dh-btn-text-danger:hover {
  text-decoration: underline;
  color: #ff7b72;
}

/* Confirmation Box */
.dh-confirm-box {
  background: #161b22;
  border: 1px solid #671e27;
  border-radius: 2px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dh-confirm-msg {
  font-size: 11px;
  color: #f85149;
  line-height: 1.3;
}

.dh-confirm-actions {
  display: flex;
  gap: 6px;
}

/* Content Preview Modal */
.dh-preview-modal {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #0d1117;
  z-index: 10;
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  gap: 8px;
}

.dh-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #30363d;
  padding-bottom: 6px;
}

.dh-preview-title {
  font-size: 12px;
  font-weight: 700;
  color: #f0f6fc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
}

.dh-preview-meta {
  font-size: 10px;
  color: #8b949e;
  display: flex;
  gap: 6px;
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
}

.dh-preview-body {
  flex: 1;
  overflow-y: auto;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 2px;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.5;
  color: #c9d1d9;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
}

/* Minimized Floating Block (Rectangular engineering badge, no pill or liquid glass) */
.dh-minimized-pill {
  position: fixed;
  z-index: 2147483647;
  pointer-events: auto;
  user-select: none;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 4px;
  padding: 5px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: none;
  cursor: pointer;
  transition: border-color 0.1s ease, background-color 0.1s ease;
}

.dh-minimized-pill:hover {
  background: #161b22;
  border-color: #58a6ff;
}

.dh-pill-title {
  font-size: 11px;
  font-weight: 600;
  color: #f0f6fc;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.dh-pill-count {
  font-size: 10px;
  font-weight: 700;
  color: #3fb950;
  background: #161b22;
  border: 1px solid #21262d;
  padding: 1px 6px;
  border-radius: 2px;
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
}
`;
