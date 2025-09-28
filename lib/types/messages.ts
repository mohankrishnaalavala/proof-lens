/**
 * Message types for TruthLens Chrome Extension
 * Defines interfaces for communication between content scripts, service worker, and panel
 */

// Base message interface
export interface TruthLensMessage {
  type: string;
  payload?: any;
  tabId?: number;
  timestamp?: number;
}

// Content script to service worker messages
export interface ContentToServiceWorkerMessage extends TruthLensMessage {
  type: 
    | 'TL_GET_SELECTION'
    | 'TL_GET_PAGE_TEXT'
    | 'TL_SERP_PARSED'
    | 'TL_SELECTION_BUBBLE_CLICKED';
  payload?: {
    text?: string;
    url?: string;
    query?: string;
    results?: SerpResult[];
    serpResults?: SerpResult[];
    action?: 'fact-check' | 'ask-analyst';
  };
}

// Service worker to panel messages
export interface ServiceWorkerToPanelMessage extends TruthLensMessage {
  type:
    | 'TL_CHAT_OPEN'
    | 'TL_FACT_CHECK_REQUEST'
    | 'TL_TEXT_EXTRACTED'
    | 'TL_CAPABILITY_STATUS';
  payload?: {
    text?: string | undefined;
    url?: string | undefined;
    capabilities?: ChromeAICapabilities | undefined;
    action?: 'fact-check' | 'ask-analyst' | undefined;
    serpResults?: SerpResult[] | undefined;
  };
}

// Panel to service worker messages
export interface PanelToServiceWorkerMessage extends TruthLensMessage {
  type:
    | 'TL_PANEL_READY'
    | 'TL_REQUEST_CAPABILITIES'
    | 'TL_FACT_CHECK_SUBMIT'
    | 'TL_CHAT_SUBMIT';
  payload?: {
    text?: string;
    claimId?: string;
    chatMessage?: string;
  };
}

// Service worker to content script messages
export interface ServiceWorkerToContentMessage extends TruthLensMessage {
  type:
    | 'TL_GET_SELECTION'
    | 'TL_GET_PAGE_TEXT'
    | 'TL_INJECT_SERP_OVERLAY'
    | 'TL_SHOW_SELECTION_BUBBLE'
    | 'TL_CHECK_CAPABILITIES';
  payload?: {
    overlayHtml?: string;
    position?: { x: number; y: number };
    action?: 'fact-check' | 'ask-analyst';
  };
}

// Union type for all messages
export type AllTruthLensMessages = 
  | ContentToServiceWorkerMessage
  | ServiceWorkerToPanelMessage
  | PanelToServiceWorkerMessage
  | ServiceWorkerToContentMessage;

// Chrome AI capabilities interface
export interface ChromeAICapabilities {
  promptAPI: {
    available: boolean;
    defaultTemperature?: number;
    defaultTopK?: number;
    maxTopK?: number;
  };
  summarizerAPI: {
    available: boolean;
    defaultType?: string;
    defaultFormat?: string;
    defaultLength?: string;
  };
  writerAPI: {
    available: boolean;
    defaultTone?: string;
    defaultFormat?: string;
    defaultLength?: string;
  };
  rewriterAPI: {
    available: boolean;
    defaultTone?: string;
    defaultFormat?: string;
    defaultLength?: string;
  };
}

// SERP result interface
export interface SerpResult {
  title: string;
  url: string;
  snippet: string;
  position?: number;
}

// Fact check related interfaces
export interface ClaimReview {
  publisher: string;
  url: string;
  title: string;
  reviewDate?: string;
  textualRating: string;
  languageCode?: string;
}

export interface FactCheckResult {
  claim: string;
  claimId: string;
  reviews: ClaimReview[];
  evidenceScore: number;
  evidenceBand: 'Low' | 'Medium' | 'High';
  lastChecked: number;
  cached?: boolean;
}

// Chat related interfaces
export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
  source: 'on-device' | 'cloud';
  context?: string;
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// Export related interfaces
export interface BriefSection {
  type: 'facts' | 'analysis' | 'recommendations';
  title: string;
  content: string;
  citations?: string[];
}

export interface DecisionBrief {
  id: string;
  title: string;
  sections: BriefSection[];
  createdAt: number;
  metadata: {
    sourceUrl?: string;
    factChecksCount: number;
    chatMessagesCount: number;
  };
}

// Error handling
export interface TruthLensError {
  code: string;
  message: string;
  details?: any;
  timestamp: number;
}

// AI Adapter result types
export interface AIResult {
  response: string;
  source: 'on-device' | 'cloud';
  timestamp: number;
  sessionId?: string;
  model?: string;
  tokensUsed?: number;
}



export interface EvidenceScore {
  score: number;
  band: 'Low' | 'Medium' | 'High';
  breakdown: {
    publisherDiversity: number;
    recency: number;
    corroboration: number;
    counterClaims: number;
  };
  explanation: string[];
}

// Response wrapper
export interface TruthLensResponse<T = any> {
  success: boolean;
  data?: T;
  error?: TruthLensError;
  timestamp: number;
}
