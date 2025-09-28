/**
 * TruthLens Content Script
 * Handles text selection, page parsing, SERP overlay, and message passing
 */

import type {
  ContentToServiceWorkerMessage,
  ServiceWorkerToContentMessage
} from '../lib/types/messages.js';

// Global state
let selectionBubbleTimeout: NodeJS.Timeout | null = null;
let lastSelection: string = '';
let isGoogleSearchPage = false;

// Initialize content script
console.debug('[TruthLens Content] Initializing...');

// Detect page type
isGoogleSearchPage = window.location.hostname.includes('google.com') &&
                    window.location.pathname === '/search';

if (isGoogleSearchPage) {
  console.debug('[TruthLens Content] Google Search page detected');
  initializeGoogleSearchFeatures();
}

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
  // Special handling for Google Search pages
  if (isGoogleSearchPage) {
    return extractGoogleSearchText();
  }

  // Try to find main content areas
  const contentSelectors = [
    'main',
    'article',
    '[role="main"]',
    '.content',
    '.post-content',
    '.entry-content',
    '.article-content',
    '#content',
    // Social media specific selectors
    '[data-testid="tweetText"]', // Twitter
    '[data-ad-preview="message"]', // Facebook
    '.usertext-body', // Reddit
    '.watch-active-metadata', // YouTube
  ];

  let content = '';

  // Try each selector
  for (const selector of contentSelectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      content = Array.from(elements)
        .map(el => extractTextFromElement(el))
        .join('\n\n')
        .trim();
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
  return cleanExtractedText(content);
}

/**
 * Extract text from Google Search page (query and top results)
 */
function extractGoogleSearchText(): string {
  const query = getSearchQuery();
  const results = parseSerp();

  let content = `Search Query: ${query}\n\n`;

  if (results.length > 0) {
    content += 'Top Search Results:\n';
    results.forEach((result, index) => {
      content += `${index + 1}. ${result.title}\n`;
      if (result.snippet) {
        content += `   ${result.snippet}\n`;
      }
      content += `   Source: ${result.url}\n\n`;
    });
  }

  return cleanExtractedText(content);
}

/**
 * Get the search query from Google Search page
 */
function getSearchQuery(): string {
  const queryInput = document.querySelector('input[name="q"]') as HTMLInputElement;
  return queryInput?.value || '';
}

/**
 * Clean extracted text
 */
function cleanExtractedText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim()
    .substring(0, 8000); // Increased limit for search results
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
 * Parse Google SERP to extract search results
 * Implementation based on TRUTHLENS_SPEC.md section 5.3
 */
function parseSerp(): Array<{ title: string; url: string; snippet: string }> {
  if (!isGoogleSearchPage) {
    return [];
  }

  try {
    // Extract organic search results using the spec selector
    const items = [...document.querySelectorAll("#search a h3")]
      .slice(0, 6)
      .map(h3 => {
        const a = h3.closest("a");
        const title = h3.textContent || '';
        const url = a?.href || '';

        // Find snippet - look for description text near the link
        let snippet = '';
        const parent = a?.parentElement;
        if (parent) {
          // Try to find the snippet in various possible locations
          const snippetElement = parent.querySelector('[data-sncf]') ||
                                 parent.querySelector('.VwiC3b') ||
                                 parent.querySelector('.s3v9rd') ||
                                 parent.nextElementSibling?.querySelector('.VwiC3b') ||
                                 parent.nextElementSibling?.querySelector('.s3v9rd');

          snippet = snippetElement?.textContent || '';

          // Fallback: look for any text content in the parent's siblings
          if (!snippet && parent.nextElementSibling) {
            const textContent = parent.nextElementSibling.textContent || '';
            // Take first reasonable chunk of text (not just dates or short fragments)
            const sentences = textContent.split('.').filter(s => s.trim().length > 20);
            snippet = sentences.slice(0, 2).join('.').trim();
            if (snippet && !snippet.endsWith('.')) {
              snippet += '.';
            }
          }
        }

        return {
          title: title.trim(),
          url: url.trim(),
          snippet: snippet.trim()
        };
      })
      .filter(item => item.title && item.url); // Only include items with title and URL

    console.debug('[TruthLens Content] Parsed SERP results:', items.length);
    return items;
  } catch (error) {
    console.error('[TruthLens Content] Error parsing SERP:', error);
    return [];
  }
}

