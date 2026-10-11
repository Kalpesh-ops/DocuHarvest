# Project Octahedron — Live Acceptance Validation Protocol

This document outlines the acceptance criteria and verification protocol for certifying DocuHarvest on authenticated, multi-page enterprise documentation sites (such as Project Octahedron).

---

## Acceptance Criteria Matrix

| Criterion | Verification Method | Pass Threshold |
|---|---|---|
| **1. Authentication Preservation** | Inspect collected content for paywall / login redirects | 0 login prompts; all pages show authenticated rendered text |
| **2. Sidebar Alignment** | Compare discovered queue URLs with sidebar DOM elements | 100% of internal doc sidebar links present in queue |
| **3. Content Fidelity** | Spot-check 5 representative pages against rendered DOM | Code blocks, tables, callouts, and lists match 1:1 |
| **4. Accordion Integrity** | Inspect collapsible sections during and after extraction | Collapsed accordions expand for extraction and restore to initial state |
| **5. Tab Scope Containment** | Verify multi-language code snippets across languages | Each language tab (e.g. Python, cURL, TS) captured under its section; 0 destructive clicks |
| **6. Cancellation Reliability**| Test Stop and Pause during in-progress page delays | Delays terminate immediately; queue does not commit duplicate or corrupted data |
| **7. Reload Recovery** | Refresh page mid-collection during active run | Stored token and progress load seamlessly; offers Resume without data loss |
| **8. Export Completeness** | Audit `documentation-bundle.md` metadata & audit tables | Completeness status accurately reflects zero deficits or enumerates specific warnings |

---

## Step-by-Step Validation Procedure

### Preparation
1. Clean previous collection state:
   - Click **Reset / Clear Data** in the DocuHarvest panel.
2. Confirm extension version:
   - Verify `v0.1.0` is loaded in `chrome://extensions` from `.output/chrome-mv3`.

### Phase 1: Navigation & Discovery Audit
1. Navigate to the authenticated Project Octahedron root URL.
2. Open Chrome DevTools (`F12`) Console to observe collector telemetry.
3. Click the DocuHarvest icon to mount the panel.
4. Click **Discover Pages**.
5. Open the **Queue Drawer** and verify:
   - Total discovered page count matches the visible documentation structure.
   - Non-doc URLs (e.g. `/app/dashboard`, `/settings`, `/logout`) are omitted.
   - All canonical URLs share the configured base origin and path prefix.

### Phase 2: Live Harvest Execution
1. Click **Start Harvest**.
2. **Observe Queue Advancement**:
   - Status indicators update: Amber (`in_progress`) -> Green (`completed`) or Orange (`partial`).
   - Words compiled and progress bar increment smoothly.
3. **Mid-Run Pause Test**:
   - When queue reaches ~25%, click **Pause**.
   - Verify that all scrolling and delays halt immediately.
   - Verify no new pages are pulled from the queue while paused.
   - Click **Resume**; verify collection continues with the next pending page.
4. **Mid-Run Reload Test**:
   - When queue reaches ~50%, trigger a full browser refresh (`F5` or `Ctrl+R`).
   - Upon reload, verify that the DocuHarvest panel reappears with saved progress intact.
   - Verify that clicking **Resume** continues from where it left off.

### Phase 3: Export Audit & Integrity Inspection
1. Once collection reaches 100% (`Completed`), download all three files:
   - `documentation-bundle.md`
   - `documentation-bundle.json`
   - `documentation-bundle.csv`
2. Open `documentation-bundle.md` in a Markdown viewer or editor:
   - **Completeness Header**: Check that the completeness line accurately reflects the run:
     `> **Completeness:** No known incomplete pages or warnings (all discovered pages fully extracted)`
   - **Backtick Code Fences**: Verify that code blocks containing backticks are enclosed in extended fences (` ```` ` or longer) and not broken into unformatted text.
   - **Tables & Callouts**: Verify that parameter tables have valid columns and notes are formatted with `> [!NOTE]`.
   - **Audit Section**: Inspect the bottom **Collection & Audit Report** summary table.

### Sign-Off
Record the run timestamp, target URL prefix, total discovered pages, and compiled word count in your validation log to qualify the build for production use.
