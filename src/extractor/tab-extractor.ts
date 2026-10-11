/**
 * DocuHarvest - Safe Tab Extraction Engine
 * Inspects tab controls, validates read-only safety, captures inactive panels,
 * and restores the original active tab and scroll position.
 */

import { TabExtractionRecord } from '../types';

const UNSAFE_TAB_KEYWORDS = [
  'delete', 'remove', 'destroy', 'cancel', 'logout', 'signout', 'exit',
  'submit', 'checkout', 'pay', 'purchase', 'buy', 'order', 'upgrade',
  'install-app', 'connect-wallet'
];

export interface ExtractedTabGroup {
  groupIndex: number;
  tabs: Array<{ tabName: string; content: string }>;
  records: TabExtractionRecord[];
}

/**
 * Checks if a tab button is a safe, read-only documentation switcher.
 */
export function isSafeDocumentationTab(button: HTMLElement): boolean {
  // If it's an anchor, check if it points to another page or external site
  if (button.tagName === 'A') {
    const href = (button.getAttribute('href') || '').trim();
    if (href.startsWith('http') || href.startsWith('/') || href.startsWith('mailto:')) {
      // Navigates away from page: unsafe as a tab switcher
      return false;
    }
  }

  // Check button type
  if (button.getAttribute('type') === 'submit') {
    return false;
  }

  // Check text content or aria-label for destructive keywords
  const text = (button.getAttribute('aria-label') || button.innerText || button.textContent || '').toLowerCase();
  for (const keyword of UNSAFE_TAB_KEYWORDS) {
    if (text.includes(keyword)) {
      return false;
    }
  }

  return true;
}

/**
 * Finds the tabpanel associated with a given tab button.
 */
function findAssociatedPanel(btn: HTMLElement, container: HTMLElement): HTMLElement | null {
  // Method 1: aria-controls
  const controlsId = btn.getAttribute('aria-controls');
  if (controlsId) {
    const panel = document.getElementById(controlsId);
    if (panel) return panel;
  }

  // Method 2: aria-labelledby match
  const btnId = btn.id;
  if (btnId) {
    const panel = document.querySelector<HTMLElement>(`[role="tabpanel"][aria-labelledby="${btnId}"]`);
    if (panel) return panel;
  }

  // Method 3: Neighboring tabpanel within the tablist parent
  const parent = btn.closest('[role="tablist"], .tabs, .tab-group')?.parentElement;
  if (parent) {
    const panels = Array.from(parent.querySelectorAll<HTMLElement>('[role="tabpanel"], .tab-pane, .tab-content > div'));
    const btnIndex = Array.from(btn.parentElement?.children || []).indexOf(btn);
    if (panels[btnIndex]) return panels[btnIndex];
  }

  return null;
}

/**
 * Safely extracts all documentation tab panels within the content container.
 * Prefers reading rendered hidden panels; otherwise clicks safe tabs and restores state.
 */
export async function extractAllTabsSafely(
  contentContainer: HTMLElement,
  enableSafeClicking: boolean = true
): Promise<{ extractedTabs: Array<{ tabName: string; content: string }>; records: TabExtractionRecord[] }> {
  const allExtractedTabs: Array<{ tabName: string; content: string }> = [];
  const records: TabExtractionRecord[] = [];

  const tabLists = Array.from(
    contentContainer.querySelectorAll<HTMLElement>(
      '[role="tablist"], .tabs, .tab-group, .nav-tabs, .tabs-container, ul[class*="tabs" i]'
    )
  );

  for (let groupIdx = 0; groupIdx < tabLists.length; groupIdx++) {
    const tabList = tabLists[groupIdx];
    const buttons = Array.from(
      tabList.querySelectorAll<HTMLElement>('[role="tab"], button.tab, .tab-item, button[class*="tab" i], li > a')
    );

    if (buttons.length <= 1) continue;

    // Detect currently active tab
    let originalActiveBtn: HTMLElement | null = null;
    for (const btn of buttons) {
      if (
        btn.getAttribute('aria-selected') === 'true' ||
        btn.classList.contains('active') ||
        btn.classList.contains('is-active') ||
        btn.classList.contains('selected')
      ) {
        originalActiveBtn = btn;
        break;
      }
    }
    if (!originalActiveBtn && buttons.length > 0) {
      originalActiveBtn = buttons[0];
    }

    const originalScrollY = window.scrollY;

    for (const btn of buttons) {
      const tabName = (btn.getAttribute('aria-label') || btn.innerText || btn.textContent || '').trim();
      if (!tabName) continue;

      // 1. Safety check
      if (!isSafeDocumentationTab(btn)) {
        records.push({
          tabGroupIndex: groupIdx,
          tabName,
          status: 'unsafe',
          error: 'Skipped tab click: contains potential action or external link',
        });
        continue;
      }

      // 2. Check if panel is already accessible in DOM without clicking
      let panel = findAssociatedPanel(btn, contentContainer);
      let panelText = panel ? (panel.innerText || panel.textContent || '').trim() : '';

      if (panelText && panelText.length > 0) {
        allExtractedTabs.push({ tabName, content: panelText });
        records.push({
          tabGroupIndex: groupIdx,
          tabName,
          status: 'extracted',
          contentSnippet: panelText.substring(0, 80),
        });
        continue;
      }

      // 3. If dynamic click extraction is allowed and panel wasn't readable in DOM
      if (enableSafeClicking) {
        try {
          btn.click();
          // Short pause for dynamic framework render
          await new Promise(resolve => setTimeout(resolve, 150));

          panel = findAssociatedPanel(btn, contentContainer);
          // Fallback: query active tabpanel
          if (!panel) {
            panel = contentContainer.querySelector<HTMLElement>(
              '[role="tabpanel"]:not([hidden]), .tab-pane.active, .tab-content > div:not([style*="display: none"])'
            );
          }

          panelText = panel ? (panel.innerText || panel.textContent || '').trim() : '';

          if (panelText) {
            allExtractedTabs.push({ tabName, content: panelText });
            records.push({
              tabGroupIndex: groupIdx,
              tabName,
              status: 'extracted',
              contentSnippet: panelText.substring(0, 80),
            });
          } else {
            records.push({
              tabGroupIndex: groupIdx,
              tabName,
              status: 'empty',
              error: 'Tab clicked but panel contained no text content',
            });
          }
        } catch (err: any) {
          records.push({
            tabGroupIndex: groupIdx,
            tabName,
            status: 'empty',
            error: `Error interacting with tab: ${err?.message || 'unknown'}`,
          });
        }
      } else {
        records.push({
          tabGroupIndex: groupIdx,
          tabName,
          status: 'empty',
          error: 'Dynamic tab switching disabled in configuration',
        });
      }
    }

    // 4. Restore original active tab & scroll position
    if (originalActiveBtn && enableSafeClicking) {
      try {
        originalActiveBtn.click();
        await new Promise(resolve => setTimeout(resolve, 60));
      } catch {
        // ignore restore click issue
      }
    }

    // Restore scroll position
    if (Math.abs(window.scrollY - originalScrollY) > 5) {
      window.scrollTo({ top: originalScrollY, behavior: 'instant' });
    }
  }

  return { extractedTabs: allExtractedTabs, records };
}
