import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ClaimsTab } from './components/ClaimsTab';
import { ChatTab } from './components/ChatTab';
import { BriefTab } from './components/BriefTab';
import type {
  ServiceWorkerToPanelMessage,
  ChromeAICapabilities
} from '@/lib/types/messages';

interface AppState {
  activeTab: string;
  capabilities: ChromeAICapabilities | null;
  isLoading: boolean;
}

export function App() {
  const [state, setState] = useState<AppState>({
    activeTab: 'claims',
    capabilities: null,
    isLoading: true
  });

  useEffect(() => {
    // Initialize message handling
    const handleMessage = (message: ServiceWorkerToPanelMessage) => {
      console.debug('[TruthLens Panel] Received message:', message);
      
      switch (message.type) {
        case 'TL_CAPABILITY_STATUS':
          setState(prev => ({
            ...prev,
            capabilities: message.payload?.capabilities || null,
            isLoading: false
          }));
          break;
          
        case 'TL_CHAT_OPEN':
          setState(prev => ({ ...prev, activeTab: 'chat' }));
          break;
          
        case 'TL_TEXT_EXTRACTED':
          if (message.payload?.action === 'fact-check') {
            setState(prev => ({ ...prev, activeTab: 'claims' }));
          } else if (message.payload?.action === 'ask-analyst') {
            setState(prev => ({ ...prev, activeTab: 'chat' }));
          }
          break;
      }
    };

    // Listen for messages from service worker
    chrome.runtime.onMessage.addListener(handleMessage);

    // Request capabilities on startup
    chrome.runtime.sendMessage({
      type: 'TL_REQUEST_CAPABILITIES',
      timestamp: Date.now()
    }).catch(error => {
      console.error('[TruthLens Panel] Error requesting capabilities:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    });

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const getCapabilityStatus = () => {
    if (!state.capabilities) return { text: 'Loading...', variant: 'secondary' as const };
    
    const hasOnDevice = state.capabilities.promptAPI?.available || 
                       state.capabilities.summarizerAPI?.available;
    
    if (hasOnDevice) {
      return { text: 'On-device', variant: 'source-ondevice' as const };
    } else {
      return { text: 'Cloud only', variant: 'source-cloud' as const };
    }
  };

  const capabilityStatus = getCapabilityStatus();

  return (
    <div className="extension-panel">
      {/* Header */}
      <div className="extension-header">
        <div className="flex items-center justify-center w-6 h-6 bg-primary text-primary-foreground rounded-md text-xs font-bold">
          TL
        </div>
        <h1 className="text-lg font-semibold">TruthLens</h1>
        <div className="ml-auto">
          <Badge variant={capabilityStatus.variant}>
            {capabilityStatus.text}
          </Badge>
        </div>
      </div>

      {/* Main Content */}
      <div className="extension-content">
        <Tabs 
          value={state.activeTab} 
          onValueChange={(value: string) => setState(prev => ({ ...prev, activeTab: value }))}
          className="w-full h-full flex flex-col"
        >
          <TabsList className="grid w-full grid-cols-3 m-4 mb-0">
            <TabsTrigger value="claims">Claims</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="brief">Brief</TabsTrigger>
          </TabsList>
          
          <div className="flex-1 overflow-hidden">
            <TabsContent value="claims" className="h-full m-0 p-4">
              <ClaimsTab capabilities={state.capabilities} />
            </TabsContent>
            
            <TabsContent value="chat" className="h-full m-0 p-4">
              <ChatTab capabilities={state.capabilities} />
            </TabsContent>
            
            <TabsContent value="brief" className="h-full m-0 p-4">
              <BriefTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
