import { describe, it, expect } from 'vitest';
import { normalizeUrl, computeSessionStats, createInitialSession } from '../src/storage/storage';
import { isCandidateDocUrl, discoverPages } from '../src/discovery/page-discovery';
import {
  htmlToMarkdown,
  expandAllCollapsibles,
  handleVirtualizedAndNestedContainers,
} from '../src/extractor/dom-extractor';
import { extractAllTabsSafely, isSafeDocumentationTab } from '../src/extractor/tab-extractor';
import {
  compileMasterMarkdown,
  compileStructuredJson,
  compileStructuredCsv,
  escapeCsvField,
  formatSafeCodeBlock
} from '../src/export/exporter';
import { CollectedPage } from '../src/types';

describe('DocuHarvest Engine - Comprehensive Test Suite', () => {
  describe('1. Canonical URL & Queue Deduplication', () => {
    it('normalizes URLs by stripping hashes, tracking query parameters, and trailing slashes', () => {
      const dirtyUrl = 'https://example.com/docs/api/?utm_source=twitter&utm_medium=cpc&ref=hackernews#subheading';
      expect(normalizeUrl(dirtyUrl)).toBe('https://example.com/docs/api');

      // Preserves valid documentation route parameters
      const routeUrl = 'https://example.com/docs/reference?lang=typescript&version=v2#section';
      expect(normalizeUrl(routeUrl)).toBe('https://example.com/docs/reference?lang=typescript&version=v2');
    });

    it('computes accurate session statistics across all page states', () => {
      const session = createInitialSession('https://example.com/docs', 'Docs Root');
      session.discoveredPages = {
        'https://example.com/docs/1': { id: '1', url: 'https://example.com/docs/1', title: 'P1', depth: 1, status: 'completed', discoveredAt: 0 },
        'https://example.com/docs/2': { id: '2', url: 'https://example.com/docs/2', title: 'P2', depth: 1, status: 'pending', discoveredAt: 0 },
        'https://example.com/docs/3': { id: '3', url: 'https://example.com/docs/3', title: 'P3', depth: 1, status: 'failed', discoveredAt: 0 },
        'https://example.com/docs/4': { id: '4', url: 'https://example.com/docs/4', title: 'P4', depth: 1, status: 'skipped', discoveredAt: 0 },
      };
      session.collectedPages = {
        'https://example.com/docs/1': {
          id: '1',
          url: 'https://example.com/docs/1',
          title: 'P1',
          markdown: '# Page 1\nExtracted content with words.',
          wordCount: 15,
          headings: ['Page 1'],
          sections: [],
          isComplete: true,
          extractedAt: Date.now()
        }
      };
      session.queue = ['https://example.com/docs/2'];

      const stats = computeSessionStats(session);
      expect(stats.discovered).toBe(4);
      expect(stats.collected).toBe(1);
      expect(stats.remaining).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.skipped).toBe(1);
      expect(stats.totalWords).toBe(15);
      expect(stats.progressPercentage).toBe(50);
    });
  });

  describe('2. Nested Navigation & Expandable Sidebar Discovery', () => {
    it('discovers nested pages inside collapsed sidebar groups (<details> and aria-expanded buttons)', async () => {
      document.body.innerHTML = `
        <nav class="docs-sidebar" aria-label="Documentation navigation">
          <ul>
            <li><a href="/docs/intro">Introduction</a></li>
            <li>
              <details class="sidebar-group">
                <summary>Advanced Guides</summary>
                <ul>
                  <li><a href="/docs/advanced/authentication">Authentication</a></li>
                  <li><a href="/docs/advanced/security">Security</a></li>
                </ul>
              </details>
            </li>
            <li>
              <button aria-expanded="false" class="group-toggle">SDKs</button>
              <ul class="nested-items">
                <li><a href="/docs/sdks/node" data-href="/docs/sdks/node">Node SDK</a></li>
                <li><button data-path="/docs/sdks/python">Python SDK</button></li>
              </ul>
            </li>
          </ul>
        </nav>
      `;

      const config = {
        rateLimitMs: 1000,
        autoScroll: false,
        expandAccordions: false,
        expandSidebarGroups: true,
        captureTabs: false,
        safeTabSwitching: true,
        scrollVirtualizedContainers: false,
        maxVirtualScrollSteps: 4,
        maxDepth: 4,
        maxRetries: 2,
        stabilizationTimeoutMs: 1000,
        pageExtractionTimeoutMs: 5000,
        spaNavigationSupport: true,
        urlPrefix: window.location.origin + '/docs',
      };

      const discovered = await discoverPages(config);
      const urls = discovered.map(p => p.url);

      expect(urls.some(u => u.includes('/docs/intro'))).toBe(true);
      expect(urls.some(u => u.includes('/docs/advanced/authentication'))).toBe(true);
      expect(urls.some(u => u.includes('/docs/advanced/security'))).toBe(true);
      expect(urls.some(u => u.includes('/docs/sdks/node'))).toBe(true);
      expect(urls.some(u => u.includes('/docs/sdks/python'))).toBe(true);
    });

    it('filters out non-doc, external, and destructive links', () => {
      const origin = 'https://docs.acme.com';
      expect(isCandidateDocUrl('/guide/getting-started', origin, 'https://docs.acme.com/guide')).toBe(true);
      expect(isCandidateDocUrl('https://docs.acme.com/guide/installation', origin, 'https://docs.acme.com/guide')).toBe(true);

      expect(isCandidateDocUrl('https://github.com/acme/project', origin)).toBe(false);
      expect(isCandidateDocUrl('/login', origin)).toBe(false);
      expect(isCandidateDocUrl('/account/billing', origin)).toBe(false);
      expect(isCandidateDocUrl('/guide/assets/manual.pdf', origin)).toBe(false);
      expect(isCandidateDocUrl('/guide/images/diagram.png', origin)).toBe(false);
    });
  });

  describe('3. Tabs & Safe Inactive Tab Extraction', () => {
    it('accurately identifies safe documentation tabs vs unsafe action controls', () => {
      const safeTab = document.createElement('button');
      safeTab.innerText = 'TypeScript';
      expect(isSafeDocumentationTab(safeTab)).toBe(true);

      const unsafeLink = document.createElement('a');
      unsafeLink.setAttribute('href', 'https://external-site.com');
      unsafeLink.innerText = 'External Doc';
      expect(isSafeDocumentationTab(unsafeLink)).toBe(false);

      const deleteBtn = document.createElement('button');
      deleteBtn.innerText = 'Delete Project';
      expect(isSafeDocumentationTab(deleteBtn)).toBe(false);
    });

    it('extracts inactive tab panels and restores the original active tab', async () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="tabs-group">
          <div role="tablist">
            <button id="tab-npm" role="tab" aria-selected="true" aria-controls="panel-npm" class="active">npm</button>
            <button id="tab-pnpm" role="tab" aria-selected="false" aria-controls="panel-pnpm">pnpm</button>
          </div>
          <div id="panel-npm" role="tabpanel" aria-labelledby="tab-npm">
            <code>npm install docuharvest</code>
          </div>
          <div id="panel-pnpm" role="tabpanel" aria-labelledby="tab-pnpm" hidden>
            <code>pnpm add docuharvest</code>
          </div>
        </div>
      `;

      const { extractedTabs, records } = await extractAllTabsSafely(container, true);

      expect(extractedTabs.length).toBe(2);
      expect(extractedTabs[0].tabName).toBe('npm');
      expect(extractedTabs[0].content).toContain('npm install');
      expect(extractedTabs[1].tabName).toBe('pnpm');
      expect(extractedTabs[1].content).toContain('pnpm add');

      expect(records.length).toBe(2);
      expect(records[0].status).toBe('extracted');
      expect(records[1].status).toBe('extracted');
    });
  });

  describe('4. Rich DOM Extraction & Markdown Conversion', () => {
    it('converts headings, paragraphs, nested lists, code blocks, and callouts', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <h1>Architecture Overview</h1>
        <p>This is the core architectural foundation.</p>
        <div class="admonition admonition-tip">
          <p>Always verify permissions in Manifest V3.</p>
        </div>
        <pre><code class="language-typescript">const active = true;</code></pre>
        <ul>
          <li>Top item 1
            <ul>
              <li>Sub item 1.1</li>
            </ul>
          </li>
          <li>Top item 2</li>
        </ul>
      `;

      const { markdown, codeBlocks, headings, contentBlocks } = htmlToMarkdown(container);

      expect(headings).toContain('Architecture Overview');
      expect(codeBlocks.length).toBe(1);
      expect(codeBlocks[0].language).toBe('typescript');
      expect(codeBlocks[0].code).toContain('const active = true;');

      expect(markdown).toContain('# Architecture Overview');
      expect(markdown).toContain('> [!TIP]');
      expect(markdown).toContain('Always verify permissions in Manifest V3.');
      expect(markdown).toContain('```typescript');
      expect(markdown).toContain('- Top item 1');
      expect(markdown).toContain('  - Sub item 1.1');
      expect(markdown).toContain('- Top item 2');

      expect(contentBlocks.length).toBeGreaterThan(0);
    });

    it('converts HTML tables to GitHub-flavored markdown tables with row alignments', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <table>
          <thead>
            <tr><th>Option</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td>autoScroll</td><td>Enables viewport scrolling</td></tr>
            <tr><td>rateLimitMs</td><td>Polite navigation delay</td></tr>
          </tbody>
        </table>
      `;

      const { markdown } = htmlToMarkdown(container);
      expect(markdown).toContain('| Option | Description |');
      expect(markdown).toContain('| --- | --- |');
      expect(markdown).toContain('| autoScroll | Enables viewport scrolling |');
      expect(markdown).toContain('| rateLimitMs | Polite navigation delay |');
    });

    it('captures image alt text and figure captions', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <figure>
          <img src="https://example.com/assets/diagram.png" alt="Architecture Diagram" />
          <figcaption>System Architecture Flowchart</figcaption>
        </figure>
      `;

      const { markdown, images } = htmlToMarkdown(container);
      expect(images.length).toBe(1);
      expect(images[0].alt).toBe('Architecture Diagram');
      expect(images[0].caption).toBe('System Architecture Flowchart');
      expect(markdown).toContain('![Architecture Diagram](https://example.com/assets/diagram.png)');
      expect(markdown).toContain('*System Architecture Flowchart*');
    });

    it('expands collapsed <details> elements without throwing', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <details>
          <summary>Advanced Settings</summary>
          <p>Hidden advanced configuration content.</p>
        </details>
      `;
      const details = container.querySelector('details')!;
      expect(details.open).toBe(false);

      expandAllCollapsibles(container);
      expect(details.open).toBe(true);
    });

    it('scrolls nested virtualized containers without crashing or infinite loops', async () => {
      const container = document.createElement('div');
      const inner = document.createElement('div');
      inner.style.overflowY = 'auto';
      container.appendChild(inner);

      const res = await handleVirtualizedAndNestedContainers(container, 3);
      expect(res.batchesCollected).toBeGreaterThanOrEqual(0);
    });
  });

  describe('5. Final Export & Compilation System', () => {
    it('compiles documentation-bundle.md with frontmatter, TOC, tabs, and audit report', () => {
      const session = createInitialSession('https://docs.test.com/v1', 'Test Docs');
      const page1: CollectedPage = {
        id: 'https://docs.test.com/v1/page-1',
        url: 'https://docs.test.com/v1/page-1',
        title: 'Getting Started',
        breadcrumbs: ['Home', 'Docs', 'Getting Started'],
        markdown: '## Prerequisites\nNode.js and Chrome installed.',
        wordCount: 8,
        headings: ['Prerequisites'],
        sections: [
          {
            heading: 'Installation',
            level: 2,
            text: 'Run the package installer.',
            codeBlocks: [{ language: 'bash', code: 'npm i docuharvest' }],
            tabs: [
              { tabName: 'npm', content: 'npm i docuharvest' },
              { tabName: 'pnpm', content: 'pnpm add docuharvest' },
            ]
          }
        ],
        internalLinks: [{ text: 'API Reference', url: 'https://docs.test.com/v1/api' }],
        notes: ['Scrolled 2 batches from code block.'],
        isComplete: true,
        extractedAt: Date.now(),
      };

      session.collectedPages = { [page1.url]: page1 };
      session.pagesOrder = [page1.url];
      session.discoveredPages = {
        [page1.url]: { id: 'p1', url: page1.url, title: page1.title, depth: 1, status: 'completed', discoveredAt: 0 },
        'https://docs.test.com/v1/page-skipped': { id: 'p2', url: 'https://docs.test.com/v1/page-skipped', title: 'Skipped Page', depth: 1, status: 'skipped', skippedReason: 'User requested skip', discoveredAt: 0 }
      };
      session.errors = [
        { url: 'https://docs.test.com/v1/page-err', message: 'HTTP 404 Not Found', timestamp: Date.now(), retryable: false }
      ];

      const masterMd = compileMasterMarkdown(session);

      // Verify Frontmatter & Header
      expect(masterMd).toContain('title: "Documentation Knowledge Bundle"');
      expect(masterMd).toContain('bundle_version: "1.0.0"');
      expect(masterMd).toContain('## Table of Contents');
      expect(masterMd).toContain('[Getting Started]');

      // Verify Page body & metadata
      expect(masterMd).toContain('# 1. Getting Started');
      expect(masterMd).toContain('Home > Docs > Getting Started');
      expect(masterMd).toContain('✓ Complete');

      // Verify Tab variations
      expect(masterMd).toContain('### Tab Variations: Installation');
      expect(masterMd).toContain('#### [Tab: npm]');
      expect(masterMd).toContain('npm i docuharvest');
      expect(masterMd).toContain('#### [Tab: pnpm]');
      expect(masterMd).toContain('pnpm add docuharvest');

      // Verify Notes & Internal Links
      expect(masterMd).toContain('Scrolled 2 batches from code block.');
      expect(masterMd).toContain('[API Reference](https://docs.test.com/v1/api)');

      // Verify Audit Report
      expect(masterMd).toContain('## Collection & Audit Report');
      expect(masterMd).toContain('HTTP 404 Not Found');
      expect(masterMd).toContain('User requested skip');
    });

    it('compiles structured JSON export (documentation-bundle.json)', () => {
      const session = createInitialSession('https://docs.test.com/v1', 'Test Docs');
      const page1: CollectedPage = {
        id: 'https://docs.test.com/v1/page-1',
        url: 'https://docs.test.com/v1/page-1',
        title: 'Getting Started',
        breadcrumbs: ['Docs', 'Intro'],
        markdown: 'Content',
        wordCount: 1,
        headings: [],
        sections: [],
        isComplete: true,
        extractedAt: Date.now(),
      };
      session.collectedPages = { [page1.url]: page1 };
      session.pagesOrder = [page1.url];

      const jsonStr = compileStructuredJson(session);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.metadata.bundleName).toBe('DocuHarvest Documentation Bundle');
      expect(parsed.pages.length).toBe(1);
      expect(parsed.pages[0].breadcrumbs).toEqual(['Docs', 'Intro']);
      expect(parsed.auditReport).toBeDefined();
    });

    it('compiles RFC 4180 compliant CSV (documentation-bundle.csv) with UTF-8 BOM', () => {
      const session = createInitialSession('https://docs.test.com/v1', 'Test Docs');
      const page1: CollectedPage = {
        id: 'https://docs.test.com/v1/page-1',
        url: 'https://docs.test.com/v1/page-1',
        title: 'Page with "quotes", commas, and\nnewlines',
        breadcrumbs: ['Level 1', 'Level 2'],
        markdown: 'First paragraph with "sample" quotation.\nSecond line.',
        wordCount: 10,
        headings: ['Heading 1'],
        sections: [],
        isComplete: true,
        extractedAt: Date.now(),
      };
      session.collectedPages = { [page1.url]: page1 };
      session.pagesOrder = [page1.url];

      const csvStr = compileStructuredCsv(session);

      // Verifies UTF-8 BOM
      expect(csvStr.charCodeAt(0)).toBe(0xFEFF);

      // Verifies RFC 4180 CSV escaping
      expect(csvStr).toContain('"Page with ""quotes"", commas, and\nnewlines"');
      expect(csvStr).toContain('"Level 1 > Level 2"');
    });

    it('preserves Unicode, math symbols, and foreign characters across exports', () => {
      const session = createInitialSession('https://docs.test.com', 'Test Docs');
      const unicodePage: CollectedPage = {
        id: 'https://docs.test.com/i18n',
        url: 'https://docs.test.com/i18n',
        title: '日本語ドキュメント & Über-Größe',
        breadcrumbs: ['翻訳', 'Guide'],
        markdown: '# 概要\nDocuHarvest preserves λ-calculus and emojis 🌿✨.',
        wordCount: 12,
        headings: ['概要'],
        sections: [],
        isComplete: true,
        extractedAt: Date.now(),
      };
      session.collectedPages = { [unicodePage.url]: unicodePage };
      session.pagesOrder = [unicodePage.url];

      const masterMd = compileMasterMarkdown(session);
      expect(masterMd).toContain('日本語ドキュメント & Über-Größe');
      expect(masterMd).toContain('λ-calculus and emojis 🌿✨');
      expect(masterMd).toContain('翻訳 > Guide');

      const csv = compileStructuredCsv(session);
      expect(csv).toContain('日本語ドキュメント & Über-Größe');
    });

    it('prevents broken code fences when code contains backticks', () => {
      const codeWithBackticks = '```bash\nnpm run test\n```';
      const formatted = formatSafeCodeBlock(codeWithBackticks, 'markdown');
      expect(formatted).toContain('````markdown');
      expect(formatted).toContain('````');
    });
  });
});
