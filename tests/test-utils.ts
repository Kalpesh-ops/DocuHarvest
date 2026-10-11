import { vi } from 'vitest';

export function setupChromeMock() {
  const store: Record<string, any> = {};
  const storageListeners: Array<(changes: any, area: string) => void> = [];

  const mockChrome = {
    storage: {
      local: {
        get: async (keys?: string | string[] | Record<string, any>) => {
          if (!keys) return { ...store };
          if (typeof keys === 'string') return { [keys]: store[keys] };
          if (Array.isArray(keys)) {
            const res: Record<string, any> = {};
            for (const k of keys) res[k] = store[k];
            return res;
          }
          const res: Record<string, any> = {};
          for (const k of Object.keys(keys)) {
            res[k] = store[k] !== undefined ? store[k] : keys[k];
          }
          return res;
        },
        set: async (items: Record<string, any>) => {
          const changes: Record<string, any> = {};
          for (const [k, v] of Object.entries(items)) {
            changes[k] = { oldValue: store[k], newValue: v };
            store[k] = v;
          }
          for (const l of storageListeners) {
            l(changes, 'local');
          }
        },
        remove: async (keys: string | string[]) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) delete store[k];
        },
        clear: async () => {
          for (const k of Object.keys(store)) delete store[k];
        }
      },
      onChanged: {
        addListener: (fn: any) => storageListeners.push(fn),
        removeListener: (fn: any) => {
          const idx = storageListeners.indexOf(fn);
          if (idx !== -1) storageListeners.splice(idx, 1);
        }
      }
    },
    action: {
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
    },
    runtime: {
      onInstalled: { addListener: vi.fn() },
      sendMessage: vi.fn(),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() }
    }
  };

  (globalThis as any).chrome = mockChrome;
  return { store, mockChrome };
}
