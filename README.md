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

1. Build the production extension if not already built:
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
7. Navigate to any authenticated documentation site. The floating glassmorphic control panel will automatically mount in the top-right corner.

---

## ⚙️ Configuring Target Domain & URL Restrictions

DocuHarvest automatically configures polite, scoped boundaries upon mounting:

1. **Automatic Root Detection**:
   - When mounted on `https://internal-docs.company.com/docs/v2/getting-started`, DocuHarvest automatically anchors its `urlPrefix` restriction to `https://internal-docs.company.com/docs`.
2. **Same-Origin Constraint**:
   - Navigation links pointing to external domains (e.g. GitHub, status pages, billing portals) are strictly filtered out by `isCandidateDocUrl()`.
3. **Excluded Path Patterns**:
   - The engine automatically skips authentication routes (`/login`, `/oauth`, `/sso`, `/auth`), billing sections (`/billing`, `/pricing`), account settings, and static binary files (`.pdf`, `.zip`, `.png`, `.jpg`).
4. **Rate Limiting**:
   - Configurable delay (default: `1200ms`) ensures polite browsing and prevents rate limiting by server firewalls.

---

## 🕹️ Workflow: Start, Pause, Resume, and Stop

### 1. Start Collection
- Click **Start Collection** on the floating panel.
- DocuHarvest discovers documentation links from the navigation sidebar, expands collapsed sections (`<details>`, `aria-expanded="false"` buttons), builds the canonical queue, and begins sequential extraction.

### 2. Pause Collection
- Click **Pause** at any time.
- The coordinator halts navigation and keeps the remaining queue and current progress intact in `chrome.storage.local`. The extension badge displays `II`.

### 3. Resume Collection
- Click **Resume**.
- DocuHarvest re-verifies the rendered page, claims the coordinator token, and resumes processing without skipping or duplicating pages.

### 4. Stop Collection
- Click **Stop**.
- Collection is terminated while all collected pages and word counts remain safely preserved. The download export buttons remain fully accessible.

### 5. Inspect & Modify Queue
- Click **Page Queue (<N> pages)** to inspect discovered URLs.
- Click **Skip** on any page you want to omit.
- Click **Retry** on any page that encountered transient network warnings.
- Click **Preview** on any collected page to inspect its generated Markdown before downloading.

---

## 💾 Exporting & Data Recovery

DocuHarvest provides three tailored export formats with a single click:

| Format | File Name | Primary Use Case |
| :--- | :--- | :--- |
| **Markdown** | `documentation-bundle.md` | Primary bundle formatted with YAML frontmatter, Table of Contents, headings hierarchy, callout alerts (`> [!NOTE]`, `> [!TIP]`), structured tables, multi-tab code snippets, and a final audit report. Ready for immediate ingestion by AI agents (LLMs). |
| **Structured JSON** | `documentation-bundle.json` | Complete machine-readable payload containing canonical metadata, page arrays, breadcrumb paths, section blocks, code blocks, tab records, and failure audits for vector database chunking and RAG pipelines. |
| **Tabular CSV** | `documentation-bundle.csv` | RFC 4180 compliant CSV prefixed with UTF-8 BOM (`\uFEFF`) for immediate loading into Excel, Google Sheets, Pandas, and data processing tools with full Unicode and emoji preservation. |

### Data Recovery After Browser Crash or Reload
- All collection states, discovered URLs, and extracted markdown are automatically persisted to `chrome.storage.local`.
- If the browser is refreshed or closed, reopening the documentation site automatically restores the collected pages, word count, and queue. You can immediately resume collection or download your bundle.

### Clearing Data
- Click **Clear Stored Data** in the footer.
- DocuHarvest prompts for explicit two-step confirmation (`"Yes, Delete All"` / `"Cancel"`) to prevent accidental deletion.

---

## 🛡️ Privacy & Security Audit

DocuHarvest adheres to strict privacy and least-privilege standards:

- **Zero External Network Requests**: Contains no `fetch()`, `XMLHttpRequest`, `axios`, or websocket connections to third-party endpoints.
- **Zero Telemetry**: No Google Analytics, Mixpanel, Sentry, or pingbacks.
- **No Cookie or Token Access**: Does not request the `cookies` permission and does not read `document.cookie` or authorization headers.
- **Minimal Manifest Permissions**: Only requests `storage` to persist collection progress locally.
- **Local File Generation**: Exports are compiled in-memory via `URL.createObjectURL(new Blob(...))` directly in the browser tab.

---

## ⚠️ Known Limitations & Safety Handling

1. **Virtualized List Deduplication**:
   - Content inside virtualized scroll containers that dynamically unmount DOM elements is scrolled in bounded steps (`maxVirtualScrollSteps = 8`). While most virtualized docs are captured, extremely deep virtual tables may require manual container height adjustments.
2. **Cross-Origin iFrames**:
   - In accordance with the browser Same-Origin Policy and Chrome security model, documentation embedded inside third-party, sandboxed `<iframe>` tags without cross-origin read permissions cannot be directly accessed. DocuHarvest records these in the audit log.
3. **Destructive Controls Filter**:
   - The safe tab switcher automatically detects and ignores buttons with destructive keywords (`delete`, `remove`, `submit`, `pay`, `purchase`, `logout`) to prevent unintended actions during documentation tab switching.

---

## 🔧 Troubleshooting Guide

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **Panel does not appear on page** | Extension not loaded or page URL is an internal browser page (`chrome://`). | Ensure the extension is enabled in `chrome://extensions/` and test on a standard `http://` or `https://` webpage. Check that `__DOCUHARVEST_MOUNTED__` is not blocked. |
| **Page extraction shows "Low word count" warning** | Page is still rendering dynamic hydration or requires login. | Adjust `stabilizationTimeoutMs` in config, ensure you are logged into the documentation site, and click **Retry** on the failed queue item. |
| **Accidental navigation outside documentation** | Sidebar contained links to external marketing or account pages. | Ensure `urlPrefix` is set to the documentation path (e.g., `https://site.com/docs`). DocuHarvest automatically drops URLs not starting with this prefix. |
| **Panel moves during page scroll** | Viewport positioning issue with target site CSS. | DocuHarvest uses `position: fixed !important` inside Shadow DOM attached to `document.documentElement` to prevent host page CSS interference. Drag the panel handle to re-position. |
| **Excel shows garbled characters for non-English docs** | Missing UTF-8 Byte Order Mark in CSV. | DocuHarvest exports CSV with byte `\uFEFF` (UTF-8 BOM), ensuring Excel and Google Sheets render Japanese, Chinese, Cyrillic, accented characters, and emojis properly. |

---

## 📜 License

MIT License. Designed for private, authenticated documentation collection.
