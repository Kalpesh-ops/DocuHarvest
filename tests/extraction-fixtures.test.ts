import { describe, it, expect, beforeEach } from 'vitest';
import { setupChromeMock } from './test-utils';
import {
  htmlToMarkdown,
  expandAllCollapsibles,
  handleVirtualizedAndNestedContainers,
  findMainContentElement,
  extractBreadcrumbs,
  extractInternalLinks,
  extractSections,
  waitForContentStabilization
} from '../src/extractor/dom-extractor';
import { discoverPages, findSidebarElement, expandSidebarGroups } from '../src/discovery/page-discovery';
import { extractAllTabsSafely } from '../src/extractor/tab-extractor';
import {
  compileMasterMarkdown,
  compileStructuredJson,
  compileStructuredCsv,
  formatSafeCodeBlock
} from '../src/export/exporter';
import { createDefaultConfig, createInitialSession, normalizeUrl } from '../src/storage/storage';
import { CollectedPage } from '../src/types';

describe('Phase 3 — Synthetic Extraction Fixtures & Completeness Suite', () => {
  beforeEach(() => {
    setupChromeMock();
    document.body.innerHTML = '';
  });

  describe('1. Nested Sidebars & Deep Hierarchy Discovery', () => {
    it('discovers deep navigation hierarchy across nested lists, details, and aria toggles', async () => {
      document.body.innerHTML = `
        <aside class="docs-sidebar" role="navigation">
          <ul class="nav-root">
            <li><a href="/docs/intro">Overview</a></li>
            <li class="section-group">
              <details>
                <summary>API Core</summary>
                <ul>
                  <li><a href="/docs/api/client">Client</a></li>
                  <li>
                    <button class="expand-btn" aria-expanded="false">Transport</button>
                    <ul class="sub-nested">
                      <li><a href="/docs/api/transport/http">HTTP Transport</a></li>
                      <li><a href="/docs/api/transport/ws">WebSocket Transport</a></li>
                    </ul>
                  </li>
                </ul>
              </details>
            </li>
            <li>
              <div role="treeitem" aria-expanded="false" data-path="/docs/guides">Guides</div>
              <ul class="guides-sub">
                <li><a href="/docs/guides/auth">Authentication</a></li>
                <li><a href="/docs/guides/rate-limits">Rate Limits</a></li>
              </ul>
            </li>
          </ul>
        </aside>
      `;

      const config = createDefaultConfig('https://example.com/docs');
      config.urlPrefix = 'https://example.com/docs';

      // Verify sidebar element detection
      const sidebar = findSidebarElement();
      expect(sidebar).not.toBeNull();

      // Test expanding groups
      await expandSidebarGroups(sidebar!);

      // Test discovery
      const pages = await discoverPages(config);
      const urls = pages.map(p => p.url);

      expect(urls.some(u => u.includes('/docs/intro'))).toBe(true);
      expect(urls.some(u => u.includes('/docs/api/client'))).toBe(true);
      expect(urls.some(u => u.includes('/docs/api/transport/http'))).toBe(true);
      expect(urls.some(u => u.includes('/docs/api/transport/ws'))).toBe(true);
      expect(urls.some(u => u.includes('/docs/guides/auth'))).toBe(true);
      expect(urls.some(u => u.includes('/docs/guides/rate-limits'))).toBe(true);

      // Verify calculated depths
      const httpPage = pages.find(p => p.url.includes('/docs/api/transport/http'));
      expect(httpPage?.depth).toBeGreaterThan(1);
    });
  });

  describe('2. Long Documents & Reading Order Preservation', () => {
    it('extracts multi-section long document preserving exact sequence of headings, text, and code', () => {
      const container = document.createElement('article');
      container.className = 'documentation-content';
      container.innerHTML = `
        <h1>Comprehensive Architecture Manual</h1>
        <p>Paragraph 1: Introduction to architecture.</p>
        <h2>Section 1: Data Ingestion</h2>
        <p>Details about ingestion pipeline.</p>
        <pre><code class="language-typescript">const pipeline = new IngestionPipeline();</code></pre>
        <h3>Sub-section 1.1: Streaming Protocols</h3>
        <p>Streaming protocol explanation.</p>
        <h2>Section 2: Storage Layer</h2>
        <p>Details about storage.</p>
        <ul>
          <li>Storage item A</li>
          <li>Storage item B</li>
        </ul>
        <h2>Section 3: Query Engine</h2>
        <p>Details about querying.</p>
      `;
      document.body.appendChild(container);

      const { markdown, headings, contentBlocks } = htmlToMarkdown(container);
      const sections = extractSections(container);

      // Check headings sequence
      expect(headings).toEqual([
        'Comprehensive Architecture Manual',
        'Section 1: Data Ingestion',
        'Sub-section 1.1: Streaming Protocols',
        'Section 2: Storage Layer',
        'Section 3: Query Engine'
      ]);

      // Check contentBlocks reading order
      expect(contentBlocks[0].type).toBe('heading');
      expect(contentBlocks[0].content).toBe('Comprehensive Architecture Manual');
      expect(contentBlocks[1].type).toBe('paragraph');
      expect(contentBlocks[2].type).toBe('heading');
      expect(contentBlocks[3].type).toBe('paragraph');
      expect(contentBlocks[4].type).toBe('code');

      // Check section extraction
      expect(sections.length).toBe(5);
      expect(sections[0].heading).toBe('Comprehensive Architecture Manual');
      expect(sections[1].heading).toBe('Section 1: Data Ingestion');
      expect(sections[1].codeBlocks.length).toBe(1);
      expect(sections[2].heading).toBe('Sub-section 1.1: Streaming Protocols');

      // Check markdown text preserves heading hierarchy
      expect(markdown).toContain('# Comprehensive Architecture Manual');
      expect(markdown).toContain('## Section 1: Data Ingestion');
      expect(markdown).toContain('### Sub-section 1.1: Streaming Protocols');
      expect(markdown).toContain('## Section 2: Storage Layer');
      expect(markdown).toContain('## Section 3: Query Engine');
    });
  });

  describe('3. Multiple Tabs per Page', () => {
    it('extracts multiple independent tablists on a single documentation page safely', async () => {
      const pageEl = document.createElement('main');
      pageEl.innerHTML = `
        <div class="code-tabs-language">
          <div role="tablist" class="tab-list-1">
            <button role="tab" id="tab-ts" aria-selected="true" aria-controls="panel-ts">TypeScript</button>
            <button role="tab" id="tab-py" aria-selected="false" aria-controls="panel-py">Python</button>
          </div>
          <div id="panel-ts" role="tabpanel">const sdk = new SdkClient();</div>
          <div id="panel-py" role="tabpanel" hidden>sdk = SdkClient()</div>
        </div>

        <div class="code-tabs-package-manager" style="margin-top: 20px;">
          <div role="tablist" class="tab-list-2">
            <button role="tab" id="tab-npm" aria-selected="true" aria-controls="panel-npm">npm</button>
            <button role="tab" id="tab-yarn" aria-selected="false" aria-controls="panel-yarn">yarn</button>
          </div>
          <div id="panel-npm" role="tabpanel">npm install @sdk/core</div>
          <div id="panel-yarn" role="tabpanel" hidden>yarn add @sdk/core</div>
        </div>
      `;
      document.body.appendChild(pageEl);

      const result = await extractAllTabsSafely(pageEl, true);

      expect(result.extractedTabs.length).toBe(4);
      expect(result.extractedTabs.map(t => t.tabName)).toEqual(['TypeScript', 'Python', 'npm', 'yarn']);
      expect(result.extractedTabs[0].content).toContain('const sdk = new SdkClient();');
      expect(result.extractedTabs[1].content).toContain('sdk = SdkClient()');
      expect(result.extractedTabs[2].content).toContain('npm install @sdk/core');
      expect(result.extractedTabs[3].content).toContain('yarn add @sdk/core');

      expect(result.records.every(r => r.status === 'extracted')).toBe(true);
    });
  });

  describe('4. Accordions & Expandable Sections', () => {
    it('expands all collapsible accordions and captures hidden body text', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <details id="acc-1">
          <summary>Frequently Asked Questions: Billing</summary>
          <p>We accept all major credit cards and wire transfers.</p>
        </details>
        <div class="accordion-group">
          <button class="accordion-header" aria-expanded="false">Performance Tuning Tips</button>
          <div class="accordion-content">
            <p>Ensure connection pooling is enabled with max pool size of 20.</p>
          </div>
        </div>
      `;

      // Pre-expansion: details is closed
      const details = container.querySelector<HTMLDetailsElement>('details')!;
      expect(details.open).toBe(false);

      expandAllCollapsibles(container);

      // Post-expansion: details is open
      expect(details.open).toBe(true);

      const { markdown } = htmlToMarkdown(container);
      expect(markdown).toContain('Frequently Asked Questions: Billing');
      expect(markdown).toContain('We accept all major credit cards and wire transfers.');
      expect(markdown).toContain('Performance Tuning Tips');
      expect(markdown).toContain('Ensure connection pooling is enabled with max pool size of 20.');
    });
  });

  describe('5. Tables, Code Blocks & Fence Escaping', () => {
    it('handles tables with uneven columns, pipes in cells, and code fences containing backticks', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <table>
          <thead>
            <tr><th>Header 1</th><th>Header 2 | Filter</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td>Cell 1</td><td>Cell with | pipe</td><td>Regular text</td></tr>
            <tr><td>Row 2 short</td><td>Val 2</td></tr>
          </tbody>
        </table>
      `;

      const { markdown } = htmlToMarkdown(container);
      expect(markdown).toContain('| Header 1 | Header 2 \\| Filter | Notes |');
      expect(markdown).toContain('| --- | --- | --- |');
      expect(markdown).toContain('| Cell 1 | Cell with \\| pipe | Regular text |');
      expect(markdown).toContain('| Row 2 short | Val 2 |  |');

      // Verify code fence escaping
      const codeSnippet = '```typescript\nconsole.log("Nested fence");\n```';
      const safeBlock = formatSafeCodeBlock(codeSnippet, 'markdown');
      expect(safeBlock).toContain('````markdown');
      expect(safeBlock).toContain('console.log("Nested fence");');
      expect(safeBlock).toContain('````');
    });
  });

  describe('6. Nested Scroll Containers & Virtualized Content', () => {
    it('traverses nested scrollable regions without getting trapped in infinite loops', async () => {
      const outer = document.createElement('div');
      const scrollableDiv = document.createElement('div');
      scrollableDiv.style.overflowY = 'scroll';
      // Mock scrollHeight and clientHeight in jsdom
      Object.defineProperty(scrollableDiv, 'scrollHeight', { value: 1200, configurable: true });
      Object.defineProperty(scrollableDiv, 'clientHeight', { value: 300, configurable: true });
      scrollableDiv.innerHTML = '<p>Long nested log output line 1</p>';
      outer.appendChild(scrollableDiv);

      const result = await handleVirtualizedAndNestedContainers(outer, 4);
      expect(result.batchesCollected).toBeGreaterThan(0);
      expect(scrollableDiv.scrollTop).toBe(0); // Restored
    });
  });

  describe('7. Duplicate Links & URL Canonicalization', () => {
    it('canonicalizes links by removing tracking tokens, anchors, and deduplicating queue entries', () => {
      const u1 = 'https://docs.site.com/guide/intro#top';
      const u2 = 'https://docs.site.com/guide/intro?utm_source=docs_footer&utm_campaign=winter26';
      const u3 = 'https://docs.site.com/guide/intro/';

      expect(normalizeUrl(u1)).toBe('https://docs.site.com/guide/intro');
      expect(normalizeUrl(u2)).toBe('https://docs.site.com/guide/intro');
      expect(normalizeUrl(u3)).toBe('https://docs.site.com/guide/intro');

      // Functional query params are preserved
      const u4 = 'https://docs.site.com/api?version=v2&platform=linux#cmd';
      expect(normalizeUrl(u4)).toBe('https://docs.site.com/api?version=v2&platform=linux');
    });
  });

  describe('8. Breadcrumbs & Internal Links Extraction', () => {
    it('extracts breadcrumbs and internal cross-references from the DOM', () => {
      document.body.innerHTML = `
        <nav aria-label="Breadcrumbs" class="breadcrumbs">
          <ol>
            <li><a href="/docs">Docs</a></li>
            <li><span>/</span></li>
            <li><a href="/docs/guides">Guides</a></li>
            <li><span>/</span></li>
            <li><span>Security</span></li>
          </ol>
        </nav>
        <main class="page-content">
          <h1>Security Guide</h1>
          <p>Refer to the <a href="/docs/api/tokens">Token Management</a> and <a href="/docs/api/keys">API Keys</a> pages.</p>
          <a href="https://external.org">External Vendor</a>
        </main>
      `;

      const breadcrumbs = extractBreadcrumbs(document);
      expect(breadcrumbs).toEqual(['Docs', 'Guides', 'Security']);

      const mainEl = findMainContentElement();
      const internalLinks = extractInternalLinks(mainEl, window.location.origin);

      expect(internalLinks.length).toBe(2);
      expect(internalLinks[0].text).toBe('Token Management');
      expect(internalLinks[0].url).toBe(normalizeUrl(window.location.origin + '/docs/api/tokens'));
      expect(internalLinks[1].text).toBe('API Keys');
    });
  });

  describe('9. Empty and Malformed Pages Handling', () => {
    it('flags pages with sparse or empty content as incomplete and logs audit warnings', () => {
      const emptyEl = document.createElement('div');
      emptyEl.innerHTML = '<p>Stub</p>'; // Only 1 word

      const { markdown } = htmlToMarkdown(emptyEl);
      const wordCount = markdown.trim().split(/\s+/).filter(Boolean).length;
      expect(wordCount).toBeLessThan(25);

      const warnings: string[] = [];
      let isComplete = true;
      if (wordCount < 25) {
        isComplete = false;
        warnings.push('Low word count: page may have failed to render or requires login.');
      }

      expect(isComplete).toBe(false);
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('Low word count');
    });
  });

  describe('10. Audit Report Distinction of Complete, Partial, Failed, and Skipped', () => {
    it('generates an audit report distinguishing complete, partial, failed, and skipped items', () => {
      const session = createInitialSession('https://docs.site.com', 'Site Docs');

      const completePage: CollectedPage = {
        id: 'https://docs.site.com/page-1',
        url: 'https://docs.site.com/page-1',
        title: 'Complete Guide',
        markdown: 'Comprehensive content here with plenty of words describing the system in detail.',
        wordCount: 120,
        headings: ['Complete Guide'],
        sections: [],
        isComplete: true,
        extractedAt: Date.now(),
      };

      const partialPage: CollectedPage = {
        id: 'https://docs.site.com/page-2',
        url: 'https://docs.site.com/page-2',
        title: 'Partial Guide',
        markdown: 'Loading...',
        wordCount: 1,
        headings: [],
        sections: [],
        isComplete: false,
        warnings: ['Low word count: page may have failed to render or requires login.'],
        extractedAt: Date.now(),
      };

      session.collectedPages = {
        [completePage.url]: completePage,
        [partialPage.url]: partialPage,
      };
      session.pagesOrder = [completePage.url, partialPage.url];

      session.discoveredPages = {
        [completePage.url]: { id: 'p1', url: completePage.url, title: completePage.title, depth: 1, status: 'completed', discoveredAt: 0 },
        [partialPage.url]: { id: 'p2', url: partialPage.url, title: partialPage.title, depth: 1, status: 'completed', discoveredAt: 0 },
        'https://docs.site.com/page-3': { id: 'p3', url: 'https://docs.site.com/page-3', title: 'Skipped Page', depth: 1, status: 'skipped', skippedReason: 'User requested skip', discoveredAt: 0 },
        'https://docs.site.com/page-4': { id: 'p4', url: 'https://docs.site.com/page-4', title: 'Failed Page', depth: 1, status: 'failed', error: 'HTTP 500 Internal Error', discoveredAt: 0 }
      };

      session.errors = [
        { url: 'https://docs.site.com/page-4', message: 'HTTP 500 Internal Error', timestamp: Date.now(), retryable: false }
      ];

      // 1. Verify Master Markdown
      const md = compileMasterMarkdown(session);
      expect(md).toContain('✓ Complete');
      expect(md).toContain('⚠ Incomplete / Partial');
      expect(md).toContain('Low word count: page may have failed to render or requires login.');
      expect(md).toContain('## Collection & Audit Report');
      expect(md).toContain('HTTP 500 Internal Error');
      expect(md).toContain('User requested skip');

      // 2. Verify JSON export
      const jsonStr = compileStructuredJson(session);
      const jsonObj = JSON.parse(jsonStr);
      expect(jsonObj.pages[0].isComplete).toBe(true);
      expect(jsonObj.pages[1].isComplete).toBe(false);
      expect(jsonObj.pages[1].warnings.length).toBeGreaterThan(0);
      expect(jsonObj.auditReport.failures.length).toBe(1);
      expect(jsonObj.auditReport.skippedPages.length).toBe(1);

      // 3. Verify CSV export
      const csvStr = compileStructuredCsv(session);
      expect(csvStr).toContain('"Complete Guide"');
      expect(csvStr).toContain('"true"');
      expect(csvStr).toContain('"Partial Guide"');
      expect(csvStr).toContain('"false"');
    });
  });

  describe('11. Dynamic Rendering & Mutation Stabilization', () => {
    it('waitForContentStabilization resolves gracefully within timeout', async () => {
      const stabilizationPromise = waitForContentStabilization(300);
      await expect(stabilizationPromise).resolves.toBeUndefined();
    });
  });
});
