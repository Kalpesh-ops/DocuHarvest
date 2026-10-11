# DocuHarvest — Architectural Deep Dive

This document details the internal design, concurrency models, extraction pipelines, and security boundaries implemented in DocuHarvest.

---

## 1. High-Level Architecture

DocuHarvest is built with **WXT** and **TypeScript**, targeting **Chrome Manifest V3**:

```
+-----------------------------------------------------------------------------------+
| Host Webpage (Authenticated DOM & SPA Router)                                     |
|                                                                                   |
|  +--------------------+         +-----------------------------------------------+ |
|  | Documentation      | <------ | DocuHarvest Content Script                    | |
|  | Sidebar & Content  |         |                                               | |
|  +--------------------+         |  * Page Discovery Engine                      | |
|            ^                    |  * DOM / Tab / Accordion Extractor            | |
|            | Reads / Restores   |  * Virtualized Container Scroller             | |
|            |                    +-----------------------------------------------+ |
|            |                                            |                         |
|  +--------------------+                     Renders     v                         |
|  | Floating Shadow DOM| <-------------------------------+                         |
|  | (#docuharvest-root)|                                                           |
|  | Glassmorphism UI   |                                                           |
|  +--------------------+                                                           |
+-----------------------------------------------------------------------------------+
                                          |
                      Persists / Recovers | chrome.storage.local
                                          v
+-----------------------------------------------------------------------------------+
| Chrome Extension Sandbox                                                          |
|                                                                                   |
|  +-------------------------------+         +------------------------------------+ |
|  | Storage Engine                | <-----> | Collection Orchestrator            | |
|  | (Durable Session State)       |         | (Single Authoritative Coordinator) | |
|  +-------------------------------+         +------------------------------------+ |
|                                                                                   |
|  +-------------------------------+         +------------------------------------+ |
|  | Background Service Worker     | ------> | Multi-Format Exporter              | |
|  | (On-demand action injection)  |         | (Markdown, JSON, CSV Bundles)      | |
|  +-------------------------------+         +------------------------------------+ |
+-----------------------------------------------------------------------------------+
```

---

## 2. Distributed Lifecycle & Coordinator Race Prevention

### The Problem
Documentation sites frequently use Single Page Application (SPA) routing (e.g. Next.js, React Router, Docusaurus) or full page reloads for cross-section navigation. When navigating between pages, content scripts may re-mount, leading to duplicate workers competing to process the queue or race conditions where multiple tabs write conflicting states.

### The Solution: Single Authoritative Coordinator Token
DocuHarvest uses a distributed ownership token model:
1. Each orchestrator instance generates a unique `coordinatorToken`:
   ```ts
   this.coordinatorToken = `coord_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
   ```
2. When collection starts or resumes, the active instance writes its token to `session.activeCoordinatorToken` in `chrome.storage.local`.
3. Before every DOM interaction, network delay, or queue commit, the worker invokes:
   ```ts
   if (!(await this.isCoordinatorAuthoritative())) {
     // Token mismatch: another tab or refreshed worker took ownership
     this.abortController?.abort();
     break;
   }
   ```
4. If a worker detects that its token is no longer authoritative, it self-terminates instantly and aborts pending work, guaranteeing that exactly **one** coordinator executes at any moment.

---

## 3. DOM Isolation via Closed Shadow DOM

To guarantee that DocuHarvest never conflicts with the host page’s CSS or scripts:
1. The collector UI is mounted into a dedicated host container: `<div id="docuharvest-root">`.
2. All UI markup and styles are encapsulated inside an open Shadow Root:
   ```ts
   this.shadow = this.host.attachShadow({ mode: 'open' });
   ```
3. All discovery heuristics, query selectors, and text extraction logic explicitly filter out `#docuharvest-root`:
   ```ts
   .filter(el => !el.closest('#docuharvest-root'))
   ```
4. Event propagation (`mousedown`, `mouseup`, `click`, `touchstart`) on the panel container is stopped so that dragging or interacting with the DocuHarvest panel never triggers website actions (such as closing modals, navigating away, or dismissing popups).

---

## 4. Multi-Stage Extraction Pipeline

When `extractCurrentPage()` executes on an active documentation page, it progresses through 8 defensive stages:

```
[1. Mutation Stabilization]
       |  Waits for dynamic rendering, frameworks, and syntax highlighters to settle
       v
[2. Viewport Auto-Scroll (Optional)]
       |  Triggers lazy-loaded images, diagrams, and defer-rendered blocks
       v
[3. Content Boundary Discovery]
       |  Heuristically locates main doc container (<main>, <article>, [role="main"])
       v
[4. Breadcrumb & Internal Link Extraction]
       |  Captures hierarchical navigation path and outgoing reference links
       v
[5. Accordion Expansion & Recording]
       |  Expands recognized disclosures; records clicked buttons for state reversal
       v
[6. Virtualized Container Traversal]
       |  Bounded scrolling of nested virtualized containers with item deduplication
       v
[7. Safe Multi-Tab Extraction]
       |  Inspects tab groups; verifies read-only safety; scopes panels to group container
       v
[8. Markdown Compilation & Completeness Audit]
          Converts DOM tree to Markdown; computes word count; flags completeness warnings
```

---

## 5. Defensive Interaction Guarantees

### Strict Accordion Qualification
DocuHarvest rejects generic buttons with `aria-expanded` unless they satisfy positive documentation criteria:
- Inside recognized accordion wrappers (`.accordion`, `.collapsible`, `.disclosure`, `.faq`, `details`).
- Button class contains disclosure tokens (`/\b(accordion|collapsible|disclosure)\b/i`).
- Button text explicitly indicates section disclosure (`/\b(toggle|expand|collapse)\s+(section|details|faq)\b/i`).
- Target element via `aria-controls` possesses a `region`, `tabpanel`, or `collapse` role/class.

### State Reversal
When expanding accordions, DocuHarvest records initial open/closed states. Upon completion (or abort), it **re-clicks** toggled buttons and resets `<details>.open` states, ensuring the user's host page DOM is cleanly restored.

### Strict Tab Containment
When reading multi-language tab groups (e.g. cURL vs. Python vs. Node.js):
- The extractor verifies that target panels belong strictly inside the tab group boundary (`groupContainer.contains(panel)`).
- Destructive tabs (containing `delete`, `drop`, `remove`, `logout`) are bypassed for safety.
- The initial active tab is restored after extraction.

---

## 6. Durable State Storage

All state is persisted in `chrome.storage.local` under the key:
`docuharvest_harvest_session_v1`

### Data Schema
- `HarvestSession`:
  - `status`: `'idle' | 'running' | 'paused' | 'stopped' | 'completed'`
  - `discoveredPages`: Map of canonical URLs to discovery metadata and statuses (`pending`, `in_progress`, `completed`, `partial`, `failed`, `skipped`).
  - `collectedPages`: Map of canonical URLs to full extracted page models.
  - `queue`: Ordered array of remaining URLs to process.
  - `config`: Operational parameters (rate limits, timeouts, auto-scroll, selector overrides).
  - `errors`: Bounded log of network, timeout, or parsing exceptions with retry tracking.
