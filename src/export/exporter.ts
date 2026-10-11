/**
 * DocuHarvest - Final Data Compilation and Export System
 * Compiles canonical documentation model into:
 *  - documentation-bundle.md (Primary AI agent knowledge base)
 *  - documentation-bundle.json (Structured records & metadata)
 *  - documentation-bundle.csv (Tabular spreadsheet & RAG format)
 */

import { HarvestSession } from '../types';
import { computeSessionStats } from '../storage/storage';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Escapes CSV field according to RFC 4180:
 * Encloses in double quotes if it contains commas, newlines, or quotes;
 * Escapes inner double quotes as double-double quotes ("").
 */
export function escapeCsvField(value: string | number | boolean | undefined | null): string {
  if (value === undefined || value === null) return '""';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Formats a safe markdown code block fence, preventing broken code fences
 * if the code block itself contains triple backticks.
 */
export function formatSafeCodeBlock(code: string, language: string = ''): string {
  const cleanCode = code.trim();
  let fence = '```';
  if (cleanCode.includes('```')) {
    fence = '````';
  }
  if (cleanCode.includes('````')) {
    fence = '~~~~';
  }
  return `\n\n${fence}${language}\n${cleanCode}\n${fence}\n\n`;
}

/**
 * Compiles all collected pages into a unified, AI-ready Master Markdown document
 * (documentation-bundle.md) with frontmatter, Table of Contents, tab sections,
 * and a final collection audit report.
 */
export function compileMasterMarkdown(session: HarvestSession): string {
  const stats = computeSessionStats(session);
  const collectedList = Object.values(session.collectedPages);

  // Preserve discovery/sidebar reading order
  const orderedPages = session.pagesOrder
    .map(url => session.collectedPages[url])
    .filter(Boolean);

  const orderedUrls = new Set(session.pagesOrder);
  for (const page of collectedList) {
    if (!orderedUrls.has(page.url)) {
      orderedPages.push(page);
    }
  }

  const exportDate = new Date().toISOString();
  const sourceOrigin = session.currentUrl ? new URL(session.currentUrl).origin : 'Documentation Site';

  // 1. Frontmatter
  let output = `---
title: "Documentation Knowledge Bundle"
source: "${sourceOrigin}"
collected_at: "${exportDate}"
total_pages: ${orderedPages.length}
total_words: ${stats.totalWords}
generator: "DocuHarvest Private Documentation Collector"
bundle_version: "1.0.0"
---

# Documentation Knowledge Bundle

> **Source Origin:** ${sourceOrigin}  
> **Generation Date:** ${new Date().toLocaleString()}  
> **Total Pages:** ${orderedPages.length} | **Total Word Count:** ~${stats.totalWords} words  
> **Completeness:** ${stats.failed === 0 ? 'Verified Complete' : `${stats.failed} page(s) failed`}  

This compiled documentation file is formatted specifically for AI Agent ingestion, semantic context, and technical analysis.

---

## Table of Contents

`;

  // 2. Table of Contents
  orderedPages.forEach((page, index) => {
    const anchor = slugify(`${index + 1}-${page.title}`);
    const breadcrumbStr = page.breadcrumbs && page.breadcrumbs.length > 0 ? ` *(${page.breadcrumbs.join(' > ')})*` : '';
    output += `${index + 1}. [${page.title}](#${anchor})${breadcrumbStr} — *${page.wordCount} words*\n`;

    if (page.headings && page.headings.length > 0) {
      page.headings.slice(0, 6).forEach(h => {
        const subAnchor = slugify(h);
        output += `   - [${h}](#${subAnchor})\n`;
      });
    }
  });

  output += '\n\n---\n\n';

  // 3. Page Bodies
  orderedPages.forEach((page, index) => {
    const pageAnchor = slugify(`${index + 1}-${page.title}`);
    output += `<a id="${pageAnchor}"></a>\n\n`;
    output += `# ${index + 1}. ${page.title}\n\n`;

    // Metadata blockquote
    output += `> **Canonical URL:** [${page.url}](${page.url})  \n`;
    if (page.breadcrumbs && page.breadcrumbs.length > 0) {
      output += `> **Breadcrumb Path:** ${page.breadcrumbs.join(' > ')}  \n`;
    }
    output += `> **Extraction Status:** ${page.isComplete ? '✓ Complete' : '⚠ Incomplete / Partial'}  \n`;
    if (page.warnings && page.warnings.length > 0) {
      output += `> **Warnings:** ${page.warnings.join('; ')}  \n`;
    }
    output += `> **Word Count:** ${page.wordCount} words | **Extracted At:** ${new Date(page.extractedAt).toLocaleString()}  \n\n`;

    // Page Markdown content
    output += page.markdown;

    // Tab-specific subsections if tabs were extracted
    if (page.sections) {
      for (const section of page.sections) {
        if (section.tabs && section.tabs.length > 0) {
          output += `\n\n### Tab Variations: ${section.heading}\n\n`;
          for (const tab of section.tabs) {
            output += `#### [Tab: ${tab.tabName}]\n\n`;
            output += `${tab.content}\n\n`;
          }
        }
      }
    }

    // Notes for hidden or partially extracted content
    if (page.notes && page.notes.length > 0) {
      output += `\n\n> [!NOTE]\n`;
      output += `> **Extraction Notes:**  \n`;
      page.notes.forEach(note => {
        output += `> - ${note}\n`;
      });
      output += `\n`;
    }

    // Internal links references
    if (page.internalLinks && page.internalLinks.length > 0) {
      output += `\n\n<details>\n<summary>Referenced Internal Links (${page.internalLinks.length})</summary>\n\n`;
      page.internalLinks.slice(0, 15).forEach(link => {
        output += `- [${link.text}](${link.url})\n`;
      });
      output += `\n</details>\n\n`;
    }

    output += '\n\n---\n\n';
  });

  // 4. Final Collection & Audit Report
  output += `## Collection & Audit Report\n\n`;
  output += `### Summary\n\n`;
  output += `- **Total Discovered Pages:** ${stats.discovered}\n`;
  output += `- **Successfully Collected:** ${stats.collected}\n`;
  output += `- **Skipped Pages:** ${stats.skipped}\n`;
  output += `- **Failed Pages:** ${stats.failed}\n`;
  output += `- **Total Compiled Words:** ${stats.totalWords}\n\n`;

  // Failed pages detail
  if (session.errors && session.errors.length > 0) {
    output += `### Failures & Exceptions\n\n`;
    output += `| Timestamp | URL | Error Message |\n`;
    output += `| --- | --- | --- |\n`;
    session.errors.forEach(err => {
      output += `| ${new Date(err.timestamp).toLocaleTimeString()} | ${err.url} | ${err.message.replace(/\|/g, '\\|')} |\n`;
    });
    output += `\n`;
  }

  // Skipped pages detail
  const skippedPages = Object.values(session.discoveredPages).filter(p => p.status === 'skipped');
  if (skippedPages.length > 0) {
    output += `### Skipped Pages\n\n`;
    skippedPages.forEach(p => {
      output += `- **${p.title}** ([${p.url}](${p.url})): ${p.skippedReason || 'Skipped by user'}\n`;
    });
    output += `\n`;
  }

  // Known limitations
  output += `### Ingestion Notes for AI Agents\n\n`;
  output += `1. **Cross-Section References:** Page links within this document resolve to the source URLs or corresponding section anchors above.\n`;
  output += `2. **Code Blocks:** Syntax language tags were inferred from rendered documentation DOM classes.\n`;
  output += `3. **Interactive Tabs:** Multi-tab code snippets (e.g. languages or package managers) have been preserved under their respective tab headers.\n`;

  return output.trim();
}

/**
 * Compiles collected documentation into structured JSON (documentation-bundle.json)
 * with full page records, content blocks, and audit metadata.
 */
export function compileStructuredJson(session: HarvestSession): string {
  const stats = computeSessionStats(session);
  const orderedPages = session.pagesOrder
    .map(url => session.collectedPages[url])
    .filter(Boolean);

  const payload = {
    metadata: {
      bundleName: 'DocuHarvest Documentation Bundle',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      sourceOrigin: session.currentUrl ? new URL(session.currentUrl).origin : '',
      stats: {
        totalPages: orderedPages.length,
        totalWords: stats.totalWords,
        discoveredPages: stats.discovered,
        collectedPages: stats.collected,
        failedPages: stats.failed,
        skippedPages: stats.skipped,
      },
    },
    pages: orderedPages.map((page, index) => ({
      pageIndex: index + 1,
      id: page.id,
      url: page.url,
      title: page.title,
      breadcrumbs: page.breadcrumbs || [],
      wordCount: page.wordCount,
      isComplete: page.isComplete,
      warnings: page.warnings || [],
      notes: page.notes || [],
      headings: page.headings,
      markdown: page.markdown,
      sections: page.sections,
      contentBlocks: page.contentBlocks || [],
      tabsExtracted: page.tabsExtracted || [],
      internalLinks: page.internalLinks || [],
      extractedAt: page.extractedAt,
    })),
    auditReport: {
      failures: session.errors || [],
      skippedPages: Object.values(session.discoveredPages).filter(p => p.status === 'skipped'),
    },
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Compiles collected documentation into RFC 4180 compliant CSV (documentation-bundle.csv)
 * with UTF-8 BOM so Excel, Google Sheets, Python, and R handle all Unicode correctly.
 */
export function compileStructuredCsv(session: HarvestSession): string {
  const orderedPages = session.pagesOrder
    .map(url => session.collectedPages[url])
    .filter(Boolean);

  const headers = [
    'page_index',
    'title',
    'canonical_url',
    'breadcrumbs',
    'is_complete',
    'word_count',
    'headings_count',
    'extracted_at',
    'warnings',
    'content_preview'
  ];

  const rows: string[] = [];
  rows.push(headers.map(h => escapeCsvField(h)).join(','));

  orderedPages.forEach((page, index) => {
    const preview = page.markdown.replace(/\s+/g, ' ').substring(0, 300);
    const row = [
      escapeCsvField(index + 1),
      escapeCsvField(page.title),
      escapeCsvField(page.url),
      escapeCsvField((page.breadcrumbs || []).join(' > ')),
      escapeCsvField(page.isComplete),
      escapeCsvField(page.wordCount),
      escapeCsvField(page.headings.length),
      escapeCsvField(new Date(page.extractedAt).toISOString()),
      escapeCsvField((page.warnings || []).join('; ')),
      escapeCsvField(preview)
    ];
    rows.push(row.join(','));
  });

  // Prefix with UTF-8 BOM (\uFEFF) for spreadsheet compatibility
  return '\uFEFF' + rows.join('\r\n');
}

/**
 * Safely triggers an in-browser download of the content as a file without page reloads.
 */
export function triggerBrowserDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();

  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 1500);
}

/**
 * Downloads compiled Markdown file (documentation-bundle.md).
 */
export function exportAsMarkdown(session: HarvestSession): void {
  const md = compileMasterMarkdown(session);
  triggerBrowserDownload('documentation-bundle.md', md, 'text/markdown;charset=utf-8');
}

/**
 * Downloads compiled JSON file (documentation-bundle.json).
 */
export function exportAsJson(session: HarvestSession): void {
  const json = compileStructuredJson(session);
  triggerBrowserDownload('documentation-bundle.json', json, 'application/json;charset=utf-8');
}

/**
 * Downloads compiled CSV file (documentation-bundle.csv).
 */
export function exportAsCsv(session: HarvestSession): void {
  const csv = compileStructuredCsv(session);
  triggerBrowserDownload('documentation-bundle.csv', csv, 'text/csv;charset=utf-8');
}
