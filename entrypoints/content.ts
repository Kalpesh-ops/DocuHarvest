/**
 * DocuHarvest - Main Content Script Entrypoint
 * Mounts the isolated floating control panel into the authenticated webpage,
 * connects the collection orchestrator, monitors SPA route changes,
 * and manages durable state persistence and data exports.
 */

import { defineContentScript } from 'wxt/sandbox';
import {
  getOrCreateSession,
  normalizeUrl,
  subscribeToSessionChanges,
  updateSessionPartial,
} from '../src/storage/storage';
import { CollectionOrchestrator } from '../src/orchestrator/collection-orchestrator';
import { PanelController } from '../src/ui/panel';
import { exportAsCsv, exportAsJson, exportAsMarkdown } from '../src/export/exporter';
import { HarvestSession } from '../src/types';

export default defineContentScript({
  registration: 'runtime',
  main() {
    // Only inject in top-level windows, not iframes
    if (window.self !== window.top) return;

    if ((window as any).__DOCUHARVEST_MOUNTED__) {
      return;
    }
    (window as any).__DOCUHARVEST_MOUNTED__ = true;

    console.log('[DocuHarvest] Content script initialized on:', window.location.href);

    let panel: PanelController | null = null;
    let orchestrator: CollectionOrchestrator | null = null;
    let session: HarvestSession;
    let lastUrl = window.location.href;

    async function init() {
      const currentUrl = normalizeUrl(window.location.href);
      const docTitle = (document.title || 'Documentation Page').split(/[-|–—]/)[0].trim();

      // Load durable session from chrome.storage.local
      session = await getOrCreateSession(currentUrl, docTitle);

      // Create panel controller with callback bindings
      panel = new PanelController(session, {
        onStart: async () => {
          if (orchestrator) await orchestrator.start();
        },
        onPause: async () => {
          if (orchestrator) await orchestrator.pause();
        },
        onResume: async () => {
          if (orchestrator) await orchestrator.resume();
        },
        onStop: async () => {
          if (orchestrator) await orchestrator.stop();
        },
        onReset: async () => {
          if (orchestrator) await orchestrator.reset();
        },
        onClearData: async () => {
          if (orchestrator) {
            await orchestrator.reset();
          }
        },
        onExportMarkdown: () => {
          if (orchestrator) {
            exportAsMarkdown(orchestrator.getSession());
          }
        },
        onExportJson: () => {
          if (orchestrator) {
            exportAsJson(orchestrator.getSession());
          }
        },
        onExportCsv: () => {
          if (orchestrator) {
            exportAsCsv(orchestrator.getSession());
          }
        },
        onToggleMinimize: async () => {
          session.panelMinimized = !session.panelMinimized;
          await updateSessionPartial({ panelMinimized: session.panelMinimized });
          panel?.render(session);
        },
        onToggleQueue: async () => {
          session.panelQueueVisible = !session.panelQueueVisible;
          await updateSessionPartial({ panelQueueVisible: session.panelQueueVisible });
          panel?.render(session);
        },
        onPreviewPage: async (url: string | null) => {
          session.previewPageUrl = url;
          await updateSessionPartial({ previewPageUrl: url });
          panel?.render(session);
        },
        onPositionChange: async (pos) => {
          session.panelPosition = pos;
          await updateSessionPartial({ panelPosition: pos });
        },
        onSkipPage: async (url: string) => {
          if (orchestrator) await orchestrator.skipPage(url);
        },
        onRetryPage: async (url: string) => {
          if (orchestrator) await orchestrator.retryPage(url);
        },
      });

      // Mount isolated Shadow DOM
      panel.mount();

      // Initialize orchestrator with state change listener
      orchestrator = new CollectionOrchestrator(session, (updatedSession) => {
        session = updatedSession;
        panel?.render(session);
      });

      // Subscribe to external storage updates (e.g. from background or cross-tab)
      subscribeToSessionChanges((newSession) => {
        session = newSession;
        orchestrator?.updateSessionLocal(newSession);
        panel?.render(newSession);
      });

      // SPA Navigation Monitoring
      const handleSpaRouteChange = async () => {
        const newUrl = window.location.href;
        if (newUrl !== lastUrl) {
          lastUrl = newUrl;
          console.log('[DocuHarvest] SPA route transition detected:', newUrl);
          if (orchestrator) {
            await orchestrator.initOnPageLoad();
          }
        }
      };

      window.addEventListener('popstate', handleSpaRouteChange);
      window.addEventListener('hashchange', handleSpaRouteChange);

      // Monkey-patch history pushState / replaceState for client-side frameworks
      const originalPushState = history.pushState;
      history.pushState = function (...args) {
        const ret = originalPushState.apply(this, args);
        setTimeout(handleSpaRouteChange, 50);
        return ret;
      };

      const originalReplaceState = history.replaceState;
      history.replaceState = function (...args) {
        const ret = originalReplaceState.apply(this, args);
        setTimeout(handleSpaRouteChange, 50);
        return ret;
      };

      // Check if session was actively running before navigation
      await orchestrator.initOnPageLoad();
    }

    // Run initialization
    init().catch((err) => {
      console.error('[DocuHarvest] Content script initialization error:', err);
    });
  },
});
