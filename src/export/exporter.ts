/**
 * DocuHarvest - Final Data Compilation and Export System
 * Compiles canonical documentation model into:
 *  - documentation-bundle.md (Primary AI agent knowledge base)
 *  - documentation-bundle.json (Structured records & metadata)
 *  - documentation-bundle.csv (Tabular spreadsheet & RAG format)
 */

import { HarvestSession, CollectedPage } from '../types';
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
 * by dynamically calculating a fence longer than any consecutive backtick sequence
 * contained inside the code block (CommonMark / GFM standard).
 */
export function formatSafeCodeBlock(code: string, language: string = ''): string {
  const cleanCode = code.trim();
  const backtickRuns = cleanCode.match(/`+/g) || [];
  let maxBackticks = 0;
  for (const run of backtickRuns) {
    if (run.length > maxBackticks) {
      maxBackticks = run.length;
    }
  }

  const fenceLength = Math.max(3, maxBackticks + 1);
  const fence = '`'.repeat(fenceLength);
  return `\n\n${fence}${language}\n${cleanCode}\n${fence}\n\n`;
}

/**
 * Extracts collected pages preserving discovery order, falling back to all collected pages.
 */
export function getOrderedCollectedPages(session: HarvestSession): CollectedPage[] {
  const collectedList = Object.values(session.collectedPages);
  const orderedPages = (session.pagesOrder || [])
    .map(url => session.collectedPages[url])
    .filter(Boolean);

  const orderedUrls = new Set(session.pagesOrder || []);
  for (const page of collectedList) {
    if (!orderedUrls.has(page.url)) {
      orderedPages.push(page);
    }
  }

  return orderedPages;
}

/**
 * Compiles all collected pages into a unified, AI-ready Master Markdown document
 * (documentation-bundle.md) with frontmatter, Table of Contents, tab sections,
 * and a final collection audit report.
 */
export function compileMasterMarkdown(session: HarvestSession): string {
  const stats = computeSessionStats(session);
  const orderedPages = getOrderedCollectedPages(session);

  const exportDate = new Date().toISOString();
  const sourceOrigin = session.currentUrl ? new URL(session.currentUrl).origin : 'Documentation Site';

  const partialPagesCount = orderedPages.filter(p => !p.isComplete).length;
  const pagesWithWarnings = orderedPages.filter(p => p.isComplete && p.warnings && p.warnings.length > 0);
  const warningPagesCount = pagesWithWarnings.length;

  let completenessStatus = 'No known incomplete pages or warnings (all discovered pages fully extracted)';
  if (stats.failed > 0 || stats.skipped > 0 || partialPagesCount > 0) {
    const details: string[] = [];
    if (stats.failed > 0) details.push(`${stats.failed} failed`);
    if (partialPagesCount > 0) details.push(`${partialPagesCount} partial`);
    if (stats.skipped > 0) details.push(`${stats.skipped} skipped`);
    if (warningPagesCount > 0) details.push(`${warningPagesCount} with warnings`);
    completenessStatus = `Incomplete (${details.join(', ')})`;
  } else if (warningPagesCount > 0) {
    completenessStatus = `Complete with warnings (${warningPagesCount} page(s) contain extraction warnings)`;
  }

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
> **Completeness:** ${completenessStatus}  

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
      page.headings.slice(0, 6).forEach((h: string) => {
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
      page.notes.forEach((note: string) => {
        output += `> - ${note}\n`;
      });
      output += `\n`;
    }

    // Internal links references
    if (page.internalLinks && page.internalLinks.length > 0) {
      output += `\n\n<details>\n<summary>Referenced Internal Links (${page.internalLinks.length})</summary>\n\n`;
      page.internalLinks.slice(0, 15).forEach((link: { text: string; url: string }) => {
        output += `- [${link.text}](${link.url})\n`;
      });
      output += `\n</details>\n\n`;
    }

    output += '\n\n---\n\n';
  });

  // 4. Final Collection & Audit Report
  output += `## Collection & Audit Report\n\n`;
  output += `> **Audit Scope Note:** "No known incomplete pages or warnings" establishes that all discovered documentation pages in the collection queue were fully extracted without partial extractions, skips, errors, or extraction warnings. It measures completeness across discovered navigation, not unlinked or undiscovered pages.\n\n`;
  output += `### Summary\n\n`;
  output += `- **Total Discovered Pages:** ${stats.discovered}\n`;
  output += `- **Successfully Collected:** ${stats.collected}\n`;
  output += `- **Fully Extracted Pages (Clean / Zero Warnings):** ${orderedPages.filter(p => p.isComplete && (!p.warnings || p.warnings.length === 0)).length}\n`;
  output += `- **Pages with Extraction Warnings:** ${warningPagesCount}\n`;
  output += `- **Partial Pages:** ${partialPagesCount}\n`;
  output += `- **Skipped Pages:** ${stats.skipped}\n`;
  output += `- **Failed Pages:** ${stats.failed}\n`;
  output += `- **Total Compiled Words:** ${stats.totalWords}\n\n`;

  // Pages with warnings detail
  if (pagesWithWarnings.length > 0) {
    output += `### Extraction Warnings\n\n`;
    output += `| Page Title | URL | Warnings |\n`;
    output += `| --- | --- | --- |\n`;
    pagesWithWarnings.forEach(p => {
      const warnList = (p.warnings || []).join('; ').replace(/\|/g, '\\|');
      output += `| ${p.title.replace(/\|/g, '\\|')} | ${p.url} | ${warnList} |\n`;
    });
    output += `\n`;
  }

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
  const orderedPages = getOrderedCollectedPages(session);

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
        completedPages: orderedPages.filter(p => p.isComplete).length,
        partialPages: orderedPages.filter(p => !p.isComplete).length,
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
  const orderedPages = getOrderedCollectedPages(session);

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
    if (anchor.parentNode) {
      try {
        anchor.parentNode.removeChild(anchor);
      } catch {
        // Already removed or detached
      }
    }
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore revoke error
      }
    }
  }, 1500);
}

