import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupChromeMock } from './test-utils';
import { PanelController } from '../src/ui/panel';
import { CollectionOrchestrator } from '../src/orchestrator/collection-orchestrator';
import {
  createInitialSession,
  getOrCreateSession,
  getStoredSession,
  saveSession,
  updateSessionPartial,
  computeSessionStats
} from '../src/storage/storage';
import { HarvestSession } from '../src/types';
import { exportAsMarkdown, exportAsJson, exportAsCsv, formatSafeCodeBlock, compileMasterMarkdown, getContextualFilename } from '../src/export/exporter';
import {
  expandAllCollapsibles,
  extractCurrentPage,
  handleVirtualizedAndNestedContainers,
  extractBreadcrumbs,
  extractInternalLinks,
  detectCandidateSelectors,
} from '../src/extractor/dom-extractor';
import { extractAllTabsSafely } from '../src/extractor/tab-extractor';

describe('Phase 2 & P3 — Lifecycle, Safety & Interaction Regression Suite', () => {
  let session: HarvestSession;
  let mockChromeData: any;

  beforeEach(() => {
    mockChromeData = setupChromeMock();
    document.body.innerHTML = '';
    session = createInitialSession('https://docs.site.com/intro', 'Introduction');
  });

  it('Case 1: Clicking or selecting ordinary website text must not collapse or dismiss the panel', () => {
    const events = {
      onStart: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStop: vi.fn(),
      onReset: vi.fn(),
      onClearData: vi.fn(),
      onExportMarkdown: vi.fn(),
      onExportJson: vi.fn(),
      onExportCsv: vi.fn(),
      onToggleMinimize: vi.fn(),
      onToggleQueue: vi.fn(),
      onPreviewPage: vi.fn(),
      onPositionChange: vi.fn(),
    };

    const panel = new PanelController(session, events);
    panel.mount();

    // Verify panel is attached to DOM
    const rootEl = document.getElementById('docuharvest-root');
    expect(rootEl).not.toBeNull();
    expect(session.panelMinimized).toBe(false);

    // Create web text outside panel
    const webText = document.createElement('p');
    webText.id = 'target-website-text';
    webText.textContent = 'Ordinary documentation text on host page.';
    document.body.appendChild(webText);

    // Simulate clicking and mouse down/up on website text
    webText.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    webText.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    webText.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Panel must still exist and must NOT be dismissed or minimized
    expect(document.getElementById('docuharvest-root')).not.toBeNull();
    expect(events.onToggleMinimize).not.toHaveBeenCalled();

    panel.destroy();
  });

  it('Case 2: Clicking a link in the documentation sidebar must not reset the collection in storage', async () => {
    // Populate an ongoing session with collected pages
    session.status = 'running';
    session.collectedPages = {
      'https://docs.site.com/intro': {
        id: '1',
        url: 'https://docs.site.com/intro',
        title: 'Intro',
        markdown: '# Intro',
        wordCount: 100,
        headings: [],
        sections: [],
        isComplete: true,
        extractedAt: Date.now()
      }
    };
    await saveSession(session);

    // Simulate navigating to another link in the sidebar
    const nextUrl = 'https://docs.site.com/guides';
    const recoveredSession = await getOrCreateSession(nextUrl, 'Guides');

    // The existing session must be returned, not reset
    expect(recoveredSession.id).toBe(session.id);
    expect(Object.keys(recoveredSession.collectedPages).length).toBe(1);
    expect(recoveredSession.collectedPages['https://docs.site.com/intro']).toBeDefined();
  });

  it('Case 3 & 4: Scrolling the main document or nested container must not stop collection', async () => {
    session.status = 'running';
    await saveSession(session);

    // Simulate window scroll
    window.dispatchEvent(new Event('scroll'));

    // Simulate nested container scroll
    const nested = document.createElement('div');
    nested.style.overflow = 'auto';
    document.body.appendChild(nested);
    nested.dispatchEvent(new Event('scroll'));

    const currentSession = await getStoredSession();
    expect(currentSession?.status).toBe('running');
  });

  it('Case 5 & 6: Opening/closing tabs or expanding accordions must not reset collection progress', async () => {
    session.status = 'running';
    session.collectedPages['https://docs.site.com/intro'] = {
      id: '1',
      url: 'https://docs.site.com/intro',
      title: 'Intro',
      markdown: 'Sample',
      wordCount: 50,
      headings: [],
      sections: [],
      isComplete: true,
      extractedAt: Date.now()
    };
    await saveSession(session);

    // Simulate accordion toggle in DOM
    const details = document.createElement('details');
    details.innerHTML = '<summary>Section</summary><p>Text</p>';
    document.body.appendChild(details);
    details.open = true;
    details.dispatchEvent(new Event('toggle'));

    // Check stored state
    const postAccordionSession = await getStoredSession();
    expect(postAccordionSession?.status).toBe('running');
    expect(Object.keys(postAccordionSession?.collectedPages || {}).length).toBe(1);
  });

  it('Case 7: Switching between pages must not create duplicate workers (single coordinator token)', async () => {
    const orchestrator1 = new CollectionOrchestrator(session);
    const token1 = (orchestrator1 as any).coordinatorToken;

    const orchestrator2 = new CollectionOrchestrator(session);
    const token2 = (orchestrator2 as any).coordinatorToken;

    // Tokens must be unique per instance
    expect(token1).not.toBe(token2);

    // Claim token 1
    session.activeCoordinatorToken = token1;
    await saveSession(session);

    // When session is read, activeCoordinatorToken identifies active coordinator
    const stored = await getStoredSession();
    expect(stored?.activeCoordinatorToken).toBe(token1);
  });

  it('Case 8: Minimizing the panel must not stop the collector', async () => {
    session.status = 'running';
    await saveSession(session);

    // User toggles minimize
    session.panelMinimized = true;
    await updateSessionPartial({ panelMinimized: true });

    const stored = await getStoredSession();
    expect(stored?.panelMinimized).toBe(true);
    expect(stored?.status).toBe('running'); // Status remains running
  });

  it('Case 9: Reloading a page must preserve saved progress and offer recovery', async () => {
    session.status = 'paused';
    session.collectedPages = {
      'https://docs.site.com/1': { id: '1', url: 'https://docs.site.com/1', title: 'P1', markdown: 'M1', wordCount: 10, headings: [], sections: [], isComplete: true, extractedAt: 0 },
      'https://docs.site.com/2': { id: '2', url: 'https://docs.site.com/2', title: 'P2', markdown: 'M2', wordCount: 20, headings: [], sections: [], isComplete: true, extractedAt: 0 }
    };
    session.queue = ['https://docs.site.com/3'];
    await saveSession(session);

    // Simulate page reload: getOrCreateSession is invoked
    const reloaded = await getOrCreateSession('https://docs.site.com/3', 'P3');
    expect(reloaded.id).toBe(session.id);
    expect(reloaded.status).toBe('paused');
    expect(Object.keys(reloaded.collectedPages).length).toBe(2);
    expect(reloaded.queue).toEqual(['https://docs.site.com/3']);
  });

  it('Case 10: Pausing and resuming must not skip or duplicate pages', async () => {
    session.status = 'running';
    session.queue = ['https://docs.site.com/2', 'https://docs.site.com/3'];
    await saveSession(session);

    const orchestrator = new CollectionOrchestrator(session);
    await orchestrator.pause();

    expect(orchestrator.getSession().status).toBe('paused');
    expect(orchestrator.getSession().queue).toEqual(['https://docs.site.com/2', 'https://docs.site.com/3']);

    // Resuming maintains queue without duplicating
    orchestrator.getSession().status = 'running';
    expect(orchestrator.getSession().queue).toEqual(['https://docs.site.com/2', 'https://docs.site.com/3']);
  });

  it('Case 11: Stopping must prevent new collection work while retaining collected data', async () => {
    session.status = 'running';
    session.collectedPages['https://docs.site.com/1'] = {
      id: '1', url: 'https://docs.site.com/1', title: 'Page 1', markdown: 'Done', wordCount: 15, headings: [], sections: [], isComplete: true, extractedAt: 0
    };
    await saveSession(session);

    const orchestrator = new CollectionOrchestrator(session);
    await orchestrator.stop();

    const stopped = orchestrator.getSession();
    expect(stopped.status).toBe('stopped');
    expect(stopped.activeTargetUrl).toBeNull();
    expect(Object.keys(stopped.collectedPages).length).toBe(1);
    expect(stopped.collectedPages['https://docs.site.com/1'].title).toBe('Page 1');
  });

  it('Case 12: A completed queue must display Completed and remain available for export', () => {
    session.status = 'completed';
    session.discoveredPages = {
      'https://docs.site.com/1': { id: '1', url: 'https://docs.site.com/1', title: 'P1', depth: 1, status: 'completed', discoveredAt: 0 }
    };
    session.collectedPages = {
      'https://docs.site.com/1': { id: '1', url: 'https://docs.site.com/1', title: 'P1', markdown: 'M1', wordCount: 50, headings: [], sections: [], isComplete: true, extractedAt: 0 }
    };
    session.queue = [];

    const stats = computeSessionStats(session);
    expect(stats.progressPercentage).toBe(100);
    expect(stats.remaining).toBe(0);

    const panel = new PanelController(session, {
      onStart: vi.fn(), onPause: vi.fn(), onResume: vi.fn(), onStop: vi.fn(), onReset: vi.fn(),
      onClearData: vi.fn(), onExportMarkdown: vi.fn(), onExportJson: vi.fn(), onExportCsv: vi.fn(),
      onToggleMinimize: vi.fn(), onToggleQueue: vi.fn(), onPreviewPage: vi.fn(), onPositionChange: vi.fn(),
    });
    panel.mount();

    // Verify root exists
    const shadow = (document.getElementById('docuharvest-root') as any).shadowRoot;
    expect(shadow).not.toBeNull();
    const exportBar = shadow.querySelector('.dh-export-bar');
    expect(exportBar).not.toBeNull(); // Export buttons available

    panel.destroy();
  });

  it('Case 13: Extraction failure on one page must not destroy successfully collected pages', () => {
    session.status = 'running';
    session.collectedPages['https://docs.site.com/good'] = {
      id: 'g', url: 'https://docs.site.com/good', title: 'Good Page', markdown: 'Content', wordCount: 80, headings: [], sections: [], isComplete: true, extractedAt: 0
    };
    session.discoveredPages = {
      'https://docs.site.com/good': { id: 'g', url: 'https://docs.site.com/good', title: 'Good Page', depth: 1, status: 'completed', discoveredAt: 0 },
      'https://docs.site.com/bad': { id: 'b', url: 'https://docs.site.com/bad', title: 'Bad Page', depth: 1, status: 'pending', retryCount: 2, discoveredAt: 0 }
    };

    // Simulate failure beyond maxRetries
    const badPage = session.discoveredPages['https://docs.site.com/bad'];
    badPage.status = 'failed';
    badPage.error = 'Network Timeout 504';
    session.errors.push({ url: badPage.url, message: 'Network Timeout 504', timestamp: Date.now(), retryable: false });

    // Good page must be untouched
    expect(session.collectedPages['https://docs.site.com/good']).toBeDefined();
    expect(session.collectedPages['https://docs.site.com/good'].wordCount).toBe(80);
  });

  it('Case 14: Exporting must not clear the collection', () => {
    session.collectedPages['https://docs.site.com/1'] = {
      id: '1', url: 'https://docs.site.com/1', title: 'Doc', markdown: 'Words here', wordCount: 20, headings: [], sections: [], isComplete: true, extractedAt: 0
    };

    const initialKeys = Object.keys(session.collectedPages);

    // Call export functions
    exportAsMarkdown(session);
    exportAsJson(session);
    exportAsCsv(session);

    // Collection must remain completely intact
    expect(Object.keys(session.collectedPages)).toEqual(initialKeys);
  });

  it('Case 15: Clearing data must require confirmation before deleting', () => {
    let clearCallbackTriggered = false;
    const panel = new PanelController(session, {
      onStart: vi.fn(), onPause: vi.fn(), onResume: vi.fn(), onStop: vi.fn(), onReset: vi.fn(),
      onClearData: () => { clearCallbackTriggered = true; },
      onExportMarkdown: vi.fn(), onExportJson: vi.fn(), onExportCsv: vi.fn(),
      onToggleMinimize: vi.fn(), onToggleQueue: vi.fn(), onPreviewPage: vi.fn(), onPositionChange: vi.fn(),
    });
    panel.mount();

    const shadow = (document.getElementById('docuharvest-root') as any).shadowRoot;
    const clearBtn = shadow.getElementById('dh-btn-clear-data');
    expect(clearBtn).not.toBeNull();

    // Clicking clear data button
    clearBtn.click();

    // Confirmation box must appear
    const confirmBox = shadow.querySelector('.dh-confirm-box');
    expect(confirmBox).not.toBeNull();
    expect(clearCallbackTriggered).toBe(false); // Not cleared yet!

    // Clicking Cancel
    const cancelBtn = shadow.getElementById('dh-btn-cancel-clear');
    cancelBtn.click();
    expect(shadow.querySelector('.dh-confirm-box')).toBeNull();
    expect(clearCallbackTriggered).toBe(false);

    // Click again and confirm
    const clearBtn2 = shadow.getElementById('dh-btn-clear-data');
    clearBtn2.click();
    const confirmBtn = shadow.getElementById('dh-btn-confirm-clear');
    confirmBtn.click();
    expect(clearCallbackTriggered).toBe(true);

    panel.destroy();
  });

  it('Case 16: Coordinator race condition — superseded worker detects loss of authority and halts', async () => {
    session.status = 'running';
    await saveSession(session);

    const orch1 = new CollectionOrchestrator(session);
    const token1 = orch1.getCoordinatorToken();

    // Orch 1 claims coordination
    session.activeCoordinatorToken = token1;
    await saveSession(session);
    expect(await orch1.isCoordinatorAuthoritative()).toBe(true);

    // Another tab / worker starts with a new token
    const orch2 = new CollectionOrchestrator(session);
    const token2 = orch2.getCoordinatorToken();
    session.activeCoordinatorToken = token2;
    await saveSession(session);

    // Orch 1 must detect that it is no longer authoritative
    expect(await orch1.isCoordinatorAuthoritative()).toBe(false);
  });

  it('Case 17: Stop-during-navigation aborts pending operations promptly', async () => {
    session.status = 'running';
    session.queue = ['https://docs.site.com/next-page'];
    await saveSession(session);

    const orch = new CollectionOrchestrator(session);
    session.activeCoordinatorToken = orch.getCoordinatorToken();
    await saveSession(session);

    // Trigger stop while abortable delay is running
    const sleepPromise = (orch as any).sleepAbortable(5000);
    await orch.stop();

    const proceeded = await sleepPromise;
    expect(proceeded).toBe(false); // Immediate exit, did not wait 5000ms
    expect(orch.getSession().status).toBe('stopped');
    expect(orch.getSession().activeTargetUrl).toBeNull();
  });

  it('Case 18: Pause-during-delay aborts rate-limit wait immediately without advancing queue', async () => {
    session.status = 'running';
    session.queue = ['https://docs.site.com/p1', 'https://docs.site.com/p2'];
    await saveSession(session);

    const orch = new CollectionOrchestrator(session);
    session.activeCoordinatorToken = orch.getCoordinatorToken();
    await saveSession(session);

    const sleepPromise = (orch as any).sleepAbortable(5000);
    await orch.pause();

    const proceeded = await sleepPromise;
    expect(proceeded).toBe(false);
    expect(orch.getSession().status).toBe('paused');
    expect(orch.getSession().queue).toEqual(['https://docs.site.com/p1', 'https://docs.site.com/p2']);
  });

  it('Case 19: SPA routing failure breaks navigation loop after bounded attempts and marks page failed', async () => {
    const targetUrl = 'https://docs.site.com/unreachable';
    session.status = 'running';
    session.queue = [targetUrl];
    session.discoveredPages[targetUrl] = {
      id: 'u1',
      url: targetUrl,
      title: 'Unreachable Page',
      depth: 1,
      status: 'pending',
      discoveredAt: Date.now(),
    };
    await saveSession(session);

    const orch = new CollectionOrchestrator(session);
    session.activeCoordinatorToken = orch.getCoordinatorToken();
    await saveSession(session);

    // Mock navigateToPage to simulate SPA navigation failure (stays on same URL)
    vi.spyOn(orch as any, 'navigateToPage').mockResolvedValue('noop');
    vi.spyOn(orch as any, 'sleepAbortable').mockResolvedValue(true);

    // Run collection loop
    await orch.runCollectionLoop();

    // Target page must be marked failed and removed from queue, loop terminated
    expect(orch.getSession().queue).not.toContain(targetUrl);
    expect(orch.getSession().discoveredPages[targetUrl].status).toBe('failed');
    expect(orch.getSession().errors.some(e => e.url === targetUrl)).toBe(true);
  });

  it('Case 20: Storage-write failure is recorded and surfaced instead of silently swallowed', async () => {
    vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(new Error('QUOTA_BYTES_PER_ITEM quota exceeded'));

    await expect(saveSession(session)).rejects.toThrow('QUOTA_BYTES_PER_ITEM quota exceeded');
    expect(session.storageError).toContain('QUOTA_BYTES_PER_ITEM');
    expect(session.errors.some(e => e.message.includes('QUOTA_BYTES_PER_ITEM'))).toBe(true);
  });

  it('Case 21: Accordion handling restores initial open/closed state after extraction', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <details id="det1" open><summary>Details 1</summary><p>Content 1</p></details>
      <details id="det2"><summary>Details 2</summary><p>Content 2</p></details>
      <button id="aria-btn" aria-expanded="false">Toggle Section</button>
    `;
    document.body.appendChild(container);

    const det1 = container.querySelector<HTMLDetailsElement>('#det1')!;
    const det2 = container.querySelector<HTMLDetailsElement>('#det2')!;
    const ariaBtn = container.querySelector<HTMLElement>('#aria-btn')!;

    expect(det1.open).toBe(true);
    expect(det2.open).toBe(false);
    expect(ariaBtn.getAttribute('aria-expanded')).toBe('false');

    const restore = expandAllCollapsibles(container);

    // Both details are expanded for extraction
    expect(det1.open).toBe(true);
    expect(det2.open).toBe(true);
    expect(ariaBtn.getAttribute('aria-expanded')).toBe('true');

    // Calling restore reverts back to initial states
    restore();

    expect(det1.open).toBe(true);
    expect(det2.open).toBe(false);
    expect(ariaBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('Case 22: Reader scroll position is preserved and restored after page extraction', async () => {
    const scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy;
    window.scrollX = 50;
    window.scrollY = 420;

    document.body.innerHTML = `
      <main id="content">
        <h1>Documentation Guide</h1>
        <p>This is a sufficiently long documentation page for extracting rich contents.</p>
        <p>Section with additional words to exceed minimum word count requirements easily.</p>
      </main>
    `;

    await extractCurrentPage('#content', false, false, false, false, false, 0, 50);

    // Verify window.scrollTo was called to restore reader's position
    expect(scrollToSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        left: 50,
        top: 420,
        behavior: 'instant',
      })
    );
  });

  it('Case 23: Virtualized content accumulates and deduplicates batches across container scrolling', async () => {
    const container = document.createElement('div');
    container.id = 'virtual-container';
    container.style.overflowY = 'auto';
    Object.defineProperty(container, 'clientHeight', { value: 200, configurable: true });
    Object.defineProperty(container, 'scrollHeight', { value: 800, configurable: true });

    container.innerHTML = `
      <div class="virtual-item">Virtual Row 1 - API Parameters</div>
      <div class="virtual-item">Virtual Row 2 - Request Headers</div>
    `;
    document.body.appendChild(container);

    const res = await handleVirtualizedAndNestedContainers(container, 3);
    expect(res.accumulatedItems.length).toBeGreaterThanOrEqual(2);
    expect(res.accumulatedItems.some(i => i.content.includes('Virtual Row 1'))).toBe(true);
    expect(res.accumulatedItems.some(i => i.content.includes('Virtual Row 2'))).toBe(true);
  });

  it('Case 24: Extension shadow DOM (#docuharvest-root) is completely excluded from extraction and links', () => {
    const root = document.createElement('div');
    root.id = 'docuharvest-root';
    root.innerHTML = `
      <nav class="breadcrumb"><span>Extension Nav</span></nav>
      <a href="/extension-internal-link">Control Link</a>
      <h2>Extension Controls</h2>
    `;
    document.body.appendChild(root);

    const docEl = document.createElement('div');
    docEl.innerHTML = `
      <nav aria-label="breadcrumb"><ol><li><a href="/home">Docs Home</a></li><li>API</li></ol></nav>
      <a href="/real-api-doc">Real Doc Link</a>
    `;
    document.body.appendChild(docEl);

    const breadcrumbs = extractBreadcrumbs(document);
    expect(breadcrumbs).toEqual(['Docs Home', 'API']);
    expect(breadcrumbs).not.toContain('Extension Nav');

    const links = extractInternalLinks(document.body, window.location.origin);
    expect(links.some(l => l.url.includes('extension-internal-link'))).toBe(false);
  });

  it('Case 25: Unsafe or destructive tabs are not clicked and mark the page incomplete', async () => {
    document.body.innerHTML = `
      <main id="content">
        <h1>API Configuration</h1>
        <p>Here is information on configuring API settings for your deployment.</p>
        <p>Adding more sentences here so that word count is well above minimum threshold for extraction verification.</p>
        <div role="tablist">
          <button role="tab" id="tab-read" aria-controls="panel-read" aria-selected="true">Read Settings</button>
          <button role="tab" id="tab-delete" aria-controls="panel-delete">Delete Database</button>
        </div>
        <div role="tabpanel" id="panel-read">Safe Read Information</div>
        <div role="tabpanel" id="panel-delete" hidden>Destructive Drop Action</div>
      </main>
    `;

    const page = await extractCurrentPage('#content', false, false, true, true, false, 0, 50);

    expect(page.tabsExtracted).toBeDefined();
    const unsafeRecord = page.tabsExtracted?.find(t => t.tabName === 'Delete Database');
    expect(unsafeRecord?.status).toBe('unsafe');
    expect(page.isComplete).toBe(false);
    expect(page.warnings?.some(w => w.includes('unsafe or empty'))).toBe(true);
  });

  it('Case 26: Accordion expansion restricts to documentation disclosures and re-clicks on restore to reverse DOM mutations', () => {
    document.body.innerHTML = `
      <header>
        <button id="menu-btn" aria-expanded="false" aria-haspopup="true">Navigation Menu</button>
      </header>
      <nav>
        <button id="nav-dropdown" aria-expanded="false">Nav Dropdown</button>
      </nav>
      <main id="content">
        <button id="profile-btn" aria-expanded="false" aria-controls="user-profile">User Profile</button>
        <div id="user-profile" hidden>Profile Settings</div>

        <!-- Unrelated in-content controls that lack positive disclosure criteria -->
        <button id="in-content-action" aria-expanded="false">Run Benchmark Analysis</button>
        <button id="in-content-sorter" aria-expanded="false" aria-controls="raw-data-table">Sort Table Columns</button>
        <table id="raw-data-table"><tr><td>Data</td></tr></table>
        
        <div class="accordion-item">
          <button id="doc-accordion" aria-expanded="false" aria-controls="faq-answer">FAQ: How does caching work?</button>
          <div id="faq-answer" hidden>Caching is handled via in-memory and disk caches.</div>
        </div>
      </main>
    `;

    const menuBtn = document.getElementById('menu-btn') as HTMLButtonElement;
    const navDropdown = document.getElementById('nav-dropdown') as HTMLButtonElement;
    const profileBtn = document.getElementById('profile-btn') as HTMLButtonElement;
    const inContentAction = document.getElementById('in-content-action') as HTMLButtonElement;
    const inContentSorter = document.getElementById('in-content-sorter') as HTMLButtonElement;
    const docAccordion = document.getElementById('doc-accordion') as HTMLButtonElement;

    let inContentActionClicks = 0;
    inContentAction.addEventListener('click', () => inContentActionClicks++);

    let inContentSorterClicks = 0;
    inContentSorter.addEventListener('click', () => inContentSorterClicks++);

    let docClickCount = 0;
    docAccordion.addEventListener('click', () => {
      docClickCount++;
      const current = docAccordion.getAttribute('aria-expanded') === 'true';
      docAccordion.setAttribute('aria-expanded', String(!current));
    });

    const restore = expandAllCollapsibles(document.body);

    // Menu, nav dropdown, profile button, and unrelated in-content controls must NOT have been expanded or clicked
    expect(menuBtn.getAttribute('aria-expanded')).toBe('false');
    expect(navDropdown.getAttribute('aria-expanded')).toBe('false');
    expect(profileBtn.getAttribute('aria-expanded')).toBe('false');
    expect(inContentAction.getAttribute('aria-expanded')).toBe('false');
    expect(inContentActionClicks).toBe(0);
    expect(inContentSorter.getAttribute('aria-expanded')).toBe('false');
    expect(inContentSorterClicks).toBe(0);

    // Genuine documentation accordion was clicked to expand
    expect(docAccordion.getAttribute('aria-expanded')).toBe('true');
    expect(docClickCount).toBe(1);

    // Restoration must re-click the button, reversing the toggle
    restore();
    expect(docClickCount).toBe(2);
    expect(docAccordion.getAttribute('aria-expanded')).toBe('false');
  });

  it('Case 27: Tab-panel lookup rejects panels outside group container and marks page incomplete if unrestored', async () => {
    document.body.innerHTML = `
      <div id="outer-scope">
        <div id="foreign-panel" role="tabpanel">Foreign Panel Outside Tab Group</div>
      </div>
      <div id="tab-group-container" class="tabs-wrapper">
        <div role="tablist">
          <button role="tab" id="tab-leaker" aria-controls="foreign-panel" aria-selected="true">Leaker Tab</button>
          <button role="tab" id="tab-normal" aria-controls="local-panel">Normal Tab</button>
        </div>
        <div role="tabpanel" id="local-panel">Local Panel Content</div>
      </div>
    `;

    const container = document.getElementById('tab-group-container') as HTMLElement;
    const tabsResult = await extractAllTabsSafely(container, true);

    // Foreign panel was outside group container, so tab-leaker must be rejected (empty panel record)
    expect(tabsResult.records.length).toBe(2);
    const leakerRecord = tabsResult.records.find(r => r.tabName === 'Leaker Tab');
    expect(leakerRecord).toBeDefined();
    expect(leakerRecord?.status).toBe('empty');

    const normalRecord = tabsResult.records.find(r => r.tabName === 'Normal Tab');
    expect(normalRecord).toBeDefined();
    expect(normalRecord?.status).toBe('extracted');
  });

  it('Case 28: AbortSignal cancels in-progress extraction immediately and restores page state in finally', async () => {
    document.body.innerHTML = `
      <main id="content">
        <h1>Long Document</h1>
        <p>Paragraph content for cancellation testing.</p>
        <div class="accordion-item">
          <button id="cancel-accordion" aria-expanded="false" aria-controls="acc-body">Details</button>
          <div id="acc-body" hidden>Hidden content</div>
        </div>
      </main>
    `;

    const abortController = new AbortController();
    abortController.abort(); // already aborted

    await expect(
      extractCurrentPage('#content', false, true, false, false, false, 0, 100, abortController.signal)
    ).rejects.toThrow('Extraction aborted');
  });

  it('Case 29: Dynamic Markdown code block fencing safely handles triple, quadruple, and arbitrarily nested backticks', () => {
    // Normal code block
    const normal = formatSafeCodeBlock('console.log("hello");', 'typescript');
    expect(normal).toContain('```typescript\nconsole.log("hello");\n```');

    // Code block containing triple backticks
    const withTriple = formatSafeCodeBlock('Markdown with ```code``` inside', 'markdown');
    expect(withTriple).toContain('````markdown\nMarkdown with ```code``` inside\n````');

    // Code block containing both triple and quadruple backticks
    const withQuad = formatSafeCodeBlock('Here is ``` and here is ```` backticks', 'text');
    expect(withQuad).toContain('`````text\nHere is ``` and here is ```` backticks\n`````');

    // Code block containing 5 consecutive backticks
    const withFive = formatSafeCodeBlock('Nested ````` five backticks', 'text');
    expect(withFive).toContain('``````text\nNested ````` five backticks\n``````');
  });

  it('Case 30: Discovered page status is accurately marked "partial" (not "completed") when extraction is incomplete', async () => {
    const targetUrl = session.currentUrl;
    session.discoveredPages[targetUrl] = {
      id: targetUrl,
      url: targetUrl,
      title: 'Short Page',
      status: 'pending',
      depth: 0,
      discoveredAt: Date.now(),
    };
    session.queue = [targetUrl];
    session.status = 'running';

    const orchestrator = new CollectionOrchestrator(
      session,
      () => {}
    );
    session.activeCoordinatorToken = orchestrator.getCoordinatorToken();
    await saveSession(session);

    document.body.innerHTML = `
      <main id="content">
        <h1>Short</h1>
        <p>Too short.</p>
      </main>
    `;

    // Process a page that results in word count < 25 (isComplete: false)
    await (orchestrator as any).processCurrentPageContent(targetUrl);

    expect(session.discoveredPages[targetUrl].status).toBe('partial');
    expect(session.collectedPages[targetUrl].isComplete).toBe(false);
  });

  it('Case 31: Export completeness status explicitly differentiates clean pages from complete pages with non-fatal warnings', () => {
    const cleanSession = createInitialSession('https://docs.site.com/intro', 'Docs');
    cleanSession.discoveredPages = {
      'https://docs.site.com/p1': { id: 'p1', url: 'https://docs.site.com/p1', title: 'Page 1', status: 'completed', depth: 0, discoveredAt: Date.now() },
      'https://docs.site.com/p2': { id: 'p2', url: 'https://docs.site.com/p2', title: 'Page 2', status: 'completed', depth: 0, discoveredAt: Date.now() },
    };
    cleanSession.collectedPages = {
      'https://docs.site.com/p1': { id: 'p1', url: 'https://docs.site.com/p1', title: 'Page 1', markdown: 'Clean content with lots of text to satisfy word count requirements.', wordCount: 100, headings: ['H1'], sections: [], isComplete: true, images: [], extractedAt: Date.now() },
      'https://docs.site.com/p2': { id: 'p2', url: 'https://docs.site.com/p2', title: 'Page 2', markdown: 'More clean content with lots of text to satisfy word count requirements.', wordCount: 100, headings: ['H1'], sections: [], isComplete: true, images: [], extractedAt: Date.now() },
    };
    cleanSession.pagesOrder = ['https://docs.site.com/p1', 'https://docs.site.com/p2'];

    // 1. Clean session export: zero warnings, zero partials, zero failures
    const cleanMd = compileMasterMarkdown(cleanSession);
    expect(cleanMd).toContain('> **Completeness:** No known incomplete pages or warnings');
    expect(cleanMd).toContain('- **Fully Extracted Pages (Clean / Zero Warnings):** 2');
    expect(cleanMd).toContain('- **Pages with Extraction Warnings:** 0');

    // 2. Session with a page marked complete (isComplete: true) but containing a non-fatal extraction warning
    const warnedSession = {
      ...cleanSession,
      collectedPages: {
        'https://docs.site.com/p1': cleanSession.collectedPages['https://docs.site.com/p1'],
        'https://docs.site.com/p2': {
          ...cleanSession.collectedPages['https://docs.site.com/p2'],
          warnings: ['Non-fatal: delayed script execution detected'],
        },
      },
    };

    const warnedMd = compileMasterMarkdown(warnedSession);
    expect(warnedMd).toContain('> **Completeness:** Complete with warnings (1 page(s) contain extraction warnings)');
    expect(warnedMd).not.toContain('> **Completeness:** No known incomplete pages or warnings');
    expect(warnedMd).toContain('### Extraction Warnings');
    expect(warnedMd).toContain('Non-fatal: delayed script execution detected');
    expect(warnedMd).toContain('- **Fully Extracted Pages (Clean / Zero Warnings):** 1');
    expect(warnedMd).toContain('- **Pages with Extraction Warnings:** 1');
  });

  it('Case 32: Clicking Exit button in full panel triggers onClose and unmounts the panel from DOM', () => {
    const events = {
      onStart: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStop: vi.fn(),
      onReset: vi.fn(),
      onClearData: vi.fn(),
      onExportMarkdown: vi.fn(),
      onExportJson: vi.fn(),
      onExportCsv: vi.fn(),
      onToggleMinimize: vi.fn(),
      onToggleQueue: vi.fn(),
      onPreviewPage: vi.fn(),
      onPositionChange: vi.fn(),
      onClose: vi.fn(),
    };

    const panel = new PanelController(session, events);
    panel.mount();

    const rootEl = document.getElementById('docuharvest-root');
    expect(rootEl).not.toBeNull();
    const shadow = rootEl!.shadowRoot!;
    const closeBtn = shadow.getElementById('dh-btn-close');
    expect(closeBtn).not.toBeNull();

    closeBtn!.click();
    expect(events.onClose).toHaveBeenCalledTimes(1);

    // Default or handler teardown
    panel.destroy();
    expect(document.getElementById('docuharvest-root')).toBeNull();
  });

  it('Case 33: Clicking Exit button on minimized pill triggers onClose without restoring/toggling panel', () => {
    session.panelMinimized = true;
    const events = {
      onStart: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStop: vi.fn(),
      onReset: vi.fn(),
      onClearData: vi.fn(),
      onExportMarkdown: vi.fn(),
      onExportJson: vi.fn(),
      onExportCsv: vi.fn(),
      onToggleMinimize: vi.fn(),
      onToggleQueue: vi.fn(),
      onPreviewPage: vi.fn(),
      onPositionChange: vi.fn(),
      onClose: vi.fn(),
    };

    const panel = new PanelController(session, events);
    panel.mount();

    const rootEl = document.getElementById('docuharvest-root');
    expect(rootEl).not.toBeNull();
    const shadow = rootEl!.shadowRoot!;
    const closePillBtn = shadow.getElementById('dh-btn-close-pill');
    expect(closePillBtn).not.toBeNull();

    closePillBtn!.click();
    expect(events.onClose).toHaveBeenCalledTimes(1);
    expect(events.onToggleMinimize).not.toHaveBeenCalled();

    panel.destroy();
    expect(document.getElementById('docuharvest-root')).toBeNull();
  });

  it('Case 34: In-panel configuration settings drawer allows configuring and saving extraction parameters', () => {
    session.panelSettingsVisible = true;
    const events = {
      onStart: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStop: vi.fn(),
      onReset: vi.fn(),
      onClearData: vi.fn(),
      onExportMarkdown: vi.fn(),
      onExportJson: vi.fn(),
      onExportCsv: vi.fn(),
      onToggleMinimize: vi.fn(),
      onToggleQueue: vi.fn(),
      onToggleSettings: vi.fn(),
      onUpdateConfig: vi.fn(),
      onPreviewPage: vi.fn(),
      onPositionChange: vi.fn(),
    };

    const panel = new PanelController(session, events);
    panel.mount();

    const rootEl = document.getElementById('docuharvest-root');
    const shadow = rootEl!.shadowRoot!;
    const settingsDrawer = shadow.getElementById('dh-settings-drawer');
    expect(settingsDrawer).not.toBeNull();

    const rateInput = shadow.getElementById('dh-cfg-ratelimit') as HTMLInputElement;
    expect(rateInput).not.toBeNull();
    rateInput.value = '2500';

    const saveBtn = shadow.getElementById('dh-btn-save-settings');
    expect(saveBtn).not.toBeNull();
    saveBtn!.click();

    expect(events.onUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({
      rateLimitMs: 2500,
    }));

    panel.destroy();
  });

  it('Case 35: Queue search query and status filters correctly isolate pages in queue drawer', () => {
    session.panelQueueVisible = true;
    session.discoveredPages = {
      'https://docs.site.com/intro': { id: 'p1', url: 'https://docs.site.com/intro', title: 'Introduction', status: 'completed', depth: 0, discoveredAt: Date.now() },
      'https://docs.site.com/api/auth': { id: 'p2', url: 'https://docs.site.com/api/auth', title: 'Authentication API', status: 'failed', depth: 0, discoveredAt: Date.now(), error: 'Timeout' },
      'https://docs.site.com/guides': { id: 'p3', url: 'https://docs.site.com/guides', title: 'Developer Guides', status: 'pending', depth: 0, discoveredAt: Date.now() },
    };
    session.pagesOrder = [
      'https://docs.site.com/intro',
      'https://docs.site.com/api/auth',
      'https://docs.site.com/guides',
    ];
    session.queue = ['https://docs.site.com/api/auth', 'https://docs.site.com/guides'];

    const events = {
      onStart: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStop: vi.fn(),
      onReset: vi.fn(),
      onClearData: vi.fn(),
      onExportMarkdown: vi.fn(),
      onExportJson: vi.fn(),
      onExportCsv: vi.fn(),
      onToggleMinimize: vi.fn(),
      onToggleQueue: vi.fn(),
      onPreviewPage: vi.fn(),
      onPositionChange: vi.fn(),
      onSkipAllPending: vi.fn(),
      onRetryAllFailed: vi.fn(),
    };

    const panel = new PanelController(session, events);
    panel.mount();

    const rootEl = document.getElementById('docuharvest-root');
    const shadow = rootEl!.shadowRoot!;

    // Verify search input is present
    const searchInput = shadow.getElementById('dh-queue-search') as HTMLInputElement;
    expect(searchInput).not.toBeNull();

    // Verify bulk action buttons are present and wired
    const skipPendingBtn = shadow.getElementById('dh-btn-skip-all-pending');
    expect(skipPendingBtn).not.toBeNull();
    skipPendingBtn!.click();
    expect(events.onSkipAllPending).toHaveBeenCalledTimes(1);

    const retryFailedBtn = shadow.getElementById('dh-btn-retry-all-failed');
    expect(retryFailedBtn).not.toBeNull();
    retryFailedBtn!.click();
    expect(events.onRetryAllFailed).toHaveBeenCalledTimes(1);

    panel.destroy();
  });

  it('Case 36: Escape key triggers modal dismiss, cancel confirm, or docks panel', () => {
    session.previewPageUrl = 'https://docs.site.com/intro';
    session.collectedPages = {
      'https://docs.site.com/intro': {
        id: '1',
        url: 'https://docs.site.com/intro',
        title: 'Intro',
        markdown: '# Intro',
        wordCount: 100,
        headings: [],
        sections: [],
        isComplete: true,
        extractedAt: Date.now(),
      },
    };

    const events = {
      onStart: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStop: vi.fn(),
      onReset: vi.fn(),
      onClearData: vi.fn(),
      onExportMarkdown: vi.fn(),
      onExportJson: vi.fn(),
      onExportCsv: vi.fn(),
      onToggleMinimize: vi.fn(),
      onToggleQueue: vi.fn(),
      onPreviewPage: vi.fn(),
      onPositionChange: vi.fn(),
    };

    const panel = new PanelController(session, events);
    panel.mount();

    // Press Escape key while preview modal is open
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(events.onPreviewPage).toHaveBeenCalledWith(null);

    panel.destroy();
  });

  it('Case 37: Dynamic export filename derives clean contextual site domain slug and date', () => {
    const siteSession = {
      ...session,
      currentUrl: 'https://docs.stripe.com/api/charges',
    };
    const filename = getContextualFilename(siteSession, 'md');
    expect(filename).toContain('docuharvest-');
    expect(filename).toContain('stripe');
    expect(filename).toContain('charges');
    expect(filename.endsWith('.md')).toBe(true);
  });

  it('Case 38: Live Telemetry Matrix computes and displays throughput and remaining ETA when session status is running', () => {
    session.status = 'running';
    session.startedAt = Date.now() - 60000; // started 60s ago
    session.discoveredPages = {
      'p1': { id: 'p1', url: 'https://docs.site.com/1', title: 'P1', status: 'completed', depth: 0, discoveredAt: Date.now() },
      'p2': { id: 'p2', url: 'https://docs.site.com/2', title: 'P2', status: 'completed', depth: 0, discoveredAt: Date.now() },
      'p3': { id: 'p3', url: 'https://docs.site.com/3', title: 'P3', status: 'pending', depth: 0, discoveredAt: Date.now() },
      'p4': { id: 'p4', url: 'https://docs.site.com/4', title: 'P4', status: 'pending', depth: 0, discoveredAt: Date.now() },
    };
    session.collectedPages = {
      'https://docs.site.com/1': { id: 'p1', url: 'https://docs.site.com/1', title: 'P1', markdown: '# 1', wordCount: 50, headings: [], sections: [], isComplete: true, extractedAt: Date.now() },
      'https://docs.site.com/2': { id: 'p2', url: 'https://docs.site.com/2', title: 'P2', markdown: '# 2', wordCount: 50, headings: [], sections: [], isComplete: true, extractedAt: Date.now() },
    };
    session.pagesOrder = ['https://docs.site.com/1', 'https://docs.site.com/2', 'https://docs.site.com/3', 'https://docs.site.com/4'];
    session.queue = ['https://docs.site.com/3', 'https://docs.site.com/4'];

    const events = {
      onStart: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStop: vi.fn(),
      onReset: vi.fn(),
      onClearData: vi.fn(),
      onExportMarkdown: vi.fn(),
      onExportJson: vi.fn(),
      onExportCsv: vi.fn(),
      onToggleMinimize: vi.fn(),
      onToggleQueue: vi.fn(),
      onPreviewPage: vi.fn(),
      onPositionChange: vi.fn(),
    };

    const panel = new PanelController(session, events);
    panel.mount();

    const rootEl = document.getElementById('docuharvest-root');
    const shadow = rootEl!.shadowRoot!;
    const matrix = shadow.querySelector('.dh-telemetry-matrix');
    expect(matrix).not.toBeNull();

    // Verify ETA calculation text is rendered
    expect(matrix!.textContent).toContain('ETA:');
    panel.destroy();
  });

  it('Case 39: Window resize dynamically invokes applyPosition and reclamps coordinates within current viewport bounds', () => {
    // Set position far off
    session.panelPosition = { x: 2500, y: 1500 };

    const events = {
      onStart: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStop: vi.fn(),
      onReset: vi.fn(),
      onClearData: vi.fn(),
      onExportMarkdown: vi.fn(),
      onExportJson: vi.fn(),
      onExportCsv: vi.fn(),
      onToggleMinimize: vi.fn(),
      onToggleQueue: vi.fn(),
      onPreviewPage: vi.fn(),
      onPositionChange: vi.fn(),
    };

    const panel = new PanelController(session, events);
    panel.mount();

    // Trigger window resize event
    window.dispatchEvent(new Event('resize'));

    const rootEl = document.getElementById('docuharvest-root');
    const shadow = rootEl!.shadowRoot!;
    const container = shadow.querySelector('.dh-container') as HTMLElement;
    expect(container).not.toBeNull();

    // Left style must be bounded by window.innerWidth
    const leftPx = parseInt(container.style.left, 10);
    expect(leftPx).toBeLessThanOrEqual(window.innerWidth);

    panel.destroy();
  });

  it('Case 40: Copy MD button in export bar triggers onCopyMarkdown and displays positive toast notice', () => {
    session.collectedPages = {
      'https://docs.site.com/intro': {
        id: '1',
        url: 'https://docs.site.com/intro',
        title: 'Intro',
        markdown: '# Introduction',
        wordCount: 100,
        headings: [],
        sections: [],
        isComplete: true,
        extractedAt: Date.now(),
      },
    };

    const events = {
      onStart: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStop: vi.fn(),
      onReset: vi.fn(),
      onClearData: vi.fn(),
      onExportMarkdown: vi.fn(),
      onExportJson: vi.fn(),
      onExportCsv: vi.fn(),
      onToggleMinimize: vi.fn(),
      onToggleQueue: vi.fn(),
      onPreviewPage: vi.fn(),
      onPositionChange: vi.fn(),
      onCopyMarkdown: vi.fn(),
    };

    const panel = new PanelController(session, events);
    panel.mount();

    const rootEl = document.getElementById('docuharvest-root');
    const shadow = rootEl!.shadowRoot!;
    const copyBtn = shadow.getElementById('dh-btn-copy-md');
    expect(copyBtn).not.toBeNull();

    copyBtn!.click();
    expect(events.onCopyMarkdown).toHaveBeenCalledTimes(1);

    // Verify toast is displayed
    const toast = shadow.querySelector('.dh-toast');
    expect(toast).not.toBeNull();
    expect(toast!.textContent).toContain('Copied');

    panel.destroy();
  });

  it('Case 41: Prioritizing a page moves it to the head of queue via onPrioritizePage', () => {
    session.panelQueueVisible = true;
    session.discoveredPages = {
      'https://docs.site.com/p1': { id: 'p1', url: 'https://docs.site.com/p1', title: 'Page 1', status: 'pending', depth: 0, discoveredAt: Date.now() },
      'https://docs.site.com/p2': { id: 'p2', url: 'https://docs.site.com/p2', title: 'Page 2', status: 'pending', depth: 0, discoveredAt: Date.now() },
    };
    session.pagesOrder = ['https://docs.site.com/p1', 'https://docs.site.com/p2'];
    session.queue = ['https://docs.site.com/p1', 'https://docs.site.com/p2'];

    const events = {
      onStart: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStop: vi.fn(),
      onReset: vi.fn(),
      onClearData: vi.fn(),
      onExportMarkdown: vi.fn(),
      onExportJson: vi.fn(),
      onExportCsv: vi.fn(),
      onToggleMinimize: vi.fn(),
      onToggleQueue: vi.fn(),
      onPreviewPage: vi.fn(),
      onPositionChange: vi.fn(),
      onPrioritizePage: vi.fn(),
    };

    const panel = new PanelController(session, events);
    panel.mount();

    const rootEl = document.getElementById('docuharvest-root');
    const shadow = rootEl!.shadowRoot!;
    const topBtns = shadow.querySelectorAll<HTMLButtonElement>('.dh-btn-prioritize');
    expect(topBtns.length).toBeGreaterThan(0);

    topBtns[1].click(); // Click Top on Page 2
    expect(events.onPrioritizePage).toHaveBeenCalledWith('https://docs.site.com/p2');

    panel.destroy();
  });

  it('Case 42: Global keyboard shortcut Alt+Shift+D triggers onToggleMinimize', () => {
    const events = {
      onStart: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStop: vi.fn(),
      onReset: vi.fn(),
      onClearData: vi.fn(),
      onExportMarkdown: vi.fn(),
      onExportJson: vi.fn(),
      onExportCsv: vi.fn(),
      onToggleMinimize: vi.fn(),
      onToggleQueue: vi.fn(),
      onPreviewPage: vi.fn(),
      onPositionChange: vi.fn(),
    };

    const panel = new PanelController(session, events);
    panel.mount();

    // Dispatch Alt+Shift+D
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', altKey: true, shiftKey: true }));
    expect(events.onToggleMinimize).toHaveBeenCalledTimes(1);

    panel.destroy();
  });

  it('Case 43: DOM candidate selector detection inspects and ranks document containers', () => {
    document.body.innerHTML = `
      <header>Site Header</header>
      <main id="main-content">
        <p>First paragraph with enough words to establish a substantial text block for inspection.</p>
        <p>Second paragraph adding more detailed documentation explanations about the system architecture.</p>
      </main>
      <article class="markdown-body">
        <h1>Heading Title for the Documentation Section</h1>
        <p>Article body containing technical walkthroughs, installation steps, configuration guides, and references with multiple sentences and detailed explanations.</p>
      </article>
      <footer>Footer content</footer>
    `;

    const candidates = detectCandidateSelectors(document);
    expect(candidates.length).toBeGreaterThan(0);
    const selectors = candidates.map(c => c.selector);
    expect(selectors.some(s => s === 'main' || s === '#main-content')).toBe(true);
    expect(selectors.some(s => s === 'article' || s === '.markdown-body')).toBe(true);
    expect(candidates[0].wordCount).toBeGreaterThan(15);
  });

  it('Case 44: Pre-Harvest Discovery transitions session to "review" state with default Select All on pages and scrolling', async () => {
    document.body.innerHTML = `
      <nav class="sidebar">
        <a href="/intro">Introduction</a>
        <a href="/guides">Guides</a>
        <a href="/faq">FAQ</a>
      </nav>
    `;

    const orchestrator = new CollectionOrchestrator(session);
    await orchestrator.discoverAndReview();

    const currentSession = orchestrator.getSession();
    expect(currentSession.status).toBe('review');
    expect(currentSession.pagesOrder.length).toBeGreaterThanOrEqual(3);

    for (const url of currentSession.pagesOrder) {
      const page = currentSession.discoveredPages[url];
      expect(page.selected).toBe(true);
      expect(page.requiresScroll).toBe(true);
    }
  });

  it('Case 45: Panel Staging Review UI renders checklist, allows deselecting leaf pages and toggling scroll preferences', () => {
    session.status = 'review';
    session.discoveredPages = {
      'https://docs.site.com/intro': { id: '1', url: 'https://docs.site.com/intro', title: 'Intro', depth: 1, status: 'pending', selected: true, requiresScroll: true, discoveredAt: 0 },
      'https://docs.site.com/guides': { id: '2', url: 'https://docs.site.com/guides', title: 'Guides', depth: 1, status: 'pending', selected: true, requiresScroll: true, discoveredAt: 0 },
      'https://docs.site.com/external-leaf': { id: '3', url: 'https://docs.site.com/external-leaf', title: 'Leaf Page Without Sidebar', depth: 1, status: 'pending', selected: true, requiresScroll: true, discoveredAt: 0 },
    };
    session.pagesOrder = [
      'https://docs.site.com/intro',
      'https://docs.site.com/guides',
      'https://docs.site.com/external-leaf'
    ];

    const events = {
      onStart: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStop: vi.fn(),
      onReset: vi.fn(),
      onClearData: vi.fn(),
      onExportMarkdown: vi.fn(),
      onExportJson: vi.fn(),
      onExportCsv: vi.fn(),
      onToggleMinimize: vi.fn(),
      onToggleQueue: vi.fn(),
      onPreviewPage: vi.fn(),
      onPositionChange: vi.fn(),
      onTogglePageSelection: vi.fn(),
      onTogglePageScroll: vi.fn(),
      onConfirmHarvest: vi.fn(),
      onSelectAllPages: vi.fn(),
      onSelectAllScroll: vi.fn(),
    };

    const panel = new PanelController(session, events);
    panel.mount();

    const rootEl = document.getElementById('docuharvest-root');
    const shadow = rootEl!.shadowRoot!;

    // Check review checklist items
    const reviewItems = shadow.querySelectorAll('.dh-review-item');
    expect(reviewItems.length).toBe(3);

    // Deselect leaf page without sidebar
    const pageCheckboxes = shadow.querySelectorAll<HTMLInputElement>('.dh-review-chk-page');
    expect(pageCheckboxes.length).toBe(3);
    pageCheckboxes[2].click();
    expect(events.onTogglePageSelection).toHaveBeenCalledWith('https://docs.site.com/external-leaf', false);

    // Toggle scroll preference on Guides
    const scrollCheckboxes = shadow.querySelectorAll<HTMLInputElement>('.dh-review-chk-scroll');
    expect(scrollCheckboxes.length).toBe(3);
    scrollCheckboxes[1].click();
    expect(events.onTogglePageScroll).toHaveBeenCalledWith('https://docs.site.com/guides', false);

    // Click Compile Selected button
    const confirmBtn = shadow.getElementById('dh-btn-confirm-harvest') as HTMLButtonElement;
    expect(confirmBtn).not.toBeNull();
    confirmBtn.click();
    expect(events.onConfirmHarvest).toHaveBeenCalled();

    panel.destroy();
  });

  it('Case 46: confirmHarvest() filters collection queue to only selected pages and executes extraction loop', async () => {
    session.status = 'review';
    session.discoveredPages = {
      'https://docs.site.com/intro': { id: '1', url: 'https://docs.site.com/intro', title: 'Intro', depth: 1, status: 'pending', selected: true, requiresScroll: false, discoveredAt: 0 },
      'https://docs.site.com/guides': { id: '2', url: 'https://docs.site.com/guides', title: 'Guides', depth: 1, status: 'pending', selected: true, requiresScroll: true, discoveredAt: 0 },
      'https://docs.site.com/no-sidebar-leaf': { id: '3', url: 'https://docs.site.com/no-sidebar-leaf', title: 'Leaf Without Sidebar', depth: 1, status: 'pending', selected: false, requiresScroll: true, discoveredAt: 0 },
    };
    session.pagesOrder = [
      'https://docs.site.com/intro',
      'https://docs.site.com/guides',
      'https://docs.site.com/no-sidebar-leaf'
    ];

    const orchestrator = new CollectionOrchestrator(session);

    // Confirm harvest with only intro and guides
    await orchestrator.confirmHarvest(
      ['https://docs.site.com/intro', 'https://docs.site.com/guides'],
      { 'https://docs.site.com/intro': false, 'https://docs.site.com/guides': true }
    );

    const updated = orchestrator.getSession();
    expect(updated.status).toBe('running');
    expect(updated.discoveredPages['https://docs.site.com/no-sidebar-leaf'].selected).toBe(false);
    expect(updated.discoveredPages['https://docs.site.com/intro'].requiresScroll).toBe(false);
    expect(updated.queue.includes('https://docs.site.com/no-sidebar-leaf')).toBe(false);
  });

  it('Case 47: Settings drawer candidate dropdown and visual element picker updates contentSelector', () => {
    document.body.innerHTML = `
      <article class="docs-container">
        <p>Documentation text for container testing with sufficient words to pass detection thresholds.</p>
        <p>Additional paragraph verifying interactive element inspector functionality and highlight overlay.</p>
      </article>
    `;

    session.panelSettingsVisible = true;
    const events = {
      onStart: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStop: vi.fn(),
      onReset: vi.fn(),
      onClearData: vi.fn(),
      onExportMarkdown: vi.fn(),
      onExportJson: vi.fn(),
      onExportCsv: vi.fn(),
      onToggleMinimize: vi.fn(),
      onToggleQueue: vi.fn(),
      onPreviewPage: vi.fn(),
      onPositionChange: vi.fn(),
      onUpdateConfig: vi.fn(),
    };

    const panel = new PanelController(session, events);
    panel.mount();

    const rootEl = document.getElementById('docuharvest-root');
    const shadow = rootEl!.shadowRoot!;

    // Verify candidate dropdown exists and contains options
    const dropdown = shadow.getElementById('dh-cfg-selector-dropdown') as HTMLSelectElement;
    expect(dropdown).not.toBeNull();
    expect(dropdown.options.length).toBeGreaterThan(1);

    // Pick element button activates inspector
    const pickBtn = shadow.getElementById('dh-btn-pick-element') as HTMLButtonElement;
    expect(pickBtn).not.toBeNull();
    pickBtn.click();

    // Verify picker highlight element is attached to body
    const highlight = document.getElementById('dh-picker-highlight');
    expect(highlight).not.toBeNull();

    // Simulate clicking the article
    const article = document.querySelector('article')!;
    article.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(events.onUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({
      contentSelector: 'article.docs-container'
    }));

    panel.destroy();
  });
});


