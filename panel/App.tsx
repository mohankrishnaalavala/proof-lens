import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ClaimsTab } from './components/ClaimsTab';
import { ChatTab } from './components/ChatTab';
import { BriefTab } from './components/BriefTab';
import {
  useTruthLensStore,
  useUIState,
  useCapabilities,
  createQueryClient,
  useCapabilitiesQuery
} from '@/lib/state';
import type { ServiceWorkerToPanelMessage } from '@/lib/types/messages';

// Create query client instance
const queryClient = createQueryClient();

function AppContent() {
  const ui = useUIState();
  const capabilities = useCapabilities();
  const { setActiveTab, setLoading, updateCapabilities } = useTruthLensStore();

  // Query for capabilities
  const { data: capabilitiesData, isLoading: capabilitiesLoading } = useCapabilitiesQuery();

  // Update capabilities when query data changes
  useEffect(() => {
    if (capabilitiesData) {
      updateCapabilities(capabilitiesData);
    }
    setLoading(capabilitiesLoading);
  }, [capabilitiesData, capabilitiesLoading, updateCapabilities, setLoading]);

  useEffect(() => {
    // Initialize message handling
    const handleMessage = (message: ServiceWorkerToPanelMessage) => {
      console.debug('[TruthLens Panel] Received message:', message);

      switch (message.type) {
        case 'TL_CAPABILITY_STATUS':
          if (message.payload?.capabilities) {
            updateCapabilities(message.payload.capabilities);
          }
          setLoading(false);
          break;

        case 'TL_CHAT_OPEN':
          setActiveTab('chat');
          break;

        case 'TL_TEXT_EXTRACTED':
          if (message.payload?.action === 'fact-check') {
            setActiveTab('claims');
          } else if (message.payload?.action === 'ask-analyst') {
            setActiveTab('chat');
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
      setLoading(false);
    });

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [setLoading, updateCapabilities, setActiveTab]);

  const getCapabilityStatus = () => {
    if (!capabilities.chromeAI) return { text: 'Loading...', variant: 'secondary' as const };

    const hasOnDevice = capabilities.chromeAI?.promptAPI?.available ||
                       capabilities.chromeAI?.summarizerAPI?.available;

    if (hasOnDevice) {
      return { text: 'On-device', variant: 'source-ondevice' as const };
    } else if (capabilities.chromeAI) {
      return { text: 'Cloud', variant: 'source-cloud' as const };
    } else {
      return { text: 'Limited', variant: 'secondary' as const };
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
          value={ui.activeTab}
          onValueChange={(value) => setActiveTab(value as any)}
          className="w-full h-full flex flex-col"
        >
          <TabsList className="grid w-full grid-cols-3 m-4 mb-0">
            <TabsTrigger value="claims">Claims</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="brief">Brief</TabsTrigger>
          </TabsList>
          
          <div className="flex-1 overflow-hidden">
            <TabsContent value="claims" className="h-full m-0 p-4">
              <ClaimsTab />
            </TabsContent>

            <TabsContent value="chat" className="h-full m-0 p-4">
              <ChatTab />
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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
