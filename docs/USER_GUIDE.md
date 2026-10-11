# DocuHarvest — User Guide & AI Ingestion Playbook

This guide covers everything you need to install DocuHarvest, collect documentation across authenticated sessions, and feed the compiled bundles into AI agents.

---

## 1. Installation

DocuHarvest is distributed as an unpacked Manifest V3 Chrome Extension.

### Quick Install (From Source)
1. Clone or download the repository:
   ```bash
   git clone https://github.com/Kalpesh-ops/DocuHarvest.git
   cd DocuHarvest
   ```
2. Build the production extension:
   ```bash
   npm install
   npm run build
   ```
3. Open Google Chrome (or Chromium, Brave, Edge).
4. Navigate to `chrome://extensions`.
5. Toggle **Developer mode** in the upper-right corner.
6. Click **Load unpacked** in the upper-left corner.
7. Select the build output directory:
   ```
   <repo-root>/.output/chrome-mv3
   ```
8. The **DocuHarvest** icon will appear in your Chrome toolbar. Pin it for easy access.

---

## 2. Using the Collector

### Step 1: Navigate to Your Documentation Site
Open the target website in Chrome and ensure you are logged in if the content requires authentication (e.g. internal corporate wikis, enterprise developer portals, Project Octahedron).

### Step 2: Inject the Collector Panel
Click the DocuHarvest icon in your Chrome toolbar. A floating glassmorphism panel will appear in the top-right corner of the page.
- **Move Panel**: Drag the panel by its header bar to reposition it anywhere on your screen.
- **Minimize**: Click the `_` icon to shrink the panel into a compact badge while reading.

### Step 3: Discover Pages
1. In the panel, verify the detected **Start URL** and **URL Prefix Restriction** (e.g. `https://docs.example.com/api`).
2. Click **Discover Pages**.
3. DocuHarvest scans the sidebar, navigation hierarchy, and section links, populating the queue.
4. Click **Inspect Queue** to open the queue drawer:
   - View pending, in-progress, completed, and skipped pages.
   - Click **Skip** on any URL you want to exclude from collection.
   - Click **Retry** on any page that encountered an error.

### Step 4: Run Collection
1. Click **Start Harvest**.
2. DocuHarvest navigates through each page in the queue:
   - Automatically handles client-side SPA routing.
   - Smoothly auto-scrolls to trigger lazy images and code highlighters.
   - Expands documentation accordions and FAQs, recording original states.
   - Switches between code snippet tabs (cURL, Python, Node.js, Go) and captures each code variant.
   - Reverses interactive DOM changes after extraction.
3. Use **Pause** or **Stop** anytime. Progress is saved continuously to `chrome.storage.local`.

---

## 3. Configuration Options

Click the gear icon (or customize `session.config`) to tune extraction behavior:

| Setting | Default | Description |
|---|---|---|
| `urlPrefix` | Detected origin/path | Restricts discovery to the documentation subtree to prevent navigating off-site |
| `rateLimitMs` | `1200ms` | Polite pause between consecutive page extractions to prevent rate limiting |
| `autoScroll` | `false` | Smoothly scrolls viewport to trigger lazy images and dynamically rendered DOM |
| `expandAccordions` | `true` | Expands recognized documentation accordions; restores states after extraction |
| `captureTabs` | `true` | Detects multi-tab code widgets and records content for each tab |
| `safeTabSwitching` | `true` | Interactively activates tabs when hidden content is not accessible in the initial DOM |
| `scrollVirtualized`| `true` | Traverses virtualized containers and accumulates unmounting batches |
| `maxVirtualSteps` | `8` | Maximum scroll steps for virtualized containers before proceeding |
| `stabilizationTimeoutMs` | `3000ms` | Time allowed for hydration, dynamic rendering, and script execution to settle |
| `pageExtractionTimeoutMs` | `15000ms`| Maximum duration for extracting a single page before timing out and advancing queue |

---

## 4. Exporting Your Knowledge Bundle

Once collection finishes, download your documentation in any of three formats:

### 1. `documentation-bundle.md` (Recommended for AI Agents)
- **Use Case**: Primary knowledge context for ChatGPT, Claude, Gemini, or local LLMs (Ollama, vLLM).
- **Features**:
  - YAML frontmatter with collection metadata.
  - Formatted heading hierarchy with anchor links.
  - Safe CommonMark variable backtick code blocks (` ``` `, ` ```` `, ` ````` `).
  - Clean GitHub Flavored Markdown tables.
  - Converted callouts (`[!NOTE]`, `[!WARNING]`, `[!TIP]`).
  - Comprehensive **Collection & Audit Report** verifying completeness.

### 2. `documentation-bundle.json` (Structured Data)
- **Use Case**: Programmatic ingestion, custom RAG vector chunking, and database indexing.
- **Payload**: Full page tree, structured headings, breadcrumbs, tab extraction records, and image metadata.

### 3. `documentation-bundle.csv` (Tabular Analysis)
- **Use Case**: Spreadsheets, metadata auditing, and quick tabular filtering.
- **Format**: RFC 4180 compliant CSV.

---

## 5. Feeding the Bundle to AI Agents

### Example Prompt for Claude / Gemini / GPT-4
```markdown
I have attached the complete documentation bundle collected via DocuHarvest:
[Attach documentation-bundle.md]

Please act as a senior implementation engineer.
Using exclusively the attached documentation:
1. Review the architecture guidelines and API requirements.
2. Formulate a step-by-step implementation plan for [Your Feature Name].
3. Generate production-ready code with complete error handling matching the documented patterns.
```

### RAG Chunking Tip
Because `documentation-bundle.md` preserves clear heading hierarchies (`#`, `##`, `###`) and section dividers (`---`), chunking by Markdown headings preserves semantic boundaries and eliminates broken context snippets.