/**
 * Initialize Google Search specific features
 */
function initializeGoogleSearchFeatures(): void {
  // Auto-parse SERP when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(handleSerpParsing, 1000); // Delay to ensure results are loaded
    });
  } else {
    setTimeout(handleSerpParsing, 1000);
  }

  // Watch for search result changes (for infinite scroll or dynamic loading)
  const searchContainer = document.querySelector('#search');
  if (searchContainer) {
    const observer = new MutationObserver((mutations) => {
      const hasNewResults = mutations.some(mutation =>
        Array.from(mutation.addedNodes).some(node =>
          node instanceof Element && node.querySelector('h3')
        )
      );

      if (hasNewResults) {
        setTimeout(handleSerpParsing, 500);
      }
    });

    observer.observe(searchContainer, {
      childList: true,
      subtree: true
    });
  }
}

/**
 * Handle SERP parsing and send results to service worker
 */
function handleSerpParsing(): void {
  const results = parseSerp();

  if (results.length > 0) {
    sendMessageToServiceWorker({
      type: 'TL_SERP_PARSED',
      payload: {
        query: getSearchQuery(),
        results,
        url: window.location.href
      }
    });
  }
}

/**
 * Handle SERP overlay injection (for Google Search pages)
 * Enhanced implementation based on TRUTHLENS_SPEC.md section 5.3
 */
function handleInjectSerpOverlay(overlayHtml?: string): void {
  if (!overlayHtml) {
    console.warn('[TruthLens Content] No overlay HTML provided');
    return;
  }

  if (!isGoogleSearchPage) {
    console.warn('[TruthLens Content] Not on Google search page');
    return;
  }

  injectCard(overlayHtml);
}

/**
 * Inject TruthLens card into Google Search results
 * Implementation based on TRUTHLENS_SPEC.md section 5.3
 */
async function injectCard(summaryHtml: string): Promise<void> {
  const container = document.querySelector("#search");
  if (!container) {
    console.warn('[TruthLens Content] Search container not found');
    return;
  }

  // Remove existing TruthLens card
  const existingCard = document.getElementById("truthlens-card");
  if (existingCard) {
    existingCard.remove();
  }

  // Create the card element
  const card = document.createElement("div");
  card.id = "truthlens-card";

  // Add comprehensive styling for the card
  card.style.cssText = `
    background: white;
    border: 1px solid #dadce0;
    border-radius: 8px;
    box-shadow: 0 1px 6px rgba(32,33,36,.28);
    margin-bottom: 16px;
    padding: 16px;
    font-family: arial, sans-serif;
    position: relative;
    max-width: 600px;
  `;

  // Create header with TruthLens branding
  const header = document.createElement("div");
  header.style.cssText = `
    display: flex;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #f0f0f0;
  `;

  const logo = document.createElement("div");
  logo.style.cssText = `
    width: 20px;
    height: 20px;
    background: #1a73e8;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    font-size: 10px;
    margin-right: 8px;
  `;
  logo.textContent = "TL";

  const title = document.createElement("span");
  title.style.cssText = `
    font-weight: 500;
    color: #202124;
    font-size: 14px;
  `;
  title.textContent = "TruthLens Analysis";

  const badge = document.createElement("span");
  badge.style.cssText = `
    background: #e8f0fe;
    color: #1a73e8;
    padding: 2px 6px;
    border-radius: 12px;
    font-size: 11px;
    margin-left: auto;
  `;
  badge.textContent = "AI-Powered";

  header.appendChild(logo);
  header.appendChild(title);
  header.appendChild(badge);

  // Create content area
  const content = document.createElement("div");
  content.style.cssText = `
    color: #3c4043;
    font-size: 14px;
    line-height: 1.4;
  `;
  content.innerHTML = summaryHtml;

  // Add expand/collapse functionality for long content
  if (content.textContent && content.textContent.length > 300) {
    const expandBtn = document.createElement("button");
    expandBtn.style.cssText = `
      background: none;
      border: none;
      color: #1a73e8;
      cursor: pointer;
      font-size: 13px;
      margin-top: 8px;
      padding: 0;
    `;
    expandBtn.textContent = "Show more";

    const shortContent = content.innerHTML.substring(0, 300) + "...";
    const fullContent = content.innerHTML;

    content.innerHTML = shortContent;

    expandBtn.addEventListener('click', () => {
      if (content.innerHTML === shortContent) {
        content.innerHTML = fullContent;
        expandBtn.textContent = "Show less";
      } else {
        content.innerHTML = shortContent;
        expandBtn.textContent = "Show more";
      }
    });

    content.appendChild(expandBtn);
  }

  // Assemble the card
  card.appendChild(header);
  card.appendChild(content);

  // Insert at the beginning of search results, respecting existing layout
  const firstChild = container.firstChild;
  if (firstChild) {
    container.insertBefore(card, firstChild);
  } else {
    container.appendChild(card);
  }

  // Add smooth entrance animation
  card.style.opacity = "0";
  card.style.transform = "translateY(-10px)";
  card.style.transition = "opacity 0.3s ease, transform 0.3s ease";

  // Trigger animation
  requestAnimationFrame(() => {
    card.style.opacity = "1";
    card.style.transform = "translateY(0)";
  });

  console.debug('[TruthLens Content] SERP card injected successfully');
}

