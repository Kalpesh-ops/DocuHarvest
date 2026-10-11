/**
 * DocuHarvest - Complete Collection Orchestrator
 * Single collection coordinator, SPA & multi-page navigation support,
 * bounded retries, per-page timeouts, and comprehensive state transitions.
 */

import { DiscoveredPage, HarvestSession } from '../types';
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
  private onStateChange?: (session: HarvestSession) => void;

  constructor(session: HarvestSession, onStateChange?: (session: HarvestSession) => void) {
    this.session = session;
    this.coordinatorToken = `coord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.onStateChange = onStateChange;
  }

  public getSession(): HarvestSession {
    return this.session;
  }

  public updateSessionLocal(session: HarvestSession): void {
    this.session = session;
    if (this.onStateChange) {
      this.onStateChange(this.session);
    }
  }

  /**
   * Initializes or resumes state on content script mount or SPA route change.
   */
  public async initOnPageLoad(): Promise<void> {
    const currentNormUrl = normalizeUrl(window.location.href);
    const pageTitle = (document.title || 'Documentation Page').split(/[-|–—]/)[0].trim();

    // Check if session in storage is currently running
    const stored = await getStoredSession();
    if (stored) {
      this.session = stored;
      this.session.currentUrl = currentNormUrl;
      this.session.currentPageName = pageTitle;

      if (this.session.status === 'running') {
        // Claim coordination token
        this.session.activeCoordinatorToken = this.coordinatorToken;
        await saveSession(this.session);

        this.emitUpdate('Page loaded. Settling rendered DOM & SPA hydration...');
        await new Promise(resolve => setTimeout(resolve, 600));
        await this.runCollectionLoop();
        return;
      }
    } else {
      // First time on this page
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

    this.emitUpdate('Discovering documentation pages from sidebar and navigation...');

    // Assign active coordinator token
    this.session.activeCoordinatorToken = this.coordinatorToken;

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

    this.session.status = 'running';
    this.session.startedAt = Date.now();
    this.session.completedAt = undefined;
    this.session.discoveredPages = discoveredMap;
    this.session.pagesOrder = pagesOrder;
    this.session.queue = queue;
    this.session.collectedPages = {};
    this.session.activeTargetUrl = normalizeUrl(window.location.href);

    const stats = computeSessionStats(this.session);
    this.session.progressPercentage = stats.progressPercentage;

    await this.saveAndNotify();
    await this.runCollectionLoop();
  }

  /**
   * Pauses the collection. Navigation and processing are halted.
   */
  public async pause(): Promise<void> {
    if (this.session.status !== 'running') return;

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

    this.session.status = 'running';
    this.session.activeCoordinatorToken = this.coordinatorToken;
    this.session.currentOperation = 'Resuming collection...';
    await this.saveAndNotify();

    await this.runCollectionLoop();
  }

  /**
   * Stops collection. Keeps all collected pages intact.
   */
  public async stop(): Promise<void> {
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
    const currentUrl = normalizeUrl(window.location.href);
    const title = (document.title || 'Documentation Page').split(/[-|–—]/)[0].trim();
    const fresh = createInitialSession(currentUrl, title);
    fresh.panelMinimized = this.session.panelMinimized;
    fresh.panelPosition = this.session.panelPosition;
    fresh.panelQueueVisible = this.session.panelQueueVisible;
    this.session = fresh;
    await saveSession(this.session);
    if (this.onStateChange) {
      this.onStateChange(this.session);
    }
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
  private async navigateToPage(targetUrl: string): Promise<'spa' | 'mpa'> {
    const targetNorm = normalizeUrl(targetUrl);
    const startHref = window.location.href;

    // 1. Try finding an existing in-DOM navigation anchor to trigger SPA routing
    const allLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
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
        const spaSwitched = await this.waitForUrlChange(startHref, 1500);
        if (spaSwitched) {
          return 'spa';
        }
      } catch {
        // continue to MPA fallback
      }
    }

    // 2. Fallback to standard window navigation
    window.location.href = targetUrl;
    return 'mpa';
  }

  private async waitForUrlChange(previousUrl: string, maxWaitMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (window.location.href !== previousUrl) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    return false;
  }

  /**
   * Main collection loop that sequentially processes pages,
   * handles both SPA and MPA navigations, and respects pause/stop.
   */
  public async runCollectionLoop(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.session.status === 'running') {
        const stored = await getStoredSession();
        if (stored?.status !== 'running') {
          break;
        }

        const currentNormUrl = normalizeUrl(window.location.href);

        // If the current page is in the queue or not yet collected:
        if (this.session.queue.includes(currentNormUrl) || !this.session.collectedPages[currentNormUrl]) {
          await this.processCurrentPageContent(currentNormUrl);
        }

        // Re-check running status
        if (this.session.status !== 'running') break;

        // If queue is empty, complete session
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
        const nextTarget = this.session.discoveredPages[nextUrl];
        const nextTitle = nextTarget ? nextTarget.title : nextUrl;

        this.session.activeTargetUrl = nextUrl;
        this.session.currentOperation = `Preparing navigation to "${nextTitle}"...`;
        await this.saveAndNotify();

        // Rate limit delay
        const delay = Math.max(800, this.session.config.rateLimitMs);
        await new Promise(resolve => setTimeout(resolve, delay));

        // Re-check running status after delay
        const checkSession = await getStoredSession();
        if (checkSession && checkSession.status !== 'running') {
          break;
        }

        // Navigate
        const navType = await this.navigateToPage(nextUrl);
        if (navType === 'mpa') {
          // Hard navigation reloads window; exit loop gracefully
          break;
        }

        // SPA navigation succeeded without reloading window: continue loop
        await new Promise(resolve => setTimeout(resolve, 600));
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
    try {
      if (this.session.discoveredPages[currentNormUrl]) {
        this.session.discoveredPages[currentNormUrl].status = 'in_progress';
        await this.saveAndNotify();
      }

      this.emitUpdate('Auto-scrolling, expanding accordions & extracting tabs...');

      const extractionPromise = extractCurrentPage(
        this.session.config.contentSelector,
        this.session.config.autoScroll,
        this.session.config.expandAccordions,
        this.session.config.captureTabs,
        this.session.config.safeTabSwitching,
        this.session.config.scrollVirtualizedContainers,
        this.session.config.maxVirtualScrollSteps,
        this.session.config.stabilizationTimeoutMs
      );

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Page extraction timed out after ${this.session.config.pageExtractionTimeoutMs}ms`)),
          this.session.config.pageExtractionTimeoutMs
        )
      );

      const collected = await Promise.race([extractionPromise, timeoutPromise]);

      this.session.collectedPages[currentNormUrl] = collected;

      if (this.session.discoveredPages[currentNormUrl]) {
        this.session.discoveredPages[currentNormUrl].status = 'completed';
        this.session.discoveredPages[currentNormUrl].collectedAt = Date.now();
        this.session.discoveredPages[currentNormUrl].wordCount = collected.wordCount;
        this.session.discoveredPages[currentNormUrl].warning = collected.warnings?.[0];
      }

      this.session.queue = this.session.queue.filter(url => url !== currentNormUrl);

      const stats = computeSessionStats(this.session);
      this.session.progressPercentage = stats.progressPercentage;
      this.session.currentOperation = `Collected "${collected.title}" (${collected.wordCount} words).`;

      await this.saveAndNotify();
    } catch (err: any) {
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
    await saveSession(this.session);
    if (this.onStateChange) {
      this.onStateChange(this.session);
    }
  }
}
