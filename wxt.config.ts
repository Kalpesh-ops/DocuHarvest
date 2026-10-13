import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'DocuHarvest — Private Documentation Collector',
    description: 'Privately collect, compile, and export documentation from authenticated web sessions into clean AI-ready documents.',
    version: '0.1.0',
    permissions: [
      'storage',
      'activeTab',
      'scripting'
    ],
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    action: {
      default_title: 'DocuHarvest — Click to activate on this documentation site',
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
        128: 'icon-128.png',
      },
    },
  },
});
