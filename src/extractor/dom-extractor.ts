/**
 * DocuHarvest - Complete DOM Extraction Engine
 * Stabilizes rendering, expands accordions, captures tabs, scrolls virtualized lists,
 * converts structured HTML to rich Markdown, builds ContentBlocks, and detects completeness.
 * Strictly isolates and excludes the extension's own Shadow DOM.
 */

import { CodeBlock, CollectedPage, ContentBlock, ExtractedImage, SectionContent, TabExtractionRecord } from '../types';
import { normalizeUrl } from '../storage/storage';
import { extractAllTabsSafely } from './tab-extractor';

const CONTENT_SELECTORS = [
  'main article',
  'article',
  'main',
  '[role="main"]',
  '.markdown-body',
  '.docs-content',
  '.documentation-content',
  '.doc-content',
  '.theme-doc-markdown',
  '.page-content',
  '.content-body',
  '#content',
  '#main-content'
];

const BREADCRUMB_SELECTORS = [
  'nav[aria-label*="breadcrumb" i]',
  '.breadcrumbs',
  '.breadcrumb',
  'ul.breadcrumbs',
  'ol.breadcrumb',
  '.theme-doc-breadcrumbs'
];

/**
 * Extracts breadcrumb navigation path if available on the page.
 */
export function extractBreadcrumbs(root: Document | HTMLElement = document): string[] {
  for (const selector of BREADCRUMB_SELECTORS) {
    const el = root.querySelector<HTMLElement>(selector);
    if (el && !el.closest('#docuharvest-root')) {
      const items = Array.from(el.querySelectorAll('li, a, span'))
        .filter(item => !item.closest('#docuharvest-root'))
        .map(i => (i.textContent || '').trim())
        .filter(t => t.length > 0 && t !== '/' && t !== '>' && t !== '»');
      // Deduplicate consecutive items
      const deduped: string[] = [];
      for (const item of items) {
        if (deduped.length === 0 || deduped[deduped.length - 1] !== item) {
          deduped.push(item);
        }
      }
      if (deduped.length > 0) {
        return deduped;
      }
    }
  }
  return [];
}

/**
 * Extracts internal documentation links found within the page content.
 */
export function extractInternalLinks(container: HTMLElement, baseOrigin: string): Array<{ text: string; url: string }> {
  const links: Array<{ text: string; url: string }> = [];
  const anchors = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]'));

  for (const a of anchors) {
    if (a.id === 'docuharvest-root' || a.closest('#docuharvest-root')) continue;

    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;

    try {
      const url = new URL(href, baseOrigin);
      if (url.origin === baseOrigin) {
        const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
        if (text) {
          links.push({ text, url: normalizeUrl(url.toString()) });
        }
      }
    } catch {
      // ignore invalid URLs
    }
  }

  return links;
}

/**
 * Waits for dynamic page mutations to stabilize using a MutationObserver.
 * Resolves when no mutations occur for 250ms, or when timeout expires.
 */
export async function waitForContentStabilization(timeoutMs: number = 2500): Promise<void> {
  return new Promise((resolve) => {
    let timer: any = null;
    let observer: MutationObserver | null = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (observer) observer.disconnect();
      resolve();
    };

    const maxTimeout = setTimeout(cleanup, timeoutMs);

    const onMutation = (mutations: MutationRecord[]) => {
      // Ignore mutations originating entirely from DocuHarvest panel
      const relevant = mutations.some(m => !(m.target as HTMLElement)?.closest?.('#docuharvest-root'));
      if (!relevant) return;

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        clearTimeout(maxTimeout);
        cleanup();
      }, 250);
    };

    try {
      observer = new MutationObserver(onMutation);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      timer = setTimeout(() => {
        clearTimeout(maxTimeout);
        cleanup();
      }, 350);
    } catch {
      cleanup();
    }
  });
}

/**
 * Smoothly scrolls the main viewport to trigger lazy images and code blocks.
 */
export async function triggerScrollToLoad(): Promise<void> {
  const scrollHeight = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight
  );
  const viewportHeight = window.innerHeight;

  if (scrollHeight <= viewportHeight) return;

  const step = Math.max(viewportHeight * 0.75, 450);
  let currentScroll = 0;

  while (currentScroll < scrollHeight) {
    currentScroll += step;
    window.scrollTo({ top: currentScroll, behavior: 'instant' });
    await new Promise(resolve => setTimeout(resolve, 80));
  }
}

