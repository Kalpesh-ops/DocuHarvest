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
    action: {
      default_title: 'DocuHarvest — Click to activate on this documentation site'
    }
  }
});
