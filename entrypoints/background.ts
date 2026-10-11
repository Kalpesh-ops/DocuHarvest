/**
 * DocuHarvest - Background Service Worker
 * Manages extension badges, on-demand activeTab script injection,
 * and durable state coordination across navigations without broad host permissions.
 */

import { defineBackground } from 'wxt/sandbox';
import { STORAGE_KEY_SESSION, computeSessionStats, getStoredSession } from '../src/storage/storage';
import { HarvestSession } from '../src/types';

export default defineBackground(() => {
  console.log('[DocuHarvest] Background Service Worker active.');

  // Initialize extension badge on startup
  chrome.runtime.onInstalled.addListener(() => {
    chrome.action.setBadgeText({ text: '' });
  });

  // On-demand activation: User clicks the extension action on their documentation tab
  chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id || !tab.url) return;

    // Prevent injecting into browser internal schemes
    if (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('chrome-extension://')
    ) {
      console.warn('[DocuHarvest] Cannot run on internal browser page:', tab.url);
      return;
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-scripts/content.js'],
      });
      console.log(`[DocuHarvest] Injected collector onto tab ${tab.id} (${tab.url})`);
    } catch (err) {
      console.error('[DocuHarvest] Script injection failed:', err);
    }
  });

  // Listen for tab updates to re-inject collector if collection is actively running
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
      try {
        const session = await getStoredSession();
        if (session && session.status === 'running') {
          const docOrigin = session.currentUrl ? new URL(session.currentUrl).origin : '';
          const tabOrigin = new URL(tab.url).origin;

          if (docOrigin && docOrigin === tabOrigin) {
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ['content-scripts/content.js'],
            });
            console.log(`[DocuHarvest] Resumed active collection injection on tab ${tabId}`);
          }
        }
      } catch {
        // Tab may have navigated or permissions revoked
      }
    }
  });

  // Listen for storage changes to update browser action badge
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[STORAGE_KEY_SESSION]?.newValue) {
      const session = changes[STORAGE_KEY_SESSION].newValue as HarvestSession;
      updateBadge(session);
    }
  });

  function updateBadge(session: HarvestSession) {
    const stats = computeSessionStats(session);

    if (session.status === 'running') {
      chrome.action.setBadgeText({ text: `${stats.collected}` });
      chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    } else if (session.status === 'paused') {
      chrome.action.setBadgeText({ text: 'II' });
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    } else if (session.status === 'completed') {
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#06b6d4' });
    } else if (session.status === 'error') {
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  }
});