/**
 * Identifies and scrolls nested scrollable/virtualized containers within the documentation.
 * Accumulates items/batches before earlier elements unmount from the DOM.
 */
export async function handleVirtualizedAndNestedContainers(
  contentEl: HTMLElement,
  maxSteps: number = 8
): Promise<{ batchesCollected: number; accumulatedItems: Array<{ id: string; content: string }> }> {
  let batchesCollected = 0;
  const accumulatedMap = new Map<string, string>();

  const candidates = [contentEl, ...Array.from(contentEl.querySelectorAll<HTMLElement>('*'))];
  const scrollables = candidates.filter(el => {
    if (el.id === 'docuharvest-root' || el.closest('#docuharvest-root')) return false;
    const style = typeof window.getComputedStyle === 'function' ? window.getComputedStyle(el) : null;
    const overflowY = (style?.overflowY || el.style?.overflowY || '').toLowerCase();
    const isScrollable = (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 150;
    return isScrollable;
  });

  for (const container of scrollables) {
    const originalScroll = container.scrollTop;
    const stepSize = Math.max(container.clientHeight * 0.8, 300);
    let currentScroll = 0;
    let step = 0;

    const captureBatch = () => {
      const rows = Array.from(
        container.querySelectorAll<HTMLElement>('tr, li, [role="row"], [role="listitem"], .virtual-item, .list-item')
      ).filter(r => !r.closest('#docuharvest-root'));

      if (rows.length > 0) {
        for (const row of rows) {
          const text = (row.textContent || '').replace(/\s+/g, ' ').trim();
          if (text.length > 0 && !accumulatedMap.has(text)) {
            accumulatedMap.set(text, text);
          }
        }
      } else {
        const text = (container.textContent || '').replace(/\s+/g, ' ').trim();
        if (text.length > 0 && !accumulatedMap.has(text)) {
          accumulatedMap.set(text, text);
        }
      }
    };

    captureBatch();

    while (currentScroll < container.scrollHeight && step < maxSteps) {
      currentScroll += stepSize;
      container.scrollTop = currentScroll;
      step++;
      batchesCollected++;
      await new Promise(resolve => setTimeout(resolve, 80));
      captureBatch();
    }

    container.scrollTop = originalScroll;
  }

  const accumulatedItems = Array.from(accumulatedMap.values()).map((content, idx) => ({
    id: `virt_${idx + 1}`,
    content,
  }));

  return { batchesCollected, accumulatedItems };
}

/**
 * Expands all <details> elements and collapsed accordions inside the documentation.
 * Returns a restoration function to revert initial open/closed states.
 */
export function expandAllCollapsibles(container: HTMLElement): () => void {
  const initialDetails = new Map<HTMLDetailsElement, boolean>();
  container.querySelectorAll<HTMLDetailsElement>('details').forEach(details => {
    if (details.closest('#docuharvest-root')) return;
    initialDetails.set(details, details.open);
    if (!details.open) {
      details.open = true;
    }
  });

  const initialAria = new Map<HTMLElement, boolean>();
  const ariaCollapsed = container.querySelectorAll<HTMLElement>(
    'button[aria-expanded], [role="button"][aria-expanded], div[aria-expanded]'
  );
  ariaCollapsed.forEach(el => {
    if (el.closest('#docuharvest-root')) return;
    const wasExpanded = el.getAttribute('aria-expanded') === 'true';
    initialAria.set(el, wasExpanded);
    if (!wasExpanded) {
      try {
        if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
          el.click();
        }
      } catch {
        // Ignore click issues
      }
      el.setAttribute('aria-expanded', 'true');
    }
  });

  return () => {
    for (const [details, wasOpen] of initialDetails) {
      details.open = wasOpen;
    }
    for (const [el, wasExpanded] of initialAria) {
      el.setAttribute('aria-expanded', wasExpanded ? 'true' : 'false');
    }
  };
}

/**
 * Finds the primary documentation content container using heuristics.
 */
