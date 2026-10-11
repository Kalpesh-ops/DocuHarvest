/**
 * DocuHarvest - Complete Collection Orchestrator
 * Single authoritative collection coordinator, SPA & multi-page navigation support,
 * race-safe coordinator verification, bounded retries, loop prevention, and prompt interruption on pause/stop.
 */

import { DiscoveredPage, HarvestSession, CollectedPage } from '../types';
import {
  computeSessionStats,
  normalizeUrl,
  saveSession,
  getStoredSession,
  createInitialSession,
} from '../storage/storage';
import { discoverPages } from '../discovery/page-discovery';
import { extractCurrentPage } from '../extractor/dom-extractor';

export class CollectionOrchestrator {
  private session: HarvestSession;
  private isProcessing: boolean = false;
  private coordinatorToken: string;
  private abortController: AbortController | null = null;
  private navigationAttempts: Map<string, number> = new Map();
  private onStateChange?: (session: HarvestSession) => void;

  constructor(session: HarvestSession, onStateChange?: (session: HarvestSession) => void) {
    this.session = session;
    this.coordinatorToken = `coord_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.abortController = new AbortController();
    this.onStateChange = onStateChange;
  }

  public getSession(): HarvestSession {
    return this.session;
  }

  public getCoordinatorToken(): string {
    return this.coordinatorToken;
  }

  public updateSessionLocal(session: HarvestSession): void {
    this.session = session;
    if (this.onStateChange) {
      this.onStateChange(this.session);
    }
  }

  /**
   * Verifies that this orchestrator instance remains the sole authoritative coordinator.
   */
  public async isCoordinatorAuthoritative(): Promise<boolean> {
    try {
      const stored = await getStoredSession();
      if (!stored) return false;
      if (stored.status !== 'running') return false;
      return stored.activeCoordinatorToken === this.coordinatorToken;
    } catch {
      return false;
    }
  }

  /**
   * Sleep helper that immediately resolves if pause/stop aborts the operation.
   */
  private sleepAbortable(ms: number): Promise<boolean> {
    return new Promise(resolve => {
      if (this.abortController?.signal.aborted) {
        return resolve(false);
      }
      const timer = setTimeout(() => resolve(true), ms);
      this.abortController?.signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve(false);
        },
        { once: true }
      );
    });
  }

  /**
   * Initializes or resumes state on content script mount or SPA route change.
   */
  public async initOnPageLoad(): Promise<void> {
    const currentNormUrl = normalizeUrl(window.location.href);
    const pageTitle = (document.title || 'Documentation Page').split(/[-|–—]/)[0].trim();

    const stored = await getStoredSession();
    if (stored) {
      this.session = stored;
      this.session.currentUrl = currentNormUrl;
      this.session.currentPageName = pageTitle;

      if (this.session.status === 'running') {
        // Claim authoritative coordination token
        this.session.activeCoordinatorToken = this.coordinatorToken;
        this.abortController = new AbortController();
        await this.saveAndNotify();

        this.emitUpdate('Page loaded. Settling rendered DOM & SPA hydration...');
        const proceeded = await this.sleepAbortable(500);
        if (!proceeded || !(await this.isCoordinatorAuthoritative())) {
          return;
        }

        await this.runCollectionLoop();
        return;
      }
    } else {
      this.session.currentUrl = currentNormUrl;
      this.session.currentPageName = pageTitle;
      await this.saveAndNotify();
    }
  }

  /**
   * Starts a new collection or restarts from current page.
   */
  public async start(): Promise<void> {
    if (this.session.status === 'running') return;

    if (this.session.status === 'paused') {
      return this.resume();
    }

    this.abortController = new AbortController();
    this.session.activeCoordinatorToken = this.coordinatorToken;
    this.session.status = 'running';
    this.session.startedAt = Date.now();
    this.session.completedAt = undefined;
    this.session.activeTargetUrl = normalizeUrl(window.location.href);
    this.emitUpdate('Discovering documentation pages from sidebar and navigation...');

    // Discover pages from sidebar
    const discovered = await discoverPages(this.session.config);
    const discoveredMap: Record<string, DiscoveredPage> = {};
    const pagesOrder: string[] = [];
    const queue: string[] = [];

    for (const page of discovered) {
      discoveredMap[page.url] = page;
      pagesOrder.push(page.url);
      queue.push(page.url);
    }

    this.session.discoveredPages = discoveredMap;
    this.session.pagesOrder = pagesOrder;
    this.session.queue = queue;
    this.session.collectedPages = {};
    this.navigationAttempts.clear();

    const stats = computeSessionStats(this.session);
    this.session.progressPercentage = stats.progressPercentage;

    await this.saveAndNotify();
    await this.runCollectionLoop();
  }

  /**
   * Pauses the collection. Halted immediately across any asynchronous delays.
   */
  public async pause(): Promise<void> {
    if (this.session.status !== 'running') return;

    this.abortController?.abort();
    this.session.status = 'paused';
    this.session.activeCoordinatorToken = null;
    this.session.currentOperation = 'Collection paused by user.';
    await this.saveAndNotify();
  }

  /**
   * Resumes collection from paused state.
   */
  public async resume(): Promise<void> {
    if (this.session.status !== 'paused' && this.session.status !== 'stopped') return;

    this.abortController = new AbortController();
    this.session.status = 'running';
    this.session.activeCoordinatorToken = this.coordinatorToken;
    this.session.currentOperation = 'Resuming collection...';
    await this.saveAndNotify();

    await this.runCollectionLoop();
  }

  /**
   * Stops collection. Retains all collected data intact.
   */
  public async stop(): Promise<void> {
    this.abortController?.abort();
    this.session.status = 'stopped';
    this.session.activeCoordinatorToken = null;
    this.session.currentOperation = 'Collection stopped. Progress preserved.';
    this.session.activeTargetUrl = null;
    await this.saveAndNotify();
  }

  /**
   * Resets session to clean idle state.
   */
  public async reset(): Promise<void> {
    this.abortController?.abort();
    const currentUrl = normalizeUrl(window.location.href);
    const title = (document.title || 'Documentation Page').split(/[-|–—]/)[0].trim();
    const fresh = createInitialSession(currentUrl, title);
    fresh.panelMinimized = this.session.panelMinimized;
    fresh.panelPosition = this.session.panelPosition;
    fresh.panelQueueVisible = this.session.panelQueueVisible;
    this.session = fresh;
    this.navigationAttempts.clear();
    await this.saveAndNotify();
  }

  /**
   * Skips an individual page in the queue.
   */
  public async skipPage(url: string): Promise<void> {
    const page = this.session.discoveredPages[url];
    if (page) {
      page.status = 'skipped';
      page.skippedReason = 'Skipped by user';
    }
    this.session.queue = this.session.queue.filter(u => u !== url);
    const stats = computeSessionStats(this.session);
    this.session.progressPercentage = stats.progressPercentage;
    await this.saveAndNotify();
  }

  /**
   * Retries an individual page.
   */
  public async retryPage(url: string): Promise<void> {
    const page = this.session.discoveredPages[url];
    if (page) {
      page.status = 'pending';
      page.error = undefined;
      page.retryCount = 0;
      this.navigationAttempts.delete(url);
      if (!this.session.queue.includes(url)) {
        this.session.queue.unshift(url);
      }
    }
    await this.saveAndNotify();
    if (this.session.status === 'idle' || this.session.status === 'paused') {
      await this.resume();
    }
  }

  /**
   * Navigates to target page using client-side SPA routing if available,
   * falling back to full window navigation.
   */
  private async navigateToPage(targetUrl: string): Promise<'spa' | 'mpa' | 'noop'> {
    const targetNorm = normalizeUrl(targetUrl);
    const currentNorm = normalizeUrl(window.location.href);

    if (targetNorm === currentNorm) {
      return 'noop';
    }

    const startHref = window.location.href;

    // 1. Try finding an existing in-DOM navigation anchor to trigger SPA routing
    const allLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
      .filter(a => !a.closest('#docuharvest-root'));

    let matchedAnchor: HTMLAnchorElement | null = null;
    for (const a of allLinks) {
      try {
        const fullHref = new URL(a.getAttribute('href') || '', window.location.origin).toString();
        if (normalizeUrl(fullHref) === targetNorm) {
          matchedAnchor = a;
          break;
        }
      } catch {
        // continue
      }
    }

    if (matchedAnchor) {
      try {
        matchedAnchor.click();
        const spaSwitched = await this.waitForUrlChange(startHref, 1200);
        if (spaSwitched) {
          return 'spa';
        }
      } catch {
        // fallback to MPA
      }
    }

    // 2. Fallback to standard window navigation
    window.location.href = targetUrl;
    return 'mpa';
  }

  private async waitForUrlChange(previousUrl: string, maxWaitMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (this.abortController?.signal.aborted) {
        return false;
      }
      if (window.location.href !== previousUrl) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 60));
    }
    return false;
  }

  /**
   * Main collection loop that sequentially processes pages,
   * verifies authoritative coordinator token before every step,
   * prevents repeated-navigation loops, and respects pause/stop.
   */
  public async runCollectionLoop(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.session.status === 'running') {
        if (!(await this.isCoordinatorAuthoritative())) {
          break;
        }

        const currentNormUrl = normalizeUrl(window.location.href);

        // Process current page content if in queue or not yet collected
        const isCurrentCollected = !!this.session.collectedPages[currentNormUrl];
        if (this.session.queue.includes(currentNormUrl) || !isCurrentCollected) {
          await this.processCurrentPageContent(currentNormUrl);
        }

        if (!(await this.isCoordinatorAuthoritative())) {
          break;
        }

        // Check if queue is completed
        if (this.session.queue.length === 0) {
          const stats = computeSessionStats(this.session);
          this.session.status = 'completed';
          this.session.completedAt = Date.now();
          this.session.activeTargetUrl = null;
          this.session.activeCoordinatorToken = null;
          this.session.currentOperation = `Collection completed! ${stats.collected} pages collected, ~${stats.totalWords} words compiled.`;
          this.session.progressPercentage = 100;
          await this.saveAndNotify();
          break;
        }

        // Pick next URL
        const nextUrl = this.session.queue[0];

        // Never re-collect already collected pages
        if (this.session.collectedPages[nextUrl]) {
          const isComp = this.session.collectedPages[nextUrl].isComplete;
          this.session.queue = this.session.queue.filter(u => u !== nextUrl);
          if (this.session.discoveredPages[nextUrl]) {
            this.session.discoveredPages[nextUrl].status = isComp ? 'completed' : 'partial';
          }
          await this.saveAndNotify();
          continue;
        }

        const nextTarget = this.session.discoveredPages[nextUrl];
        const nextTitle = nextTarget ? nextTarget.title : nextUrl;

        // Loop detection: Track navigation attempts to nextUrl
        const attempts = (this.navigationAttempts.get(nextUrl) || 0) + 1;
        this.navigationAttempts.set(nextUrl, attempts);

        if (attempts > 2) {
          console.warn(`[DocuHarvest] Repeated navigation failure for "${nextUrl}". Dropping to avoid infinite loop.`);
          if (nextTarget) {
            nextTarget.status = 'failed';
            nextTarget.error = 'Navigation failed: target URL could not be opened';
          }
          this.session.queue = this.session.queue.filter(u => u !== nextUrl);
          this.session.errors.push({
            url: nextUrl,
            message: 'Navigation transition failed after 2 attempts',
            timestamp: Date.now(),
            retryable: false,
          });
          await this.saveAndNotify();
          continue;
        }

        this.session.activeTargetUrl = nextUrl;
        this.session.currentOperation = `Preparing navigation to "${nextTitle}"...`;
        await this.saveAndNotify();

        // Rate limit delay (abortable)
        const delay = Math.max(600, this.session.config.rateLimitMs);
        const proceeded = await this.sleepAbortable(delay);
        if (!proceeded || !(await this.isCoordinatorAuthoritative())) {
          break;
        }

        // Navigate to next URL
        const navType = await this.navigateToPage(nextUrl);
        if (navType === 'mpa') {
          // Hard navigation triggers page reload: exit loop gracefully
          break;
        }

        // If SPA navigation was successful or already on the page
        const settled = await this.sleepAbortable(500);
        if (!settled || !(await this.isCoordinatorAuthoritative())) {
          break;
        }

        this.session.currentUrl = normalizeUrl(window.location.href);
        this.session.currentPageName = (document.title || 'Documentation Page').split(/[-|–—]/)[0].trim();
        await this.saveAndNotify();
      }
    } catch (err: any) {
      console.error('[DocuHarvest] Error in collection loop:', err);
      this.session.status = 'error';
      this.session.lastError = err?.message || 'Unexpected collection error';
      this.session.currentOperation = `Error: ${this.session.lastError}`;
      await this.saveAndNotify();
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Extracts content from current page and updates queue state.
   */
  private async processCurrentPageContent(currentNormUrl: string): Promise<void> {
    if (!(await this.isCoordinatorAuthoritative())) return;

    try {
      if (this.session.discoveredPages[currentNormUrl]) {
        this.session.discoveredPages[currentNormUrl].status = 'in_progress';
        await this.saveAndNotify();
      }

      this.emitUpdate('Auto-scrolling, expanding accordions & extracting tabs...');

      const extractionAbortController = new AbortController();
      const onGlobalAbort = () => extractionAbortController.abort();
      this.abortController?.signal.addEventListener('abort', onGlobalAbort, { once: true });

      let timeoutId: any;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          extractionAbortController.abort();
          reject(new Error(`Page extraction timed out after ${this.session.config.pageExtractionTimeoutMs}ms`));
        }, this.session.config.pageExtractionTimeoutMs);
      });

      const extractionPromise = extractCurrentPage(
        this.session.config.contentSelector,
        this.session.config.autoScroll,
        this.session.config.expandAccordions,
        this.session.config.captureTabs,
        this.session.config.safeTabSwitching,
        this.session.config.scrollVirtualizedContainers,
        this.session.config.maxVirtualScrollSteps,
        this.session.config.stabilizationTimeoutMs,
        extractionAbortController.signal
      );

      let collected: CollectedPage;
      try {
        collected = await Promise.race([extractionPromise, timeoutPromise]);
      } finally {
        clearTimeout(timeoutId);
        this.abortController?.signal.removeEventListener('abort', onGlobalAbort);
      }

      // Verify coordinator authority before committing extraction
      if (!(await this.isCoordinatorAuthoritative())) return;

      this.session.collectedPages[currentNormUrl] = collected;

      if (this.session.discoveredPages[currentNormUrl]) {
        this.session.discoveredPages[currentNormUrl].status = collected.isComplete ? 'completed' : 'partial';
        this.session.discoveredPages[currentNormUrl].collectedAt = Date.now();
        this.session.discoveredPages[currentNormUrl].wordCount = collected.wordCount;
        this.session.discoveredPages[currentNormUrl].warning = collected.warnings?.[0];
      }

      this.session.queue = this.session.queue.filter(url => url !== currentNormUrl);

      const stats = computeSessionStats(this.session);
      this.session.progressPercentage = stats.progressPercentage;
      const completenessLabel = collected.isComplete ? 'Collected' : 'Partially collected';
      this.session.currentOperation = `${completenessLabel} "${collected.title}" (${collected.wordCount} words).`;

      await this.saveAndNotify();
    } catch (err: any) {
      if (this.abortController?.signal.aborted || err?.name === 'AbortError') {
        const page = this.session.discoveredPages[currentNormUrl];
        if (page && page.status === 'in_progress') {
          page.status = 'pending';
        }
        await this.saveAndNotify();
        return;
      }

      console.error('[DocuHarvest] Error extracting page:', err);
      const page = this.session.discoveredPages[currentNormUrl];
      const errorMsg = err?.message || 'Extraction failed';

      if (page) {
        page.retryCount = (page.retryCount || 0) + 1;
        if (page.retryCount <= this.session.config.maxRetries) {
          page.status = 'pending';
          page.warning = `Retry ${page.retryCount}/${this.session.config.maxRetries}: ${errorMsg}`;
          this.session.currentOperation = `Warning: ${page.warning}. Re-queuing page...`;
        } else {
          page.status = 'failed';
          page.error = errorMsg;
          this.session.queue = this.session.queue.filter(u => u !== currentNormUrl);
          this.session.currentOperation = `Page failed: ${errorMsg}. Continuing queue...`;
        }
      }

      this.session.errors.push({
        url: currentNormUrl,
        message: errorMsg,
        timestamp: Date.now(),
        retryable: (page?.retryCount || 0) <= this.session.config.maxRetries,
      });

      await this.saveAndNotify();
    }
  }

  private emitUpdate(operation: string): void {
    this.session.currentOperation = operation;
    if (this.onStateChange) {
      this.onStateChange(this.session);
    }
  }

  private async saveAndNotify(): Promise<void> {
    try {
      await saveSession(this.session);
    } catch (err: any) {
      this.session.lastError = err?.message || 'Failed to persist session to storage';
      this.session.currentOperation = `Storage Error: ${this.session.lastError}`;
    }
    if (this.onStateChange) {
      this.onStateChange(this.session);
    }
  }
}
