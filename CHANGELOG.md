# Changelog

All notable changes to **DocuHarvest** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-10-11

### Added
- **Core Collection Engine**: Complete WXT + TypeScript Chrome Extension targeting Manifest V3.
- **Sidebar & Page Discovery**: Automatic discovery of documentation links from sidebars, navigation trees, nested lists, and expandable headers with canonical URL deduplication and path filtering.
- **Durable Storage & Reload Recovery**: Durable state persistence via `chrome.storage.local` with automatic session resumption across full page reloads and cross-origin boundaries.
- **Single Authoritative Coordinator**: Distributed coordinator token model (`activeCoordinatorToken`) to prevent duplicate worker races across SPA navigation routes.
- **Safe Tab Extraction**: Non-destructive tab reading supporting multi-language code snippets; strict containment checking within `groupContainer` to prevent cross-group ID collisions.
- **Accordion Handling & Restoration**: Safe expansion of `<details>` and recognized documentation accordions, with automated click reversal on restore to preserve host DOM integrity.
- **Nested Scroll & Virtualized Lists**: Bounded scrolling engine that captures and deduplicates items in virtualized lists before unmounting.
- **AI-Optimized Multi-Format Exporters**:
  - `documentation-bundle.md`: Markdown compiled with CommonMark variable backtick code fencing, table formatting, callout conversion (`[!NOTE]`, `[!WARNING]`), and detailed audit report.
  - `documentation-bundle.json`: Structured JSON containing complete metadata, content blocks, heading trees, tab records, and completeness warnings.
  - `documentation-bundle.csv`: RFC 4180 compliant tabular dataset optimized for RAG ingestion and spreadsheet analysis.
- **Shadow DOM UI**: Non-intrusive floating glassmorphism panel with drag physics, real-time progress indicators, and collapsible queue drawer.
- **Permissions Hardening**: Removal of unconditional `<all_urls>` permission in favor of on-demand injection via `activeTab` and `scripting`.
- **Automated CI Pipeline**: GitHub Actions workflow running dependency installation, TypeScript compilation, Vitest test suite, and production build on every push.
- **Comprehensive Test Suite**: 57 automated unit, lifecycle, and synthetic DOM fixture regression tests.

### Fixed
- Tab isolation bug where `document.getElementById` could resolve elements outside the active tab group.
- Accordion expansion edge case where non-doc controls (menus, dropdowns, popups) could be triggered.
- Cancellation handling: wired `AbortSignal` through `extractCurrentPage`, tab switching, stabilization waits, and virtualized scrolling.
- Completeness audit: aligned discovered page status (`completed` vs. `partial`) with extraction results and accounted for non-fatal warnings in bundle reports.
- Safe detached anchor cleanup during browser file downloads to prevent `NotFoundError` in test environments.
