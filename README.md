# DocuHarvest — Private Documentation Collector

> Production-quality WXT + TypeScript Chrome extension (Manifest V3) for privately extracting, compiling, and exporting documentation from authenticated web sessions into AI-ready knowledge bases.

---

## 🎯 Architecture Overview

DocuHarvest is designed for secure, local extraction of documentation behind authentication (SSO, VPN, paid portals) where raw scrapers and curl scripts cannot reach. All DOM processing, hierarchy resolution, and compilation happen entirely inside the browser's local sandbox with zero external telemetry, zero tracking, and zero remote data transmission.

```
ext-n-comp/
├── .output/
│   └── chrome-mv3/          # Compiled production extension for Chrome
├── entrypoints/
│   ├── background.ts        # Service worker (toolbar action badge synchronization)
│   └── content.ts           # Content script mounting, singleton guard & orchestrator bridge
├── src/
│   ├── types/               # Domain models (Session, Page, Config, Stats, ContentBlock)
│   ├── storage/             # Durable state persistence via chrome.storage.local
│   ├── discovery/           # Sidebar TOC detection & link hierarchy discovery
│   ├── extractor/
│   │   ├── dom-extractor.ts # Rendered DOM extractor (lazy scroll, expanders, Markdown)
│   │   └── tab-extractor.ts # Safe multi-tab switcher and panel reader
│   ├── orchestrator/        # State machine (Idle, Running, Paused, Stopped, Completed)
│   ├── export/              # Master Markdown (.md), JSON (.json), and CSV (.csv) compilers
│   └── ui/
│       ├── panel.ts         # Isolated Shadow DOM floating panel with drag physics
│       └── panel-styles.ts  # Scoped dark glassmorphic CSS design system
├── tests/
│   ├── test-utils.ts        # Mock Chrome API test environment
│   ├── docuharvest.test.ts  # Core unit tests (canonical URLs, deduplication, exports)
│   ├── lifecycle-interaction.test.ts # 15 lifecycle bug regression tests
│   └── extraction-fixtures.test.ts   # Synthetic fixture completeness tests
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── wxt.config.ts
```

---

## 📋 Prerequisites

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **Google Chrome**: Version 116+ (Manifest V3 support) or Chromium-based browsers (Brave, Edge, Arc)

---

## 📦 Installation & Setup

1. **Clone or open the repository**:
   ```bash
   cd e:/repos/ext-n-comp
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

---

## 🛠️ Development & Build Commands

- **Development Mode with Live-Reload**:
  ```bash
  npm run dev
  ```
  *Launches an isolated Chrome instance with the extension hot-reloaded upon file changes.*

- **Type Check**:
  ```bash
  npm run compile
  ```
  *Executes `tsc --noEmit` across all TypeScript modules.*

- **Run Automated Test Suites**:
  ```bash
  npm test
  ```
  *Executes all unit, lifecycle, and fixture test suites via Vitest.*

- **Production Build**:
  ```bash
  npm run build
  ```
  *Compiles and bundles the production Chrome Manifest V3 extension into `.output/chrome-mv3`.*

- **Package Extension Archive**:
  ```bash
  npm run zip
  ```
  *Packages the production extension into a distributable zip archive in `.output`.*

---

## 🔌 How to Load the Extension in Chrome

## 🔌 How to Load and Activate the Extension in Chrome

DocuHarvest implements **zero-permission on-demand activation** for maximum privacy and compliance with Chrome Web Store security standards:

1. **Build the production extension**:
   ```bash
   npm run build
   ```
2. Open Google Chrome and enter `chrome://extensions/` in the URL bar.
3. In the top-right corner, toggle **Developer mode** to **ON**.
4. Click the **Load unpacked** button in the top-left toolbar.
5. In the file picker, select the directory:
   ```
   e:\repos\ext-n-comp\.output\chrome-mv3
   ```
6. The extension card **DocuHarvest — Private Documentation Collector** will appear with version `0.1.0`.
7. **Activate on Target Documentation**:
   - Navigate to your authenticated documentation site in Chrome (e.g. `https://internal-docs.company.com/docs` or Project Octahedron).
   - Click the **DocuHarvest puzzle/pin icon** in the Chrome toolbar.
   - The floating glassmorphic control panel will mount into the active tab via `chrome.scripting` on demand. Unrelated websites are never injected with scripts or tracked.

---

## 🔒 Permissions & Security Model (P0 Remediation)

- **No `<all_urls>` Host Permissions**: Unlike broad scrapers, DocuHarvest requests **no host permissions** in `manifest.json`.
- **Manifest Permissions Justification**:
  - `storage`: Required to durably persist the documentation collection session, discovered page queue, and extracted markdown locally in `chrome.storage.local`.
  - `activeTab`: Grants temporary, on-demand read access to the currently active documentation tab strictly when the user clicks the toolbar icon.
  - `scripting`: Required to inject the content collector script into the user-selected active documentation tab without needing background surveillance across arbitrary websites.
