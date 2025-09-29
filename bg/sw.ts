/**
 * TruthLens Service Worker
 * Handles context menus, keyboard shortcuts, capability checks, and message routing
 */

// Type definitions for Chrome extension messaging
interface TruthLensMessage {
  type: string;
  timestamp?: number;
  payload?: any;
}

interface ChromeAICapabilities {
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

interface ServiceWorkerToPanelMessage extends TruthLensMessage {
  type: 'TL_FACT_CHECK_RESULT' | 'TL_CHAT_RESPONSE' | 'TL_BRIEF_UPDATE' | 'TL_CAPABILITIES_UPDATE' | 'TL_CHAT_OPEN' | 'TL_TEXT_EXTRACTED' | 'TL_CAPABILITY_STATUS';
  tabId?: number;
}

interface ServiceWorkerToContentMessage extends TruthLensMessage {
  type:
    | 'TL_GET_SELECTION'
    | 'TL_GET_PAGE_TEXT'
    | 'TL_INJECT_SERP_OVERLAY'
    | 'TL_SHOW_SELECTION_BUBBLE'
    | 'TL_CHECK_CAPABILITIES'
    | 'TL_ONDEVICE_PROMPT'
    | 'TL_EXTRACT_CLAIMS';
}

interface TruthLensResponse {
  success: boolean;
  timestamp: number;
  data?: any;
  error?: any;
}

interface SerpResult {
  title: string;
  url: string;
  snippet: string;
}

// Context menu IDs
const CONTEXT_MENU_IDS = {
  FACT_CHECK_SELECTION: 'tl-fc-sel',
  FACT_CHECK_PAGE: 'tl-fc-page',
  ASK_ANALYST: 'tl-chat'
} as const;

// Keyboard command IDs
const COMMAND_IDS = {
  TOGGLE_PANEL: 'toggle-panel',
  FACT_CHECK_SELECTION: 'fact-check-selection',
  ASK_ANALYST: 'ask-analyst'
} as const;

/**
 * Initialize service worker
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.debug('[TruthLens] Service worker installed');
  await setupContextMenus();
  await checkCapabilities();
});

chrome.runtime.onStartup.addListener(async () => {
  console.debug('[TruthLens] Service worker started');
  await setupContextMenus();
  await checkCapabilities();
});

/**
 * Set up context menus
 */
async function setupContextMenus(): Promise<void> {
  try {
    // Remove existing menus to avoid duplicates
    await chrome.contextMenus.removeAll();

    // Create context menus
    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.FACT_CHECK_SELECTION,
      title: 'Fact-check with TruthLens',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.FACT_CHECK_PAGE,
      title: 'Fact-check this page',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.ASK_ANALYST,
      title: 'Ask analyst (TruthLens)',
      contexts: ['page', 'selection']
    });

    console.debug('[TruthLens] Context menus created');
  } catch (error) {
    console.error('[TruthLens] Error setting up context menus:', error);
  }
}

/**
 * Best-effort panel opener.
 * Tries side panel; if Chrome requires a direct user gesture, falls back to a popup window.
 */
async function openPanelForTab(tabId: number): Promise<void> {
  try {
    await chrome.sidePanel.open({ tabId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg?.includes('only be called in response to a user gesture')) {
      try {
        const url = chrome.runtime.getURL('panel/index.html');
        await chrome.windows.create({ url, type: 'popup', width: 420, height: 700 });
      } catch (popupErr) {
        console.error('[TruthLens] Popup fallback failed:', popupErr);
      }
    } else {
      console.debug('[TruthLens] sidePanel.open failed (may already be open):', err);
    }
  }
}

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) {
    console.error('[TruthLens] No tab ID available');
    return;
  }

  try {
    // Open side panel or popup fallback
    await openPanelForTab(tab.id);

    // Send appropriate message based on menu item
    switch (info.menuItemId) {
      case CONTEXT_MENU_IDS.FACT_CHECK_SELECTION:
        await sendMessageToContent(tab.id, {
          type: 'TL_GET_SELECTION',
          payload: { action: 'fact-check' }
        });
        break;

      case CONTEXT_MENU_IDS.FACT_CHECK_PAGE:
        await sendMessageToContent(tab.id, {
          type: 'TL_GET_PAGE_TEXT',
          payload: { action: 'fact-check' }
        });
        break;

      case CONTEXT_MENU_IDS.ASK_ANALYST:
        if (info.selectionText) {
          await sendMessageToContent(tab.id, {
            type: 'TL_GET_SELECTION',
            payload: { action: 'ask-analyst' }
          });
        } else {
          await sendMessageToPanel({
            type: 'TL_CHAT_OPEN',
            tabId: tab.id
          });
        }
        break;
    }
  } catch (error) {
    console.error('[TruthLens] Error handling context menu click:', error);
  }
});

/**
 * Handle keyboard commands
 */