export function findMainContentElement(customSelector?: string): HTMLElement {
  if (customSelector) {
    const el = document.querySelector<HTMLElement>(customSelector);
    if (el && !el.closest('#docuharvest-root')) return el;
  }

  for (const selector of CONTENT_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector);
    const text = (el?.innerText || el?.textContent || '').trim();
    if (el && !el.closest('#docuharvest-root') && !el.hidden && el.style.display !== 'none' && text.length > 20) {
      return el;
    }
  }

  const candidates = Array.from(document.querySelectorAll<HTMLElement>('div, section, article'));
  let bestElement: HTMLElement = document.body;
  let maxScore = 0;

  for (const el of candidates) {
    if (['NAV', 'HEADER', 'FOOTER', 'ASIDE'].includes(el.tagName)) continue;
    if (el.id === 'docuharvest-root' || el.closest('#docuharvest-root')) continue;
    if (el.hidden || el.style.display === 'none') continue;

    const pCount = el.querySelectorAll('p, pre, h1, h2, h3, h4').length;
    const textLen = (el.innerText || el.textContent || '').length;
    const score = pCount * 50 + textLen;

    if (score > maxScore) {
      maxScore = score;
      bestElement = el;
    }
  }

  return bestElement;
}

/**
 * Formats an HTML table element into a GitHub Flavored Markdown table.
 */
function convertTableToMarkdown(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  const tableData: string[][] = [];
  let maxCols = 0;

  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('th, td'));
    const rowValues = cells.map(c => {
      return (c.textContent || '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
    });
    if (rowValues.length > maxCols) {
      maxCols = rowValues.length;
    }
    tableData.push(rowValues);
  }

  if (tableData.length === 0 || maxCols === 0) return '';

  let md = '\n';
  const headerRow = tableData[0];
  while (headerRow.length < maxCols) headerRow.push('');
  md += '| ' + headerRow.join(' | ') + ' |\n';
  md += '| ' + new Array(maxCols).fill('---').join(' | ') + ' |\n';

  for (let i = 1; i < tableData.length; i++) {
    const row = tableData[i];
    while (row.length < maxCols) row.push('');
    md += '| ' + row.join(' | ') + ' |\n';
  }
  md += '\n';

  return md;
}

function checkAdmonition(el: HTMLElement): { isAdmonition: boolean; type: string } {
  const className = (el.className || '').toLowerCase();
  const role = (el.getAttribute('role') || '').toLowerCase();

  const types = ['note', 'warning', 'tip', 'caution', 'important', 'info', 'danger'];
  for (const t of types) {
    if (
      className.includes(`admonition-${t}`) ||
      className.includes(`alert-${t}`) ||
      className.includes(`callout-${t}`) ||
      (className.includes('admonition') && className.includes(t)) ||
      (className.includes('callout') && className.includes(t)) ||
      (role === 'alert' && className.includes(t))
    ) {
      return { isAdmonition: true, type: t.toUpperCase() };
    }
  }

  if (className.includes('admonition') || className.includes('callout') || role === 'alert') {
    return { isAdmonition: true, type: 'NOTE' };
  }

  return { isAdmonition: false, type: '' };
}

/**
 * Converts DOM nodes recursively into clean, readable Markdown,
 * preserving reading order, nested lists, callouts, and code blocks.
 */
