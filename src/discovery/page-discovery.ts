/**
 * DocuHarvest - Page Discovery Engine
 * Discovers documentation pages, expands nested sidebar groups,
 * resolves client-side navigation items, and maintains canonical deduplication.
 */

import { DiscoveredPage, HarvestConfig } from '../types';
import { normalizeUrl } from '../storage/storage';

const EXCLUDED_EXTENSIONS = [
  '.pdf', '.zip', '.tar', '.gz', '.tgz', '.bz2', '.7z',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
  '.mp4', '.webm', '.mp3', '.wav', '.mov',
  '.xml', '.json', '.rss', '.atom',
  '.exe', '.dmg', '.pkg', '.deb', '.rpm'
];

const EXCLUDED_PATH_KEYWORDS = [
  '/login', '/logout', '/signin', '/signout', '/signup', '/register',
  '/auth/', '/oauth', '/sso', '/account', '/profile', '/settings',
  '/billing', '/pricing', '/cart', '/checkout', '/privacy', '/terms',
  '/feed', '/rss', '/api-auth'
];

const SIDEBAR_SELECTORS = [
  'nav[aria-label*="documentation" i]',
  'nav[aria-label*="docs" i]',
  'nav[aria-label*="sidebar" i]',
  'nav[aria-label*="navigation" i]',
  'aside nav',
  'nav.sidebar',
  '.docs-sidebar',
  '.documentation-sidebar',
  '.theme-doc-sidebar-container',
  '.menu__list',
  '.sidebar-nav',
  '[data-testid*="sidebar" i]',
  '[data-testid*="doc-nav" i]',
  '[role="navigation"]',
  'aside',
  'div[class*="sidebar" i]',
  'div[class*="toc" i]',
  'div[class*="docs-nav" i]',
  'div[class*="table-of-contents" i]'
];

export function findSidebarElement(customSelector?: string): HTMLElement | null {
  if (customSelector) {
    const el = document.querySelector<HTMLElement>(customSelector);
    if (el) return el;
  }

  for (const selector of SIDEBAR_SELECTORS) {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
    for (const el of candidates) {
      if (el.id === 'docuharvest-root' || el.closest('#docuharvest-root')) continue;
      const linkCount = el.querySelectorAll('a[href], [role="link"], [data-href]').length;
      if (linkCount >= 2 && !el.hidden && el.style.display !== 'none') {
        return el;
      }
    }
  }

  return null;
}

/**
 * Expands collapsed sidebar navigation groups (accordions, details, treeitem toggles)
 * so that nested sub-pages are rendered in the DOM for discovery.
 */
