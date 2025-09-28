/**
 * TruthLens Panel JavaScript
 * Basic functionality for the side panel
 */

// Tab management
document.addEventListener('DOMContentLoaded', () => {
  console.debug('[TruthLens Panel] Initializing...');
  
  // Initialize tabs
  initializeTabs();
  
  // Initialize message handling
  initializeMessageHandling();
  
  // Request capabilities from service worker
  requestCapabilities();
  
  console.debug('[TruthLens Panel] Initialized');
});

/**
 * Initialize tab functionality
 */
function initializeTabs() {
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      
      // Remove active class from all tabs and contents
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Add active class to clicked tab and corresponding content
      tab.classList.add('active');
      const targetContent = document.getElementById(`${targetTab}-content`);
      if (targetContent) {
        targetContent.classList.add('active');
      }
      
      console.debug('[TruthLens Panel] Switched to tab:', targetTab);
    });
  });
}

/**
 * Initialize message handling
 */
function initializeMessageHandling() {
  // Listen for messages from service worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.debug('[TruthLens Panel] Received message:', message);
    
    try {
      handleMessage(message);
      sendResponse({ success: true, timestamp: Date.now() });
    } catch (error) {
      console.error('[TruthLens Panel] Error handling message:', error);
      sendResponse({ 
        success: false, 
        error: error.message, 
        timestamp: Date.now() 
      });
    }
    
    return true; // Async response
  });
}

/**
 * Handle incoming messages
 */
function handleMessage(message) {
  switch (message.type) {
    case 'TL_TEXT_EXTRACTED':
      handleTextExtracted(message.payload);
      break;
      
    case 'TL_CHAT_OPEN':
      switchToTab('chat');
      break;
      
    case 'TL_CAPABILITY_STATUS':
      updateCapabilityStatus(message.payload.capabilities);
      break;
      
    default:
      console.warn('[TruthLens Panel] Unknown message type:', message.type);
  }
}

/**
 * Handle extracted text
 */
function handleTextExtracted(payload) {
  const { text, action, url } = payload || {};
  
  if (!text) {
    console.warn('[TruthLens Panel] No text provided');
    return;
  }
  
  console.debug('[TruthLens Panel] Text extracted:', { text: text.substring(0, 100) + '...', action, url });
  
  if (action === 'fact-check') {
    switchToTab('claims');
    showFactCheckPlaceholder(text);
  } else if (action === 'ask-analyst') {
    switchToTab('chat');
    showChatPlaceholder(text);
  }
}

/**
 * Switch to a specific tab
 */
function switchToTab(tabName) {
  const tab = document.querySelector(`[data-tab="${tabName}"]`);
  if (tab) {
    tab.click();
  }
}

/**
 * Show fact check placeholder with extracted text
 */
function showFactCheckPlaceholder(text) {
  const claimsContent = document.getElementById('claims-content');
  if (!claimsContent) return;
  
  claimsContent.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      Analyzing text for claims...
    </div>
    <div style="margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 6px; font-size: 14px; color: #64748b;">
      <strong>Text to analyze:</strong><br>
      "${text.length > 200 ? text.substring(0, 200) + '...' : text}"
    </div>
  `;
}

/**
 * Show chat placeholder with extracted text
 */
function showChatPlaceholder(text) {
  const chatContent = document.getElementById('chat-content');
  if (!chatContent) return;
  
  chatContent.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      Preparing chat with context...
    </div>
    <div style="margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 6px; font-size: 14px; color: #64748b;">
      <strong>Context:</strong><br>
      "${text.length > 200 ? text.substring(0, 200) + '...' : text}"
    </div>
  `;
}

/**
 * Update capability status
 */
function updateCapabilityStatus(capabilities) {
  const statusBadge = document.getElementById('status-badge');
  if (!statusBadge) return;
  
  const hasOnDevice = capabilities.promptAPI?.available || capabilities.summarizerAPI?.available;
  
  if (hasOnDevice) {
    statusBadge.textContent = 'On-device';
    statusBadge.style.background = '#f0fdf4';
    statusBadge.style.color = '#166534';
    statusBadge.style.borderColor = '#bbf7d0';
  } else {
    statusBadge.textContent = 'Cloud only';
    statusBadge.style.background = '#fef3c7';
    statusBadge.style.color = '#92400e';
    statusBadge.style.borderColor = '#fde68a';
  }
  
  console.debug('[TruthLens Panel] Capability status updated:', capabilities);
}

/**
 * Request capabilities from service worker
 */
function requestCapabilities() {
  chrome.runtime.sendMessage({
    type: 'TL_REQUEST_CAPABILITIES',
    timestamp: Date.now()
  }).catch(error => {
    console.error('[TruthLens Panel] Error requesting capabilities:', error);
  });
}

/**
 * Show instructions for different features
 */
function showInstructions(feature) {
  let instructions = '';
  
  switch (feature) {
    case 'claims':
      instructions = `
        <h3>How to Fact-Check</h3>
        <ol style="text-align: left; margin: 16px 0; padding-left: 20px;">
          <li>Select text on any webpage</li>
          <li>Right-click and choose "Fact-check with TruthLens"</li>
          <li>Or use keyboard shortcut Alt+Shift+F</li>
          <li>View evidence scores and citations</li>
        </ol>
      `;
      break;
      
    case 'chat':
      instructions = `
        <h3>How to Chat</h3>
        <ol style="text-align: left; margin: 16px 0; padding-left: 20px;">
          <li>Select text for context (optional)</li>
          <li>Right-click and choose "Ask analyst"</li>
          <li>Or use keyboard shortcut Alt+Shift+A</li>
          <li>Ask questions about the content</li>
        </ol>
      `;
      break;
      
    case 'brief':
      instructions = `
        <h3>How to Create Brief</h3>
        <ol style="text-align: left; margin: 16px 0; padding-left: 20px;">
          <li>Fact-check claims and chat with analyst</li>
          <li>Click "Export" in this tab</li>
          <li>Download PDF with facts and analysis</li>
          <li>Share professional reports</li>
        </ol>
      `;
      break;
  }
  
  const content = document.getElementById(`${feature}-content`);
  if (content) {
    content.innerHTML = `
      <div class="placeholder">
        ${instructions}
        <button class="action-button" onclick="location.reload()">Back</button>
      </div>
    `;
  }
}