/**
 * Handle selection bubble display with enhanced styling and positioning
 */
function handleShowSelectionBubble(position?: { x: number; y: number }): void {
  // Clear any existing timeout
  if (selectionBubbleTimeout) {
    clearTimeout(selectionBubbleTimeout);
    selectionBubbleTimeout = null;
  }

  // Remove existing bubble
  const existingBubble = document.getElementById('truthlens-selection-bubble');
  if (existingBubble) {
    existingBubble.remove();
  }

  const selection = window.getSelection();
  const selectedText = selection?.toString().trim();

  if (!selection || !selectedText || selectedText.length === 0) {
    return;
  }

  // Don't show bubble for very short selections
  if (selectedText.length < 10) {
    return;
  }

  // Store current selection
  lastSelection = selectedText;

  // Create enhanced bubble
  const bubble = createSelectionBubble(selectedText);

  // Position bubble intelligently
  positionSelectionBubble(bubble, selection, position);

  // Add event listeners
  setupBubbleEventListeners(bubble);

  // Add to DOM with animation
  document.body.appendChild(bubble);

  // Animate in
  requestAnimationFrame(() => {
    bubble.style.opacity = '1';
    bubble.style.transform = 'translateY(0) scale(1)';
  });

  console.debug('[TruthLens Content] Enhanced selection bubble shown');
}

/**
 * Create the selection bubble element with enhanced styling
 */