export function htmlToMarkdown(element: HTMLElement): {
  markdown: string;
  codeBlocks: CodeBlock[];
  headings: string[];
  images: ExtractedImage[];
  contentBlocks: ContentBlock[];
} {
  const clone = element.cloneNode(true) as HTMLElement;

  const removeSelectors = [
    'script', 'style', 'noscript', 'iframe', 'svg:not([data-diagram])',
    'form', 'input', 'select', 'textarea',
    '.docuharvest-ui', '#docuharvest-root', '[id*="docuharvest"]', '[class*="dh-"]',
    '.feedback-widget', '.copy-button', '.btn-copy',
    '[aria-hidden="true"]:not(code)', '.breadcrumbs', '.page-nav'
  ];

  clone.querySelectorAll(removeSelectors.join(', ')).forEach(el => el.remove());

  const codeBlocks: CodeBlock[] = [];
  const headings: string[] = [];
  const images: ExtractedImage[] = [];
  const contentBlocks: ContentBlock[] = [];
  let blockIndex = 0;

  function traverse(node: Node, listDepth: number = 0): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent || '').replace(/\s+/g, ' ');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    // Admonition / Callout
    const admonition = checkAdmonition(el);
    if (admonition.isAdmonition) {
      const innerText = Array.from(el.childNodes).map(c => traverse(c, listDepth)).join('').trim();
      const lines = innerText.split('\n').map(l => `> ${l}`).join('\n');
      const formatted = `\n\n> [!${admonition.type}]\n${lines}\n\n`;
      contentBlocks.push({
        id: `block_${++blockIndex}`,
        type: 'callout',
        content: formatted.trim(),
        metadata: { calloutType: admonition.type },
      });
      return formatted;
    }

    // Code blocks <pre> or <pre><code>
    if (tag === 'pre') {
      const codeEl = el.querySelector('code') || el;
      let language = '';
      const classAttr = (codeEl.className || '') + ' ' + (el.className || '');
      const match = classAttr.match(/language-([a-zA-Z0-9_-]+)/i) || classAttr.match(/lang-([a-zA-Z0-9_-]+)/i);
      if (match) {
        language = match[1];
      }

      const rawCode = codeEl.textContent || '';
      codeBlocks.push({ language, code: rawCode });

      // Choose fence style: if code contains 3 backticks, wrap in 4 backticks
      const fence = rawCode.includes('```') ? '````' : '```';
      const formatted = `\n\n${fence}${language}\n${rawCode.trim()}\n${fence}\n\n`;

      contentBlocks.push({
        id: `block_${++blockIndex}`,
        type: 'code',
        content: formatted.trim(),
        metadata: { language },
      });
      return formatted;
    }

    // Inline code
    if (tag === 'code') {
      const text = el.textContent || '';
      return `\`${text}\``;
    }

    // Headings H1 - H6
    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1], 10);
      const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) {
        headings.push(text);
        const prefix = '#'.repeat(level);
        const formatted = `\n\n${prefix} ${text}\n\n`;
        contentBlocks.push({
          id: `block_${++blockIndex}`,
          type: 'heading',
          content: text,
          metadata: { level },
        });
        return formatted;
      }
      return '';
    }

    // Paragraph
    if (tag === 'p') {
      const inner = Array.from(el.childNodes).map(c => traverse(c, listDepth)).join('').trim();
      if (inner) {
        contentBlocks.push({
          id: `block_${++blockIndex}`,
          type: 'paragraph',
          content: inner,
        });
        return `\n\n${inner}\n\n`;
      }
      return '';
    }

    // Blockquote
    if (tag === 'blockquote') {
      const inner = Array.from(el.childNodes).map(c => traverse(c, listDepth)).join('').trim();
      const lines = inner.split('\n').map(l => `> ${l}`).join('\n');
      return `\n\n${lines}\n\n`;
    }

    // Tables
    if (tag === 'table') {
      const tableMd = convertTableToMarkdown(el as HTMLTableElement);
      if (tableMd) {
        contentBlocks.push({
          id: `block_${++blockIndex}`,
          type: 'table',
          content: tableMd.trim(),
        });
      }
      return tableMd;
    }

    // Images
    if (tag === 'img') {
      const src = el.getAttribute('src') || '';
      const alt = el.getAttribute('alt') || 'Documentation image';
      let caption = '';
      const figcaption = el.closest('figure')?.querySelector('figcaption');
      if (figcaption) {
        caption = (figcaption.textContent || '').trim();
      }
      if (src) {
        images.push({ src, alt, caption });
        const imgMd = `\n\n![${alt}](${src})${caption ? `\n*${caption}*` : ''}\n\n`;
        contentBlocks.push({
          id: `block_${++blockIndex}`,
          type: 'image',
          content: imgMd.trim(),
          metadata: { src, alt, caption },
        });
        return imgMd;
      }
      return '';
    }

    // Lists
    if (tag === 'ul') {
      const indent = '  '.repeat(listDepth);
      const items = Array.from(el.children)
        .filter(c => c.tagName === 'LI')
        .map(li => {
          const content = Array.from(li.childNodes).map(c => traverse(c, listDepth + 1)).join('').trim();
          return `${indent}- ${content}`;
        });
      const listMd = `\n\n${items.join('\n')}\n\n`;
      if (listDepth === 0) {
        contentBlocks.push({
          id: `block_${++blockIndex}`,
          type: 'list',
          content: listMd.trim(),
        });
      }
      return listMd;
    }

    if (tag === 'ol') {
      const indent = '  '.repeat(listDepth);
      let index = 1;
      const items = Array.from(el.children)
        .filter(c => c.tagName === 'LI')
        .map(li => {
          const content = Array.from(li.childNodes).map(c => traverse(c, listDepth + 1)).join('').trim();
          return `${indent}${index++}. ${content}`;
        });
      const listMd = `\n\n${items.join('\n')}\n\n`;
      if (listDepth === 0) {
        contentBlocks.push({
          id: `block_${++blockIndex}`,
          type: 'list',
          content: listMd.trim(),
        });
      }
      return listMd;
    }

    // Links
    if (tag === 'a') {
      const href = el.getAttribute('href');
      const inner = Array.from(el.childNodes).map(c => traverse(c, listDepth)).join('').trim();
      if (href && inner) {
        return `[${inner}](${href})`;
      }
      return inner;
    }

    // Bold
    if (tag === 'strong' || tag === 'b') {
      const inner = Array.from(el.childNodes).map(c => traverse(c, listDepth)).join('');
      return inner.trim() ? `**${inner.trim()}**` : '';
    }

    // Italic
    if (tag === 'em' || tag === 'i') {
      const inner = Array.from(el.childNodes).map(c => traverse(c, listDepth)).join('');
      return inner.trim() ? `*${inner.trim()}*` : '';
    }

    // Strikethrough
    if (tag === 's' || tag === 'del' || tag === 'strike') {
      const inner = Array.from(el.childNodes).map(c => traverse(c, listDepth)).join('');
      return inner.trim() ? `~~${inner.trim()}~~` : '';
    }

    if (tag === 'br') return '\n';
    if (tag === 'hr') return '\n\n---\n\n';

    return Array.from(el.childNodes).map(c => traverse(c, listDepth)).join('');
  }

  let rawMd = traverse(clone);
  rawMd = rawMd.replace(/\n{3,}/g, '\n\n').trim();

  return { markdown: rawMd, codeBlocks, headings, images, contentBlocks };
}

