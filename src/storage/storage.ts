/**
 * DocuHarvest - Durable State Management via chrome.storage.local
 * Guarantees recovery across full page reloads, SPA transitions, and cross-page navigations.
 */

import { HarvestConfig, HarvestSession, SessionStats } from '../types';

export const STORAGE_KEY_SESSION = 'docuharvest_harvest_session_v1';

const TRACKING_QUERY_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'source', 'fbclid', 'gclid', '_ga', '_gl', 'msclkid'
]);

/**
 * Returns a stable, canonical URL for a documentation page.
 * Strips hash fragments and marketing tracking queries, while preserving functional documentation query params.
 */
export function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    // Strip hash fragments (e.g. #section-anchor)
    url.hash = '';

    // Remove tracking query params
    const searchParams = new URLSearchParams(url.search);
    let searchChanged = false;
    for (const key of Array.from(searchParams.keys())) {
      if (TRACKING_QUERY_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
        searchParams.delete(key);
        searchChanged = true;
      }
    }
    if (searchChanged) {
      url.search = searchParams.toString();
    }

    // Normalize trailing slash for paths (keep root '/' intact)
    let pathname = url.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    url.pathname = pathname;

    return url.toString();
  } catch {
    return rawUrl.trim();
  }
}

export function createDefaultConfig(initialUrl: string = ''): HarvestConfig {
  let urlPrefix = '';
  try {
    if (initialUrl) {
      const u = new URL(initialUrl);
      // Auto-detect common documentation root paths e.g. /docs/ or /documentation/ or origin
      const pathParts = u.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0 && ['docs', 'doc', 'guide', 'manual', 'reference', 'learn', 'api'].includes(pathParts[0].toLowerCase())) {
        urlPrefix = `${u.origin}/${pathParts[0]}`;
      } else {
        urlPrefix = u.origin;
      }
    }
  } catch {
    urlPrefix = '';
  }

  return {
    rateLimitMs: 1200,
    autoScroll: true,
    expandAccordions: true,
    expandSidebarGroups: true,
    captureTabs: true,
    safeTabSwitching: true,
    scrollVirtualizedContainers: true,
    maxVirtualScrollSteps: 8,
    maxDepth: 4,
    maxRetries: 2,
    stabilizationTimeoutMs: 3000,
    pageExtractionTimeoutMs: 15000,
    spaNavigationSupport: true,
    urlPrefix,
  };
}

export function createInitialSession(url: string = '', title: string = ''): HarvestSession {
  const normUrl = url ? normalizeUrl(url) : '';
  return {
    id: `harvest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    status: 'idle',
    currentUrl: normUrl,
    currentPageName: title || 'Current Documentation Page',
    currentOperation: 'Ready to discover and collect documentation.',
    progressPercentage: 0,
    discoveredPages: {},
    collectedPages: {},
    pagesOrder: [],
    queue: [],
    activeTargetUrl: null,
    activeCoordinatorToken: null,
    updatedAt: Date.now(),
    panelMinimized: false,
    panelQueueVisible: false,
    previewPageUrl: null,
    panelPosition: { x: -1, y: -1 }, // -1 means default CSS position (top-right)
    config: createDefaultConfig(url),
    errors: [],
  };
}

export async function getStoredSession(): Promise<HarvestSession | null> {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEY_SESSION]);
    return (data[STORAGE_KEY_SESSION] as HarvestSession) || null;
  } catch (err) {
    console.error('[DocuHarvest] Error reading storage session:', err);
    return null;
  }
}

export async function getOrCreateSession(currentUrl: string, currentTitle: string): Promise<HarvestSession> {
  const existing = await getStoredSession();
  if (existing) {
    // Return existing session so navigation never resets progress
    return existing;
  }
  const initial = createInitialSession(currentUrl, currentTitle);
  await saveSession(initial);
  return initial;
}

export async function saveSession(session: HarvestSession): Promise<void> {
  try {
    const toSave: HarvestSession = {
      ...session,
      updatedAt: Date.now(),
    };
    await chrome.storage.local.set({ [STORAGE_KEY_SESSION]: toSave });
  } catch (err) {
    console.error('[DocuHarvest] Error saving session to storage:', err);
  }
}

export async function updateSessionPartial(patch: Partial<HarvestSession>): Promise<HarvestSession> {
  const current = (await getStoredSession()) || createInitialSession();
  const updated: HarvestSession = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  };
  await chrome.storage.local.set({ [STORAGE_KEY_SESSION]: updated });
  return updated;
}

export async function resetStoredSession(currentUrl: string, currentTitle: string): Promise<HarvestSession> {
  const fresh = createInitialSession(currentUrl, currentTitle);
  // Preserve panel position and minimized preference across reset
  const existing = await getStoredSession();
  if (existing) {
    fresh.panelPosition = existing.panelPosition;
    fresh.panelMinimized = existing.panelMinimized;
    fresh.panelQueueVisible = existing.panelQueueVisible;
  }
  await saveSession(fresh);
  return fresh;
}

export function computeSessionStats(session: HarvestSession): SessionStats {
  const discovered = Object.keys(session.discoveredPages).length;
  const collected = Object.keys(session.collectedPages).length;
  const remaining = session.queue.length;

  let failed = 0;
  let skipped = 0;
  for (const page of Object.values(session.discoveredPages)) {
    if (page.status === 'failed') failed++;
    if (page.status === 'skipped') skipped++;
  }

  let totalWords = 0;
  for (const page of Object.values(session.collectedPages)) {
    totalWords += page.wordCount || 0;
  }

  let progressPercentage = 0;
  if (discovered > 0) {
    progressPercentage = Math.min(100, Math.round(((collected + skipped) / discovered) * 100));
  }

  return {
    discovered,
    collected,
    remaining,
    failed,
    skipped,
    totalWords,
    progressPercentage,
  };
}

export function subscribeToSessionChanges(callback: (session: HarvestSession) => void): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
    if (areaName === 'local' && changes[STORAGE_KEY_SESSION]?.newValue) {
      callback(changes[STORAGE_KEY_SESSION].newValue as HarvestSession);
    }
  };

  chrome.storage.onChanged.addListener(listener);
  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}