- **Shadow DOM Isolation**: The extension's UI is encapsulated inside `#docuharvest-root` with closed CSS and is explicitly filtered out from DOM link discovery, heading extraction, breadcrumbs, and tab scanning.
- **Safe Tab Activation**: Only tabs matching read-only documentation criteria are inspected. Destructive action buttons (`delete`, `remove`, `pay`, `submit`) are strictly blacklisted. Tab switching preserves and restores the reader's original active tab.

---

## 🧭 Reliability & Lifecycle Guarantees (P1 Remediation)

- **Authoritative Session Coordinator**: Every active collection session generates a unique coordinator token. Before any DOM extraction, state mutation, navigation, or queue transition, the coordinator confirms its token is still active in storage.
- **Prompt Interruption**: Pause and Stop operations trigger an internal `AbortController`, instantly cancelling in-flight rate limit delays and preventing stale asynchronous operations from mutating state.
- **SPA & MPA Navigation Correctness**: Supports client-side SPA routing via in-DOM link triggering, with persistent fallback to full-page navigation. If an SPA transition fails to change the URL, the engine halts after 2 bounded attempts, logs an error, and drops the page to prevent repeated navigation loops.
- **Durable Progress Recovery**: Page reload or browser closure preserves all collected pages and remaining queue items in `chrome.storage.local`.
- **Surfaced Storage Failures**: Storage write errors (e.g., quota limits) are recorded directly on `session.storageError` and appended to `session.errors` rather than silently dropped.

---

## 📑 Extraction Correctness & Data Integrity (P2 Remediation)

- **Virtualized DOM Accumulation**: Scans scrollable virtualized containers and accumulates text/table rows across incremental batches before earlier elements unmount from the DOM.
- **Reader Scroll Preservation**: Viewport auto-scrolling defaults to `false`. When page extraction completes, the reader's exact `window.scrollX` and `window.scrollY` positions are restored.
- **Accordion State Restoration**: Collapsible `<details>` and `aria-expanded` accordion elements are expanded for complete text capture, and their initial open/closed states are cleanly restored.
- **Strict Completeness Detection**: Pages with low word count (< 25 words) or with unsafe/inaccessible tabs are explicitly marked `isComplete: false` with audit warnings.
- **Accurate Bundle Frontmatter**: Exported Markdown and JSON headers reflect partial pages and skipped items (`Incomplete (<N> partial, <M> failed)`).

---

## 🧪 Verification & Automated Test Evidence (P3 Remediation)

All automated test suites execute locally using Vitest:

```bash
npm test
```

### Test Suite Summary:
- **`tests/docuharvest.test.ts` (16 tests)**: Unit tests for URL canonicalization, queue deduplication, nested navigation discovery, safe tab reading, and multi-format compilation.
- **`tests/lifecycle-interaction.test.ts` (23 tests)**: Regression tests for coordinator races, duplicate initialization, stop-during-navigation prompt abort, pause-during-delay abort, SPA routing loop prevention, storage failure error surfacing, accordion restoration, reader scroll restoration, and virtualized batch accumulation.
- **`tests/extraction-fixtures.test.ts` (12 tests)**: Synthetic documentation fixtures covering deep hierarchies, multi-tab extraction, virtualized tables, empty/malformed page audits, and end-to-end multi-page simulation.
- **Total**: **51 tests passing** across 3 test suites.

---

## 🔍 Manual Validation Protocol: Project Octahedron

To validate DocuHarvest against an authenticated deployment of Project Octahedron:

1. **Load Extension in Developer Mode**:
   - Ensure the production build is compiled: `npm run build`.
   - In Chrome, open `chrome://extensions/`, enable Developer Mode, and click **Load unpacked** pointing to `e:\repos\ext-n-comp\.output\chrome-mv3`.
2. **Access Project Octahedron**:
   - Navigate to the Project Octahedron documentation URL in your browser and complete any necessary SSO / authentication steps.
3. **On-Demand Activation**:
   - Click the DocuHarvest toolbar icon.
   - Confirm that the floating glassmorphic panel appears in the top-right corner.
   - Confirm that the extension automatically detected the documentation root path (e.g. `/docs`).
4. **Queue Inspection & Discovery**:
   - Click **Start Collection**.
   - Expand the **Page Queue** dropdown to confirm all sidebar sections and nested items are discovered.
5. **Interactive Safety Verification**:
   - Verify that your reading scroll position is not violently disrupted.
   - Verify that accordions expanded during extraction return to their original closed/open state.
   - Verify that code snippet tabs (Python / JavaScript / cURL) are extracted without triggering destructive actions.
6. **Lifecycle Controls Test**:
   - Click **Pause** during collection: verify that navigation stops immediately and the queue remains intact.
   - Click **Resume**: verify that collection continues from the current item without re-collecting completed pages.
   - Reload the page (`Ctrl+R`): verify that the floating panel recovers previous collection progress.
7. **Export Verification**:
   - Click **Export Markdown**, **JSON**, and **CSV**.
   - Inspect `documentation-bundle.md`: verify that the YAML frontmatter accurately reports total pages, word count, and completeness status.
   - Verify that exporting does not clear or alter the stored collection queue.

---

## 📜 License

MIT License. Designed for private, authenticated documentation collection.