/**
 * Extracts sections from the content and divides them by heading hierarchy.
 */
export function extractSections(contentEl: HTMLElement): SectionContent[] {
  const sections: SectionContent[] = [];
  const headingElements = Array.from(
    contentEl.querySelectorAll<HTMLElement>('h1, h2, h3, h4')
  ).filter(h => !h.closest('#docuharvest-root'));

  if (headingElements.length === 0) {
    const text = (contentEl.innerText || contentEl.textContent || '').trim();
    sections.push({
      heading: 'Overview',
      level: 1,
      text,
      codeBlocks: [],
    });
    return sections;
  }

  for (let i = 0; i < headingElements.length; i++) {
    const headingEl = headingElements[i];
    const level = parseInt(headingEl.tagName[1], 10);
    const heading = (headingEl.innerText || headingEl.textContent || '').trim();

    let current: Node | null = headingEl.nextSibling;
    let sectionText = '';
    const sectionCodes: CodeBlock[] = [];

    while (current && (i === headingElements.length - 1 || current !== headingElements[i + 1])) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const el = current as HTMLElement;
        if (/^H[1-6]$/.test(el.tagName)) break;
        if (el.id === 'docuharvest-root' || el.closest('#docuharvest-root')) {
          current = current.nextSibling;
          continue;
        }

        sectionText += ' ' + (el.innerText || el.textContent || '');

        const preElements: HTMLElement[] = [];
        if (el.tagName === 'PRE') {
          preElements.push(el);
        }
        preElements.push(...Array.from(el.querySelectorAll<HTMLElement>('pre')).filter(p => !p.closest('#docuharvest-root')));

        for (const pre of preElements) {
          const codeEl = pre.querySelector('code') || pre;
          let language = pre.getAttribute('data-language') || pre.getAttribute('data-lang') || '';
          if (!language) {
            const classAttr = (codeEl.className || '') + ' ' + (pre.className || '');
            const match = classAttr.match(/language-([a-zA-Z0-9_-]+)/i) || classAttr.match(/lang-([a-zA-Z0-9_-]+)/i);
            if (match) {
              language = match[1];
            }
          }
          sectionCodes.push({
            language,
            code: (pre.textContent || '').trim()
          });
        }
      }
      current = current.nextSibling;
    }

    sections.push({
      heading,
      level,
      text: sectionText.trim(),
      codeBlocks: sectionCodes,
    });
  }

  return sections;
}

/**
 * Primary extraction function for the current active page.
 */
