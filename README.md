# DocuHarvest — Private Documentation Collector

[![CI](https://github.com/Kalpesh-ops/DocuHarvest/actions/workflows/ci.yml/badge.svg)](https://github.com/Kalpesh-ops/DocuHarvest/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-success.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![WXT](https://img.shields.io/badge/Built%20with-WXT-orange.svg)](https://wxt.dev/)

> Production-quality WXT + TypeScript Chrome Extension (Manifest V3) for privately extracting, compiling, and exporting documentation from authenticated web sessions into AI-ready knowledge bases.

---

## 📖 Table of Contents
- [Why DocuHarvest?](#-why-docuharvest)
- [Architecture & Design](#-architecture--design)
- [Installation & Setup](#-installation--setup)
- [Quick Start Guide](#-quick-start-guide)
- [Security & Privacy Model](#-security--privacy-model)
- [Lifecycle & Concurrency Guarantees](#-lifecycle--concurrency-guarantees)
- [Export Formats & AI Ingestion](#-export-formats--ai-ingestion)
- [Automated Testing & CI](#-automated-testing--ci)
- [Documentation & Community](#-documentation--community)
- [License](#-license)

---

## 🎯 Why DocuHarvest?

Many critical technical documentation sites live behind authenticated sessions (enterprise SSO, VPNs, internal intranets, paid developer portals, or Project Octahedron) where external web scrapers, curl scripts, or cloud AI fetchers cannot reach.

**DocuHarvest** solves this by running locally inside your authenticated Chrome session:
1. **Zero External Telemetry**: All DOM traversal, extraction, and compilation happen entirely inside the browser's local sandbox (`chrome.storage.local`). No credentials, cookies, or content are ever sent to third-party servers.
2. **Defensive DOM Operations**: Respects the host page DOM. Accordions and multi-language tabs are safely expanded for extraction and **re-clicked upon completion** to restore the user's view.
3. **AI-Ready Formats**: Compiles complex documentation hierarchies into structured Markdown (`documentation-bundle.md`), rich JSON (`documentation-bundle.json`), and CSV (`documentation-bundle.csv`) with CommonMark dynamic backtick code fences and audit reports.

---

## 🏗 Architecture & Design

DocuHarvest is architected with modular layers using [WXT](https://wxt.dev):

```
DocuHarvest/
├── .github/
│   ├── workflows/ci.yml     # Automated CI (TypeScript compile, tests, build)
│   ├── ISSUE_TEMPLATE/      # Bug reports & feature request templates
│   └── PULL_REQUEST_TEMPLATE.md
├── docs/
│   ├── ARCHITECTURE.md      # Deep dive into distributed coordinator & Shadow DOM
│   ├── USER_GUIDE.md        # Comprehensive manual & AI prompt engineering playbook
│   └── OCTAHEDRON_VALIDATION_PROTOCOL.md # Live acceptance test procedure
├── entrypoints/
│   ├── background.ts        # Service worker (action click injection)
│   └── content.ts           # Content script coordinator & Shadow DOM mounter
├── src/
│   ├── discovery/           # Sidebar TOC detection & link hierarchy discovery
│   ├── extractor/           # Rendered DOM extractor, tab switcher, virtualized scroller
│   ├── export/              # Master Markdown (.md), JSON (.json), and CSV (.csv) compilers
│   ├── orchestrator/        # State machine with AbortSignal cancellation
│   ├── storage/             # Durable chrome.storage.local persistence & recovery
│   ├── ui/                  # Floating Shadow DOM panel with drag physics & dark CSS
│   └── types/               # TypeScript domain models and schemas
├── tests/                   # 57 automated unit, lifecycle, and synthetic fixture tests
├── CONTRIBUTING.md          # Contribution guidelines & coding standards
├── CODE_OF_CONDUCT.md       # Contributor Covenant v2.1
├── SECURITY.md              # Vulnerability reporting & security architecture
├── CHANGELOG.md             # Semantic release history
└── package.json
```

For full details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 📦 Installation & Setup

### Prerequisites
- **Node.js**: v20+ recommended (v18.0.0 minimum)
- **npm**: v9.0.0 or higher
- **Google Chrome** (or Chromium, Brave, Edge): Version 120+

### Build from Source
```bash
# 1. Clone repository
git clone https://github.com/Kalpesh-ops/DocuHarvest.git
cd DocuHarvest

# 2. Install dependencies
npm install

# 3. Verify build & tests
npm run compile
npm test
npm run build
```

The production Chrome extension will be compiled into:
```
.output/chrome-mv3/
```

### Load in Chrome
1. In Chrome, open `chrome://extensions/`.
2. Toggle **Developer mode** to **ON** in the top-right corner.
3. Click **Load unpacked** and select the `.output/chrome-mv3` folder.
4. Pin the **DocuHarvest** icon to your toolbar.

---

## 🚀 Quick Start Guide

1. **Open Target Docs**: Navigate to any documentation site in Chrome and log in if required.
2. **Launch Panel**: Click the DocuHarvest icon in your toolbar to inject the floating collector.
3. **Discover Pages**: Click **Discover Pages**. DocuHarvest automatically maps the sidebar navigation tree and fills the collection queue.
4. **Inspect Queue**: Click **Inspect Queue** to view pending items, skip unwanted paths, or retry failed items.
5. **Start Collection**: Click **Start Harvest**. Observe real-time progress, word counts, and operation statuses.
6. **Export Bundle**: When complete, download:
   - `documentation-bundle.md`: Primary AI knowledge base with headings and audit report.
   - `documentation-bundle.json`: Structured records for vector databases and RAG pipelines.
   - `documentation-bundle.csv`: Tabular spreadsheet format.

For advanced settings, rate limits, and AI agent prompts, see [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

---

## 🔒 Security & Privacy Model

DocuHarvest implements a **strict least-privilege security model**:
- **Zero Broad Host Permissions**: No unconditional `<all_urls>` permission. Scripts are injected exclusively into the active tab on-demand when you click the toolbar icon.
- **Shadow DOM Isolation**: The UI is encapsulated within an isolated Shadow DOM (`#docuharvest-root`). Website scripts and stylesheets cannot leak into or conflict with the collector.
- **Read-Only Guard**: Buttons containing destructive tokens (`delete`, `remove`, `logout`) are strictly blacklisted from tab interactions.
- **Zero Telemetry**: All data remains strictly within your browser.

Read our full security policy in [SECURITY.md](SECURITY.md).

---

## 🧭 Lifecycle & Concurrency Guarantees

- **Single Authoritative Coordinator**: Uses an active coordinator token model (`session.activeCoordinatorToken`). If an SPA navigation re-injects content scripts, duplicate workers detect authority loss and self-terminate immediately.
- **Real AbortSignal Cancellation**: Pause and Stop operations propagate an `AbortSignal` through all in-flight delays, tab switches, and virtualized container scrollers, cleanly aborting work without corrupting state.
- **Reload Resilience**: All progress is persisted continuously in `chrome.storage.local`. If you refresh the page or restart Chrome mid-run, previous progress is restored automatically.
- **Accordion Restoration**: Expands `<details>` and recognized accordions during extraction, and re-clicks toggled buttons upon completion to cleanly restore host page state.

---

## 📑 Export Formats & AI Ingestion

Exported files are engineered for zero-loss ingestion into LLMs (Claude, Gemini, GPT-4, Llama 3):

```markdown
---
title: "Documentation Knowledge Bundle"
source: "https://docs.example.com"
collected_at: "2026-10-11T18:00:00Z"
total_pages: 42
total_words: 85200
generator: "DocuHarvest Private Documentation Collector"
---

# Documentation Knowledge Bundle

> **Completeness:** No known incomplete pages or warnings (all discovered pages fully extracted)

## Table of Contents
1. [Getting Started](#1-getting-started)
2. [API Reference](#2-api-reference)

---

# 1. Getting Started
...
```

- **Dynamic Code Fencing**: Detects consecutive backtick sequences in code and dynamically sizes the Markdown fence (` ```` ` or longer) according to CommonMark standards.
- **Callout Translation**: Converts platform admonitions into standardized GitHub-style alerts (`> [!NOTE]`, `> [!WARNING]`).
- **Audit Section**: Summarizes discovered pages, clean pages, warnings, and skips at the bottom of the bundle.

---

## 🧪 Automated Testing & CI

DocuHarvest includes an extensive test suite:

```bash
# Run all automated test suites
npm test

# Type check
npm run compile

# Production build
npm run build
```

### Test Suite Breakdown (57 Passing Tests)
- **`tests/docuharvest.test.ts` (16 tests)**: Canonical URLs, tracking query stripping, queue deduplication, export formatting.
- **`tests/lifecycle-interaction.test.ts` (29 tests)**: Single coordinator races, reload recovery, AbortSignal cancellation, accordion filtering, tab isolation, dynamic backtick code fencing, completeness warnings.
- **`tests/extraction-fixtures.test.ts` (12 tests)**: Synthetic DOM fixtures simulating complex sidebars, multi-tab code snippets, virtualized lists, and multi-page collection.

Continuous Integration runs automatically via [GitHub Actions](.github/workflows/ci.yml) on every push and pull request.

---

## 📚 Documentation & Community

- [Architecture Guide](docs/ARCHITECTURE.md)
- [User Guide & AI Playbook](docs/USER_GUIDE.md)
- [Acceptance Validation Protocol](docs/OCTAHEDRON_VALIDATION_PROTOCOL.md)
- [Contributing Guidelines](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)
- [Changelog](CHANGELOG.md)
- [Support Guide](SUPPORT.md)

---

## 📜 License

Distributed under the [MIT License](LICENSE).
DocuHarvest is open-source software designed for private, ethical, and authenticated documentation collection.
