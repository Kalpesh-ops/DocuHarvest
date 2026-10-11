# Contributing to DocuHarvest

Thank you for your interest in contributing to **DocuHarvest — Private Documentation Collector**! DocuHarvest is built to extract clean, structured, AI-ready documentation bundles from rendered, authenticated browser sessions.

This document outlines our development workflows, code standards, testing requirements, and contribution guidelines.

---

## Table of Contents
1. [Code of Conduct](#code-of-conduct)
2. [Development Environment Setup](#development-environment-setup)
3. [Project Architecture](#project-architecture)
4. [Branching and Commit Guidelines](#branching-and-commit-guidelines)
5. [Testing & Verification Requirements](#testing--verification-requirements)
6. [Submitting Pull Requests](#submitting-pull-requests)
7. [Security Considerations](#security-considerations)

---

## Code of Conduct
All contributors and maintainers are expected to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please report unacceptable behavior through our security contact.

---

## Development Environment Setup

### Prerequisites
- **Node.js**: v20 or later (LTS recommended)
- **npm**: v10 or later
- **Chrome / Chromium Browser**: Version 120 or higher for testing Manifest V3 extensions

### Initial Setup
1. Fork and clone the repository:
   ```bash
   git clone https://github.com/Kalpesh-ops/DocuHarvest.git
   cd DocuHarvest
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Verify setup:
   ```bash
   npm run compile   # Runs TypeScript check (tsc --noEmit)
   npm test          # Runs Vitest test suite
   npm run build     # Builds production extension in .output/chrome-mv3
   ```

### Development Mode
To develop with live hot-module reloading:
```bash
npm run dev
```
In Chrome, navigate to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `.output/chrome-mv3`.

---

## Project Architecture

DocuHarvest is built with [WXT](https://wxt.dev) and TypeScript:

```
├── .github/                 # Workflows & issue/PR templates
├── docs/                    # Architectural & user documentation
├── entrypoints/
│   ├── background.ts        # Service worker (action click injection)
│   └── content.ts           # Content script coordinator & Shadow DOM mounter
├── src/
│   ├── discovery/           # Sidebar & navigation link discovery
│   ├── extractor/           # DOM extraction, safe tab handling, virtualized scrolling
│   ├── export/              # AI-ready Markdown, JSON, and CSV bundle compilers
│   ├── orchestrator/        # Queue lifecycle, rate limits, AbortSignal cancellation
│   ├── storage/             # Durable chrome.storage.local persistence & recovery
│   ├── ui/                  # Floating glassmorphism Shadow DOM controller & styles
│   └── types/               # TypeScript data models & message contracts
└── tests/                   # Vitest unit, lifecycle & synthetic fixture suites
```

### Core Design Principles
1. **Host DOM Protection**: The extension must never mutate host document styles or break client SPA frameworks. Interactive widgets (accordions, tabs) must cleanly reverse states upon completion or cancellation.
2. **Shadow DOM Isolation**: The UI is encapsulated within a closed `#docuharvest-root` Shadow DOM, strictly excluded from page discovery and markdown extraction.
3. **Single Authoritative Coordinator**: To avoid race conditions across SPA transitions or reloads, workers claim an authoritative `coordinatorToken`. Stale workers self-terminate immediately upon detecting authority loss.
4. **Zero Unconditional Host Permissions**: Injections happen strictly on-demand via `activeTab` and `chrome.scripting` when user clicks the extension action icon.

---

## Branching and Commit Guidelines

- **Branch Naming**:
  - `feat/feature-name`
  - `fix/bug-description`
  - `docs/documentation-update`
  - `test/test-suite-expansion`
- **Commit Messages**: Follow [Conventional Commits](https://www.conventionalcommits.org/):
  - `feat(extractor): add support for nested code block annotations`
  - `fix(orchestrator): abort in-progress delays when user pauses`
  - `test(lifecycle): add regression test for unmounted tabs`
  - `docs(readme): clarify unpacked extension installation`

---

## Testing & Verification Requirements

DocuHarvest maintains strict test-driven quality standards. Every PR must pass all checks in GitHub Actions CI:

```bash
# 1. Typecheck (Zero warnings or errors)
npm run compile

# 2. Automated test suite (all unit, lifecycle, and fixture tests)
npm test

# 3. Production build
npm run build
```

### Writing Tests
- Put unit and lifecycle tests in `tests/`.
- Use synthetic DOM fixtures rather than live external network requests.
- Verify both positive extraction and defensive edge cases (e.g., non-read-only tabs, cross-group ID collisions, unexpected AbortSignals).

---

## Submitting Pull Requests

1. Ensure your branch is rebased onto the latest `main`.
2. Run `npm run compile`, `npm test`, and `npm run build` locally.
3. Push to your fork and submit a PR against `main`.
4. Fill out the [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md) completely, providing reproduction commands and verification evidence.
5. Address reviewer comments constructively.

---

## Security Considerations

- Never introduce broad host permissions (such as `<all_urls>`) without maintainer review.
- Never write credentials, cookies, or authorization tokens to extension storage or exported bundle metadata.
- Read [SECURITY.md](SECURITY.md) for vulnerability disclosure procedures.
