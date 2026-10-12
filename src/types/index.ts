/**
 * DocuHarvest - Shared TypeScript Types and Configuration
 */

export type CollectionStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'completed'
  | 'error';

export type PageStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'skipped';

export interface TabExtractionRecord {
  tabGroupIndex: number;
  tabName: string;
  status: 'extracted' | 'unsafe' | 'empty';
  contentSnippet?: string;
  error?: string;
  restored?: boolean;
}

export interface DiscoveredPage {
  id: string;
  url: string;
  title: string;
  depth: number;
  status: PageStatus;
  discoveredAt: number;
  collectedAt?: number;
  error?: string;
  warning?: string;
  wordCount?: number;
  retryCount?: number;
  skippedReason?: string;
}

export interface CodeBlock {
  language: string;
  code: string;
}

export interface ExtractedImage {
  src: string;
  alt: string;
  caption?: string;
}

export interface SectionContent {
  heading: string;
  level: number;
  text: string;
  codeBlocks: CodeBlock[];
  tabs?: Array<{ tabName: string; content: string }>;
}

export type ContentBlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'table'
  | 'code'
  | 'callout'
  | 'tab_group'
  | 'image';

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  content: string;
  metadata?: {
    level?: number;
    language?: string;
    calloutType?: string;
    tableHeaders?: string[];
    tableRows?: string[][];
    tabs?: Array<{ tabName: string; content: string }>;
    src?: string;
    alt?: string;
    caption?: string;
  };
}

export interface CollectedPage {
  id: string;
  url: string;
  title: string;
  markdown: string;
  wordCount: number;
  headings: string[];
  sections: SectionContent[];
  breadcrumbs?: string[];
  contentBlocks?: ContentBlock[];
  internalLinks?: Array<{ text: string; url: string }>;
  notes?: string[];
  tabsExtracted?: TabExtractionRecord[];
  images?: ExtractedImage[];
  virtualizedItems?: Array<{ id: string; content: string }>;
  isComplete: boolean;
  warnings?: string[];
  extractedAt: number;
}

export interface HarvestConfig {
  /** Milliseconds delay between page navigations for graceful, authenticated harvesting */
  rateLimitMs: number;
  /** Whether to scroll through long pages to trigger lazy-loaded sections (default false to preserve reading position) */
  autoScroll: boolean;
  /** Whether to auto-expand collapsed <details> and accordion elements in content */
  expandAccordions: boolean;
  /** Whether to auto-expand collapsed sidebar navigation sections during discovery */
  expandSidebarGroups: boolean;
  /** Whether to detect and extract multi-tab code and content panels */
  captureTabs: boolean;
  /** Whether to only click safe, read-only documentation tabs */
  safeTabSwitching: boolean;
  /** Whether to detect and scroll nested virtualized containers */
  scrollVirtualizedContainers: boolean;
  /** Maximum virtual scrolling batch steps */
  maxVirtualScrollSteps: number;
  /** Maximum link depth for crawling (default 4) */
  maxDepth: number;
  /** Maximum retries per failed page */
  maxRetries: number;
  /** DOM stabilization wait time in ms */
  stabilizationTimeoutMs: number;
  /** Maximum page extraction timeout in ms */
  pageExtractionTimeoutMs: number;
  /** Enable SPA pushState/popstate route change interception */
  spaNavigationSupport: boolean;
  /** Base URL path prefix to scope crawling strictly to docs */
  urlPrefix: string;
  /** Custom selector for the documentation main content container */
  contentSelector?: string;
  /** Custom selector for the documentation navigation / sidebar container */
  sidebarSelector?: string;
}

export interface SessionError {
  url: string;
  message: string;
  timestamp: number;
  retryable: boolean;
}

export interface HarvestSession {
  id: string;
  status: CollectionStatus;
  currentUrl: string;
  currentPageName: string;
  currentOperation: string;
  progressPercentage: number;
  discoveredPages: Record<string, DiscoveredPage>;
  collectedPages: Record<string, CollectedPage>;
  pagesOrder: string[];
  queue: string[];
  activeTargetUrl: string | null;
  activeCoordinatorToken: string | null;
  activeTabId?: number | null;
  startedAt?: number;
  completedAt?: number;
  updatedAt: number;
  panelMinimized: boolean;
  panelQueueVisible: boolean;
  panelSettingsVisible?: boolean;
  previewPageUrl: string | null;
  panelPosition: { x: number; y: number };
  config: HarvestConfig;
  errors: SessionError[];
  lastError?: string;
  storageError?: string | null;
}

export interface SessionStats {
  discovered: number;
  collected: number;
  remaining: number;
  failed: number;
  skipped: number;
  totalWords: number;
  progressPercentage: number;
}

export interface PanelEvents {
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReset: () => void;
  onClearData: () => void;
  onExportMarkdown: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onToggleMinimize: () => void;
  onToggleQueue: () => void;
  onToggleSettings?: () => void;
  onPreviewPage: (url: string | null) => void;
  onPositionChange: (pos: { x: number; y: number }) => void;
  onRetryPage?: (url: string) => void;
  onSkipPage?: (url: string) => void;
  onPrioritizePage?: (url: string) => void;
  onSkipAllPending?: () => void;
  onRetryAllFailed?: () => void;
  onUpdateConfig?: (cfg: Partial<HarvestConfig>) => void;
  onCopyMarkdown?: () => void;
  onClose?: () => void;
}
