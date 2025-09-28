/**
 * TruthLens Content Script
 * Handles text selection, page parsing, and basic message passing
 */

import type {
  ContentToServiceWorkerMessage,
  ServiceWorkerToContentMessage
} from '../lib/types/messages.js';

// Initialize content script
console.debug('[TruthLens Content] Initializing...');

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((message: ServiceWorkerToContentMessage, _sender, sendResponse) => {
  console.debug('[TruthLens Content] Received message:', message.type);

  try {
    handleMessage(message);
    sendResponse({ success: true, timestamp: Date.now() });
  } catch (error) {
    console.error('[TruthLens Content] Error handling message:', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now()
    });
  }

  return true; // Async response
});

/**
 * Handle messages from service worker
 */
function handleMessage(message: ServiceWorkerToContentMessage): void {
  switch (message.type) {
    case 'TL_GET_SELECTION':
      handleGetSelection(message.payload?.action);
      break;
      
    case 'TL_GET_PAGE_TEXT':
      handleGetPageText(message.payload?.action);
      break;
      
    case 'TL_INJECT_SERP_OVERLAY':
      handleInjectSerpOverlay(message.payload?.overlayHtml);
      break;
      
    case 'TL_SHOW_SELECTION_BUBBLE':
      handleShowSelectionBubble(message.payload?.position);
      break;
      
    default:
      console.warn('[TruthLens Content] Unknown message type:', message.type);
  }
}

/**
 * Get selected text and send to service worker
 */
function handleGetSelection(action: 'fact-check' | 'ask-analyst' = 'fact-check'): void {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim();
  
  if (!selectedText) {
    console.warn('[TruthLens Content] No text selected');
    return;
  }
  
  console.debug('[TruthLens Content] Selected text:', selectedText.substring(0, 100) + '...');
  
  sendMessageToServiceWorker({
    type: 'TL_GET_SELECTION',
    payload: {
      text: selectedText,
      url: window.location.href,
      action
    }
  });
}

/**
 * Get page text and send to service worker
 */
function handleGetPageText(action: 'fact-check' | 'ask-analyst' = 'fact-check'): void {
  // Extract main content text from the page
  const pageText = extractPageText();
  
  if (!pageText) {
    console.warn('[TruthLens Content] No page text found');
    return;
  }
  
  console.debug('[TruthLens Content] Page text extracted:', pageText.substring(0, 100) + '...');
  
  sendMessageToServiceWorker({
    type: 'TL_GET_PAGE_TEXT',
    payload: {
      text: pageText,
      url: window.location.href,
      action
    }
  });
}

/**
 * Extract main text content from the page
 */
function extractPageText(): string {
  // Try to find main content areas
  const contentSelectors = [
    'main',
    'article',
    '[role="main"]',
    '.content',
    '.post-content',
    '.entry-content',
    '.article-content',
    '#content'
  ];
  
  let content = '';
  
  // Try each selector
  for (const selector of contentSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      content = extractTextFromElement(element);
      if (content.length > 100) {
        break;
      }
    }
  }
  
  // Fallback to body if no main content found
  if (!content || content.length < 100) {
    content = extractTextFromElement(document.body);
  }
  
  // Clean and limit the text
  return content
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 5000); // Limit to 5000 characters
}

/**
 * Extract text from an element, excluding scripts and styles
 */
function extractTextFromElement(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  
  // Remove script and style elements
  const scriptsAndStyles = clone.querySelectorAll('script, style, nav, header, footer, aside');
  scriptsAndStyles.forEach(el => el.remove());
  
  return clone.textContent || '';
}

/**
 * Handle SERP overlay injection (for Google Search pages)
 */
function handleInjectSerpOverlay(overlayHtml?: string): void {
  if (!overlayHtml) {
    console.warn('[TruthLens Content] No overlay HTML provided');
    return;
  }
  
  // Check if we're on a Google search page
  if (!window.location.hostname.includes('google.com')) {
    console.warn('[TruthLens Content] Not on Google search page');
    return;
  }
  
  const searchContainer = document.querySelector('#search');
  if (!searchContainer) {
    console.warn('[TruthLens Content] Search container not found');
    return;
  }
  
  // Remove existing TruthLens overlay
  const existingOverlay = document.getElementById('truthlens-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }
  
  // Create and inject new overlay
  const overlay = document.createElement('div');
  overlay.id = 'truthlens-overlay';
  overlay.innerHTML = overlayHtml;
  
  // Insert at the beginning of search results
  searchContainer.insertBefore(overlay, searchContainer.firstChild);
  
  console.debug('[TruthLens Content] SERP overlay injected');
}

/**
 * Handle selection bubble display
 */
function handleShowSelectionBubble(position?: { x: number; y: number }): void {
  // Remove existing bubble
  const existingBubble = document.getElementById('truthlens-selection-bubble');
  if (existingBubble) {
    existingBubble.remove();
  }
  
  const selection = window.getSelection();
  if (!selection || selection.toString().trim().length === 0) {
    return;
  }
  
  // Create bubble
  const bubble = document.createElement('div');
  bubble.id = 'truthlens-selection-bubble';
  bubble.innerHTML = `
    <div style="
      position: absolute;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      padding: 8px;
      display: flex;
      gap: 8px;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
    ">
      <button id="tl-fact-check-btn" style="
        background: #3b82f6;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
      ">Fact-check</button>
      <button id="tl-ask-analyst-btn" style="
        background: #10b981;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
      ">Ask analyst</button>
    </div>
  `;
  
  // Position bubble
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const bubbleElement = bubble.firstElementChild as HTMLElement;
  
  if (position) {
    bubbleElement.style.left = `${position.x}px`;
    bubbleElement.style.top = `${position.y}px`;
  } else {
    bubbleElement.style.left = `${rect.left + window.scrollX}px`;
    bubbleElement.style.top = `${rect.bottom + window.scrollY + 5}px`;
  }
  
  // Add event listeners
  const factCheckBtn = bubble.querySelector('#tl-fact-check-btn');
  const askAnalystBtn = bubble.querySelector('#tl-ask-analyst-btn');
  
  factCheckBtn?.addEventListener('click', () => {
    handleGetSelection('fact-check');
    bubble.remove();
  });
  
  askAnalystBtn?.addEventListener('click', () => {
    handleGetSelection('ask-analyst');
    bubble.remove();
  });
  
  // Remove bubble when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (!bubble.contains(e.target as Node)) {
      bubble.remove();
    }
  }, { once: true });
  
  document.body.appendChild(bubble);
  
  console.debug('[TruthLens Content] Selection bubble shown');
}

/**
 * Send message to service worker
 */
function sendMessageToServiceWorker(message: ContentToServiceWorkerMessage): void {
  chrome.runtime.sendMessage({
    ...message,
    timestamp: Date.now()
  }).catch(error => {
    console.error('[TruthLens Content] Error sending message to service worker:', error);
  });
}

// Show selection bubble on text selection
document.addEventListener('mouseup', () => {
  const selection = window.getSelection();
  if (selection && selection.toString().trim().length > 10) {
    // Small delay to ensure selection is complete
    setTimeout(() => {
      handleShowSelectionBubble();
    }, 100);
  }
});

console.debug('[TruthLens Content] Initialized');
