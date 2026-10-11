/**
 * DocuHarvest - Background Service Worker
 * Manages extension badges, lifecycle events, and global storage monitoring.
 */

import { defineBackground } from 'wxt/sandbox';
import { STORAGE_KEY_SESSION, computeSessionStats } from '../src/storage/storage';
import { HarvestSession } from '../src/types';

export default defineBackground(() => {
  console.log('[DocuHarvest] Background Service Worker active.');

  // Initialize extension badge on startup
  chrome.runtime.onInstalled.addListener(() => {
    chrome.action.setBadgeText({ text: '' });
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
