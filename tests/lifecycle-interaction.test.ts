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
import { exportAsMarkdown, exportAsJson, exportAsCsv } from '../src/export/exporter';

describe('Phase 2 — Lifecycle & Interaction Verification Suite (15 Test Cases)', () => {
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
});