chrome.commands.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      console.error('[TruthLens] No active tab found');
      return;
    }

    switch (command) {
      case COMMAND_IDS.TOGGLE_PANEL:
        await openPanelForTab(tab.id);
        break;

      case COMMAND_IDS.FACT_CHECK_SELECTION:
        await openPanelForTab(tab.id);
        await sendMessageToContent(tab.id, {
          type: 'TL_GET_SELECTION',
          payload: { action: 'fact-check' }
        });
        break;

      case COMMAND_IDS.ASK_ANALYST:
        await openPanelForTab(tab.id);
        await sendMessageToContent(tab.id, {
          type: 'TL_GET_SELECTION',
          payload: { action: 'ask-analyst' }
        });
        break;
    }
  } catch (error) {
    console.error('[TruthLens] Error handling keyboard command:', error);
  }
});

/**
 * Handle incoming messages
 */
async function processIncomingMessage(
  message: TruthLensMessage,
  sender: chrome.runtime.MessageSender
): Promise<TruthLensResponse> {
  console.debug('[TruthLens] Received message:', message.type, message);

  switch (message.type) {
    case 'TL_GET_SELECTION':
    case 'TL_GET_PAGE_TEXT':
      // Ensure side panel is open for this tab, then forward to panel
      if (sender.tab?.id) {
        try {
          await openPanelForTab(sender.tab.id);
        } catch (e) {
          console.debug('[TruthLens] Could not open side panel/popup:', e);
        }
      }
      if (sender.tab?.id && message.payload) {
        const payload = message.payload as { text?: string; url?: string; action?: 'fact-check' | 'ask-analyst' };
        await sendMessageToPanel({
          type: 'TL_TEXT_EXTRACTED',
          payload: {
            text: payload.text,
            url: payload.url,
            action: payload.action
          },
          tabId: sender.tab.id
        });
      }
      return { success: true, timestamp: Date.now() };

    case 'TL_SERP_PARSED':
      // Forward SERP results to panel
      if (sender.tab?.id && message.payload) {
        const payload = message.payload as { serpResults?: SerpResult[]; url?: string; action?: 'fact-check' | 'ask-analyst' };
        await sendMessageToPanel({
          type: 'TL_TEXT_EXTRACTED',
          payload: {
            serpResults: payload.serpResults,
            url: payload.url,
            action: payload.action
          },
          tabId: sender.tab.id
        });
      }
      return { success: true, timestamp: Date.now() };

    case 'TL_REQUEST_CAPABILITIES':
      const capabilities = await checkCapabilities();
      if (sender.tab?.id) {
        await sendMessageToPanel({
          type: 'TL_CAPABILITY_STATUS',
          payload: { capabilities },
          tabId: sender.tab.id
        });
      }
      return { success: true, data: capabilities, timestamp: Date.now() };

    default:
      console.warn('[TruthLens] Unknown message type:', message.type);
      return {
        success: false,
        error: {
          code: 'UNKNOWN_MESSAGE_TYPE',
          message: `Unknown message type: ${message.type}`,
          timestamp: Date.now()
        },
        timestamp: Date.now()
      };
  }
}

/**
 * Handle messages from content scripts and panel
 */
chrome.runtime.onMessage.addListener((message: TruthLensMessage, sender, sendResponse) => {
  processIncomingMessage(message, sender)
    .then(response => sendResponse(response))
    .catch(error => {
      console.error('[TruthLens] Error handling message:', error);
      sendResponse({
        success: false,
        error: {
          code: 'MESSAGE_HANDLER_ERROR',
          message: error.message,
          timestamp: Date.now()
        },
        timestamp: Date.now()
      } as TruthLensResponse);
    });

  // Return true to indicate async response
  return true;
});

/**
 * Check Chrome AI capabilities
 */
async function checkCapabilities(): Promise<ChromeAICapabilities> {
  const capabilities: ChromeAICapabilities = {
    promptAPI: { available: false },
    summarizerAPI: { available: false },
    writerAPI: { available: false },
    rewriterAPI: { available: false }
  };

  try {
    // Get active tab to request capabilities from content script
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      console.debug('[TruthLens] No active tab found, using default capabilities');
      return capabilities;
    }

    // Request capabilities from content script (where window.ai is available)
    const response = await chrome.tabs.sendMessage(tabs[0].id, {
      type: 'TL_CHECK_CAPABILITIES',
      timestamp: Date.now()
    });

    if (response && response.capabilities) {
      console.debug('[TruthLens] AI capabilities received from content script:', response.capabilities);
      return response.capabilities;
    } else {
      console.debug('[TruthLens] No capabilities response from content script, using defaults');
      return capabilities;
    }
  } catch (error) {
    console.debug('[TruthLens] Error requesting capabilities from content script:', error);
  }

  console.debug('[TruthLens] AI capabilities:', capabilities);
  return capabilities;
}

/**
 * Send message to content script
 */
async function sendMessageToContent(
  tabId: number,
  message: ServiceWorkerToContentMessage
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      ...message,
      timestamp: Date.now()
    });
  } catch (error) {
    // Try to inject the content script and retry once
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] });
      await chrome.tabs.sendMessage(tabId, { ...message, timestamp: Date.now() });
    } catch (e) {
      console.error('[TruthLens] Error sending message to content script:', e);
    }
  }
}

/**
 * Send message to panel
 */
async function sendMessageToPanel(message: ServiceWorkerToPanelMessage): Promise<void> {
  const payload = { ...message, timestamp: Date.now() };
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await chrome.runtime.sendMessage(payload);
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        console.debug('[TruthLens] Could not reach panel after retries; panel may not be open yet.', error);
        return;
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }
}