/**
 * Generates an informative, contextual export filename based on the site domain and date.
 */
export function getContextualFilename(session: HarvestSession, ext: string): string {
  let slug = 'bundle';
  try {
    if (session.currentUrl) {
      const parsed = new URL(session.currentUrl);
      const hostPart = parsed.hostname.replace(/^www\./, '').replace(/\./g, '-');
      const pathPart = parsed.pathname.replace(/^\/+|\/+$/g, '').replace(/[\/\\]+/g, '-');
      const combined = [hostPart, pathPart].filter(Boolean).join('-');
      slug = slugify(combined) || 'bundle';
    }
  } catch {
    slug = 'bundle';
  }
  const dateStr = new Date().toISOString().slice(0, 10);
  return `docuharvest-${slug}-${dateStr}.${ext}`;
}

/**
 * Copies compiled markdown directly to the system clipboard.
 */
export async function copyMarkdownToClipboard(session: HarvestSession): Promise<boolean> {
  const md = compileMasterMarkdown(session);
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(md);
      return true;
    }
  } catch (err) {
    console.warn('[DocuHarvest] Clipboard write failed:', err);
  }
  return false;
}

/**
 * Downloads compiled Markdown file with contextual naming.
 */
export function exportAsMarkdown(session: HarvestSession): string {
  const md = compileMasterMarkdown(session);
  const filename = getContextualFilename(session, 'md');
  triggerBrowserDownload(filename, md, 'text/markdown;charset=utf-8');
  return filename;
}

/**
 * Downloads compiled JSON file with contextual naming.
 */
export function exportAsJson(session: HarvestSession): string {
  const json = compileStructuredJson(session);
  const filename = getContextualFilename(session, 'json');
  triggerBrowserDownload(filename, json, 'application/json;charset=utf-8');
  return filename;
}

/**
 * Downloads compiled CSV file with contextual naming.
 */
export function exportAsCsv(session: HarvestSession): string {
  const csv = compileStructuredCsv(session);
  const filename = getContextualFilename(session, 'csv');
  triggerBrowserDownload(filename, csv, 'text/csv;charset=utf-8');
  return filename;
}