function createSelectionBubble(selectedText: string): HTMLElement {
  const bubble = document.createElement('div');
  bubble.id = 'truthlens-selection-bubble';

  // Truncate text for preview
  const previewText = selectedText.length > 50
    ? selectedText.substring(0, 50) + '...'
    : selectedText;

  bubble.innerHTML = `
    <div class="tl-bubble-container" style="
      position: absolute;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1);
      padding: 0;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      backdrop-filter: blur(10px);
      min-width: 200px;
      max-width: 320px;
    ">
      <div class="tl-bubble-header" style="
        padding: 12px 16px 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      ">
        <div style="
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        ">
          <div style="
            width: 16px;
            height: 16px;
            background: rgba(255, 255, 255, 0.9);
            border-radius: 3px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 9px;
            color: #667eea;
          ">TL</div>
          <span style="
            color: white;
            font-weight: 600;
            font-size: 13px;
          ">TruthLens</span>
        </div>
        <div style="
          color: rgba(255, 255, 255, 0.9);
          font-size: 11px;
          line-height: 1.3;
          max-height: 32px;
          overflow: hidden;
        ">"${previewText}"</div>
      </div>
      <div class="tl-bubble-actions" style="
        padding: 12px 16px;
        display: flex;
        gap: 8px;
      ">
        <button id="tl-fact-check-btn" style="
          background: rgba(255, 255, 255, 0.95);
          color: #667eea;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          flex: 1;
          transition: all 0.2s ease;
          backdrop-filter: blur(10px);
        " onmouseover="this.style.background='white'; this.style.transform='translateY(-1px)'"
           onmouseout="this.style.background='rgba(255, 255, 255, 0.95)'; this.style.transform='translateY(0)'">
          🔍 Fact-check
        </button>
        <button id="tl-ask-analyst-btn" style="
          background: rgba(255, 255, 255, 0.95);
          color: #764ba2;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          flex: 1;
          transition: all 0.2s ease;
          backdrop-filter: blur(10px);
        " onmouseover="this.style.background='white'; this.style.transform='translateY(-1px)'"
           onmouseout="this.style.background='rgba(255, 255, 255, 0.95)'; this.style.transform='translateY(0)'">
          💬 Ask analyst
        </button>
      </div>
    </div>
  `;

  // Initial animation state
  bubble.style.opacity = '0';
  bubble.style.transform = 'translateY(-10px) scale(0.95)';
  bubble.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

  return bubble;
}

/**
 * Position the selection bubble intelligently
 */
function positionSelectionBubble(
  bubble: HTMLElement,
  selection: Selection,
  position?: { x: number; y: number }
): void {
  const bubbleContainer = bubble.querySelector('.tl-bubble-container') as HTMLElement;

  if (position) {
    bubbleContainer.style.left = `${position.x}px`;
    bubbleContainer.style.top = `${position.y}px`;
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // Calculate optimal position
  const bubbleWidth = 320; // max-width
  const bubbleHeight = 120; // estimated height
  const margin = 10;

  let left = rect.left + window.scrollX;
  let top = rect.bottom + window.scrollY + margin;

  // Adjust horizontal position if bubble would go off-screen
  if (left + bubbleWidth > window.innerWidth) {
    left = window.innerWidth - bubbleWidth - margin;
  }
  if (left < margin) {
    left = margin;
  }

  // Adjust vertical position if bubble would go off-screen
  if (top + bubbleHeight > window.innerHeight + window.scrollY) {
    // Show above selection instead
    top = rect.top + window.scrollY - bubbleHeight - margin;
  }

  // Ensure bubble doesn't go above viewport
  if (top < window.scrollY + margin) {
    top = window.scrollY + margin;
  }

  bubbleContainer.style.left = `${left}px`;
  bubbleContainer.style.top = `${top}px`;
}

/**
 * Setup event listeners for the bubble
 */
function setupBubbleEventListeners(bubble: HTMLElement): void {
  const factCheckBtn = bubble.querySelector('#tl-fact-check-btn');
  const askAnalystBtn = bubble.querySelector('#tl-ask-analyst-btn');

  factCheckBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleGetSelection('fact-check');
    removeBubbleWithAnimation(bubble);
  });

  askAnalystBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleGetSelection('ask-analyst');
    removeBubbleWithAnimation(bubble);
  });

  // Remove bubble when clicking elsewhere or pressing Escape
  const removeHandler = (e: Event) => {
    if (e.type === 'keydown') {
      const keyEvent = e as KeyboardEvent;
      if (keyEvent.key === 'Escape') {
        removeBubbleWithAnimation(bubble);
        document.removeEventListener('keydown', removeHandler);
        document.removeEventListener('click', removeHandler);
      }
    } else if (e.type === 'click') {
      const clickEvent = e as MouseEvent;
      if (!bubble.contains(clickEvent.target as Node)) {
        removeBubbleWithAnimation(bubble);
        document.removeEventListener('keydown', removeHandler);
        document.removeEventListener('click', removeHandler);
      }
    }
  };

  // Add listeners with a small delay to prevent immediate removal
  setTimeout(() => {
    document.addEventListener('click', removeHandler);
    document.addEventListener('keydown', removeHandler);
  }, 100);

  // Auto-remove after 10 seconds
  selectionBubbleTimeout = setTimeout(() => {
    removeBubbleWithAnimation(bubble);
  }, 10000);
}