export async function expandSidebarGroups(sidebarEl: HTMLElement): Promise<void> {
  // 1. HTML <details> tags inside sidebar
  const detailsList = Array.from(sidebarEl.querySelectorAll<HTMLDetailsElement>('details:not([open])'));
  for (const details of detailsList) {
    details.open = true;
    details.dispatchEvent(new Event('toggle', { bubbles: true }));
  }

  // 2. Collapsed button / treeitem toggles
  const collapsedButtons = Array.from(
    sidebarEl.querySelectorAll<HTMLElement>(
      'button[aria-expanded="false"], [role="button"][aria-expanded="false"], [role="treeitem"][aria-expanded="false"], .menu__caret'
    )
  );

  for (const btn of collapsedButtons) {
    try {
      // Ensure this is not a form submit or logout button
      if (btn.getAttribute('type') === 'submit') continue;
      const href = btn.getAttribute('href');
      if (href && (href.startsWith('http') || href.startsWith('/auth') || href.startsWith('/logout'))) continue;

      btn.click();
    } catch {
      // Ignore click issues on passive items
    }
  }

  // Allow DOM rendering/transitions to settle
  if (detailsList.length > 0 || collapsedButtons.length > 0) {
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}

export function isCandidateDocUrl(rawHref: string, baseOrigin: string, prefixFilter?: string): boolean {
  if (!rawHref) return false;
  if (rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
    return false;
  }

  try {
    const url = new URL(rawHref, baseOrigin);

    // Only allow HTTP/HTTPS
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

    // Must match same origin
    if (url.origin !== baseOrigin) return false;

    // Check excluded extensions
    const lowerPath = url.pathname.toLowerCase();
    if (EXCLUDED_EXTENSIONS.some(ext => lowerPath.endsWith(ext))) {
      return false;
    }

    // Check excluded paths (auth, pricing, etc.)
    if (EXCLUDED_PATH_KEYWORDS.some(keyword => lowerPath.includes(keyword))) {
      return false;
    }

    // If prefix filter is provided, ensure pathname starts with prefix
    if (prefixFilter) {
      try {
        const prefixUrl = new URL(prefixFilter, baseOrigin);
        const cleanPrefix = prefixUrl.pathname.replace(/\/$/, '');
        if (cleanPrefix && !lowerPath.startsWith(cleanPrefix.toLowerCase())) {
          return false;
        }
      } catch {
        if (!url.pathname.startsWith(prefixFilter)) return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function cleanPageTitle(rawText: string, url: string): string {
  let title = rawText.replace(/\s+/g, ' ').trim();
  if (title.length > 0 && title.length <= 150) {
    return title;
  }

  // Fallback: derive readable title from URL path slug
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const lastPart = parts[parts.length - 1] || 'Documentation Root';
    return decodeURIComponent(lastPart)
      .replace(/[-_]/g, ' ')
      .replace(/\.(html?|mdx?)$/i, '')
      .replace(/\b\w/g, char => char.toUpperCase());
  } catch {
    return 'Documentation Page';
  }
}

/**
 * Extracts candidate navigation items (anchors, buttons with routes, role=link elements).
 */
function extractNavigationElements(container: HTMLElement): Array<{ rawHref: string; label: string; depth: number }> {
  const results: Array<{ rawHref: string; label: string; depth: number }> = [];

  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], [role="link"][data-href], [role="link"][data-url], [data-href], [data-url], [data-path], [data-to]'
    )
  );

  for (const el of candidates) {
    // Avoid our extension root
    if (el.id === 'docuharvest-root' || el.closest('#docuharvest-root')) continue;

    let href = el.getAttribute('href') ||
      el.getAttribute('data-href') ||
      el.getAttribute('data-url') ||
      el.getAttribute('data-path') ||
      el.getAttribute('data-to') || '';

    if (!href) continue;

    // Calculate nesting depth based on DOM parent hierarchy
    let depth = 1;
    let parent = el.parentElement;
    while (parent && parent !== container) {
      if (['UL', 'OL', 'NAV', 'SECTION', 'DIV'].includes(parent.tagName)) {
        depth++;
      }
      parent = parent.parentElement;
    }

    const rawText = el.getAttribute('aria-label') || el.innerText || el.textContent || '';
    results.push({ rawHref: href, label: rawText, depth });
  }

  return results;
}

/**
 * Discovers documentation pages in the current page's sidebar and DOM.
 * Supports recursive sidebar group expansion, client-side navigation elements,
 * duplicate detection, and canonical ordering.
 */
export async function discoverPages(config: HarvestConfig): Promise<DiscoveredPage[]> {
  const currentOrigin = window.location.origin;
  const currentNormUrl = normalizeUrl(window.location.href);
  const currentDocTitle = document.title ? document.title.split(/[-|–—]/)[0].trim() : 'Current Page';

  const sidebarEl = findSidebarElement(config.sidebarSelector);
  const container = sidebarEl || document.body;

  // Step 1: Expand collapsed sidebar groups if enabled
  if (config.expandSidebarGroups && sidebarEl) {
    await expandSidebarGroups(sidebarEl);
  }

  // Step 2: Extract all navigation elements
  const navItems = extractNavigationElements(container);
  const seenUrls = new Set<string>();
  const discovered: DiscoveredPage[] = [];

  // Always ensure the current page itself is in the collection list as root
  const currentEntry: DiscoveredPage = {
    id: currentNormUrl,
    url: currentNormUrl,
    title: cleanPageTitle(currentDocTitle, currentNormUrl),
    depth: 0,
    status: 'pending',
    discoveredAt: Date.now(),
    retryCount: 0,
  };
  discovered.push(currentEntry);
  seenUrls.add(currentNormUrl);

  // Step 3: Filter, canonicalize, and deduplicate
  for (const item of navItems) {
    if (!isCandidateDocUrl(item.rawHref, currentOrigin, config.urlPrefix)) {
      continue;
    }

    const fullUrl = new URL(item.rawHref, currentOrigin).toString();
    const normUrl = normalizeUrl(fullUrl);

    if (seenUrls.has(normUrl)) {
      continue;
    }

    const title = cleanPageTitle(item.label, normUrl);

    seenUrls.add(normUrl);
    discovered.push({
      id: normUrl,
      url: normUrl,
      title,
      depth: item.depth,
      status: 'pending',
      discoveredAt: Date.now(),
      retryCount: 0,
    });
  }

  return discovered;
}