export async function extractCurrentPage(
  customContentSelector?: string,
  autoScroll: boolean = false,
  expandAccordions: boolean = true,
  captureTabs: boolean = true,
  safeTabSwitching: boolean = true,
  scrollVirtualized: boolean = true,
  maxVirtualSteps: number = 8,
  stabilizationTimeoutMs: number = 2500
): Promise<CollectedPage> {
  const currentUrl = normalizeUrl(window.location.href);
  const pageTitle = (document.title || 'Documentation Page').split(/[-|–—]/)[0].trim();
  const warnings: string[] = [];
  const notes: string[] = [];

  const initialScrollX = window.scrollX;
  const initialScrollY = window.scrollY;
  let restoreAccordions: (() => void) | null = null;

  try {
    // Step 1: Wait for rendering & dynamic hydration stabilization
    await waitForContentStabilization(stabilizationTimeoutMs);

    // Step 2: Smooth auto-scroll only if explicitly enabled
    if (autoScroll) {
      await triggerScrollToLoad();
    }

    // Step 3: Find main content container
    const contentEl = findMainContentElement(customContentSelector);

    // Step 4: Extract Breadcrumbs & Internal Links
    const breadcrumbs = extractBreadcrumbs(document);
    const internalLinks = extractInternalLinks(contentEl, window.location.origin);

    // Step 5: Expand hidden details & accordions, recording initial states for restoration
    if (expandAccordions) {
      restoreAccordions = expandAllCollapsibles(contentEl);
    }

    // Step 6: Handle nested scrollable / virtualized containers and accumulate items
    let virtualizedResult: { batchesCollected: number; accumulatedItems: Array<{ id: string; content: string }> } = {
      batchesCollected: 0,
      accumulatedItems: [],
    };
    if (scrollVirtualized) {
      virtualizedResult = await handleVirtualizedAndNestedContainers(contentEl, maxVirtualSteps);
      if (virtualizedResult.batchesCollected > 0) {
        notes.push(`Scrolled and accumulated ${virtualizedResult.accumulatedItems.length} items across ${virtualizedResult.batchesCollected} virtualized batches.`);
      }
    }

    // Step 7: Safe tab extraction
    let tabsResult: { extractedTabs: Array<{ tabName: string; content: string }>; records: TabExtractionRecord[] } = {
      extractedTabs: [],
      records: [],
    };

    if (captureTabs) {
      tabsResult = await extractAllTabsSafely(contentEl, safeTabSwitching);
      for (const rec of tabsResult.records) {
        if (rec.status === 'unsafe') {
          notes.push(`Tab "${rec.tabName}" was flagged as non-read-only and skipped for safety.`);
        }
      }
    }

    // Step 8: Convert DOM to Markdown, extract code blocks, headings, images, and contentBlocks
    let { markdown, codeBlocks, headings, images, contentBlocks } = htmlToMarkdown(contentEl);
    const sections = extractSections(contentEl);

    if (tabsResult.extractedTabs.length > 0 && sections.length > 0) {
      sections[0].tabs = tabsResult.extractedTabs;
    }

    // Append virtualized content if items unmounted during scrolling
    if (virtualizedResult.accumulatedItems.length > 0) {
      const virtItemsMd = virtualizedResult.accumulatedItems.map(item => `- ${item.content}`).join('\n');
      markdown += `\n\n### Accumulated Virtualized Content\n\n${virtItemsMd}\n`;
    }

    const wordCount = markdown.trim().split(/\s+/).filter(Boolean).length;

    // Strict completeness detection
    let isComplete = true;
    if (wordCount < 25) {
      isComplete = false;
      warnings.push('Low word count: page may have failed to render or requires login.');
    }

    if (tabsResult.records.some(r => r.status === 'unsafe' || r.status === 'empty')) {
      isComplete = false;
      warnings.push('One or more documentation tabs could not be fully extracted (unsafe or empty panels).');
    }

    return {
      id: currentUrl,
      url: currentUrl,
      title: pageTitle,
      markdown,
      wordCount,
      headings,
      sections,
      breadcrumbs: breadcrumbs.length > 0 ? breadcrumbs : undefined,
      internalLinks: internalLinks.length > 0 ? internalLinks : undefined,
      contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
      virtualizedItems: virtualizedResult.accumulatedItems.length > 0 ? virtualizedResult.accumulatedItems : undefined,
      notes: notes.length > 0 ? notes : undefined,
      tabsExtracted: tabsResult.records,
      images,
      isComplete,
      warnings: warnings.length > 0 ? warnings : undefined,
      extractedAt: Date.now(),
    };
  } finally {
    // Restore accordions to their initial states
    if (restoreAccordions) {
      try {
        restoreAccordions();
      } catch {
        // ignore restore error
      }
    }

    // Restore reader's original scroll position
    window.scrollTo({ left: initialScrollX, top: initialScrollY, behavior: 'instant' });
  }
}