/**
 * Remove bubble with animation
 */
function removeBubbleWithAnimation(bubble: HTMLElement): void {
  bubble.style.opacity = '0';
  bubble.style.transform = 'translateY(-10px) scale(0.95)';

  setTimeout(() => {
    if (bubble.parentNode) {
      bubble.parentNode.removeChild(bubble);
    }
  }, 300);
}



// Enhanced selection handling
document.addEventListener('mouseup', handleMouseUp);
document.addEventListener('keyup', handleKeyUp);
document.addEventListener('selectionchange', handleSelectionChange);

// Handle mouse selection
function handleMouseUp(event: MouseEvent): void {
  // Ignore clicks on TruthLens elements
  const target = event.target as Element;
  if (target.closest('#truthlens-selection-bubble') || target.closest('#truthlens-card')) {
    return;
  }

  setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    if (selectedText && selectedText.length > 10 && selectedText !== lastSelection) {
      handleShowSelectionBubble();
    } else if (!selectedText) {
      // Remove bubble if no selection
      const existingBubble = document.getElementById('truthlens-selection-bubble');
      if (existingBubble) {
        removeBubbleWithAnimation(existingBubble);
      }
    }
  }, 150);
}

// Handle keyboard selection (Shift+Arrow keys, Ctrl+A, etc.)
function handleKeyUp(event: KeyboardEvent): void {
  if (event.shiftKey || event.ctrlKey || event.metaKey) {
    setTimeout(() => {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();

      if (selectedText && selectedText.length > 10 && selectedText !== lastSelection) {
        handleShowSelectionBubble();
      }
    }, 100);
  }
}

// Handle programmatic selection changes
function handleSelectionChange(): void {
  // Debounce selection changes
  if (selectionBubbleTimeout) {
    clearTimeout(selectionBubbleTimeout);
  }

  selectionBubbleTimeout = setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    if (!selectedText || selectedText.length < 10) {
      const existingBubble = document.getElementById('truthlens-selection-bubble');
      if (existingBubble) {
        removeBubbleWithAnimation(existingBubble);
      }
    }
  }, 300);
}

// Enhanced message sending with retry logic
function sendMessageToServiceWorker(message: ContentToServiceWorkerMessage): void {
  const messageWithTimestamp = {
    ...message,
    timestamp: Date.now()
  };

  chrome.runtime.sendMessage(messageWithTimestamp)
    .then(response => {
      if (response?.success) {
        console.debug('[TruthLens Content] Message sent successfully:', message.type);
      } else {
        console.warn('[TruthLens Content] Message failed:', response);
      }
    })
    .catch(error => {
      console.error('[TruthLens Content] Error sending message to service worker:', error);

      // Retry once after a short delay
      setTimeout(() => {
        chrome.runtime.sendMessage(messageWithTimestamp)
          .catch(retryError => {
            console.error('[TruthLens Content] Retry failed:', retryError);
          });
      }, 1000);
    });
}

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Remove bubble when page becomes hidden
    const existingBubble = document.getElementById('truthlens-selection-bubble');
    if (existingBubble) {
      removeBubbleWithAnimation(existingBubble);
    }
  }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
  // Clean up any timeouts
  if (selectionBubbleTimeout) {
    clearTimeout(selectionBubbleTimeout);
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (event: KeyboardEvent) => {
  // Alt+Shift+F - Fact-check selection
  if (event.altKey && event.shiftKey && event.key === 'F') {
    event.preventDefault();
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      handleGetSelection('fact-check');
    }
  }

  // Alt+Shift+A - Ask analyst
  if (event.altKey && event.shiftKey && event.key === 'A') {
    event.preventDefault();
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      handleGetSelection('ask-analyst');
    }
  }
});

console.debug('[TruthLens Content] Enhanced content script initialized');
