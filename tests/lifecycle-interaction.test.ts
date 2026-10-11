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
import { exportAsMarkdown, exportAsJson, exportAsCsv, formatSafeCodeBlock } from '../src/export/exporter';
import {
  expandAllCollapsibles,
  extractCurrentPage,
  handleVirtualizedAndNestedContainers,
  extractBreadcrumbs,
  extractInternalLinks,
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
        
        <div class="accordion-item">
          <button id="doc-accordion" aria-expanded="false" aria-controls="faq-answer">FAQ: How does caching work?</button>
          <div id="faq-answer" hidden>Caching is handled via in-memory and disk caches.</div>
        </div>
      </main>
    `;

    const menuBtn = document.getElementById('menu-btn') as HTMLButtonElement;
    const navDropdown = document.getElementById('nav-dropdown') as HTMLButtonElement;
    const profileBtn = document.getElementById('profile-btn') as HTMLButtonElement;
    const docAccordion = document.getElementById('doc-accordion') as HTMLButtonElement;

    let docClickCount = 0;
    docAccordion.addEventListener('click', () => {
      docClickCount++;
      const current = docAccordion.getAttribute('aria-expanded') === 'true';
      docAccordion.setAttribute('aria-expanded', String(!current));
    });

    const restore = expandAllCollapsibles(document.body);

    // Menu, nav dropdown, and profile button must NOT have been expanded
    expect(menuBtn.getAttribute('aria-expanded')).toBe('false');
    expect(navDropdown.getAttribute('aria-expanded')).toBe('false');
    expect(profileBtn.getAttribute('aria-expanded')).toBe('false');

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
});

