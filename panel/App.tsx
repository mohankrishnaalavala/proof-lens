import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Search, MessageCircle, FileText } from 'lucide-react';
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
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-lg text-sm font-bold shadow-sm">
            TL
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">TruthLens</h1>
            <p className="text-xs text-muted-foreground">AI-Powered Fact Checking</p>
          </div>
        </div>
        <Badge
          variant={capabilityStatus.variant}
          className="text-xs font-medium"
        >
          {capabilityStatus.text}
        </Badge>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Tabs
          value={ui.activeTab}
          onValueChange={(value) => setActiveTab(value as any)}
          className="flex-1 flex flex-col"
        >
          <TabsList className="grid w-full grid-cols-3 mx-4 mt-4 mb-0 bg-muted/50">
            <TabsTrigger
              value="claims"
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <Search className="w-4 h-4 mr-2" />
              Claims
            </TabsTrigger>
            <TabsTrigger
              value="chat"
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Chat
            </TabsTrigger>
            <TabsTrigger
              value="brief"
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <FileText className="w-4 h-4 mr-2" />
              Brief
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden">
            <TabsContent value="claims" className="h-full m-0 p-4 data-[state=active]:flex data-[state=active]:flex-col">
              <ClaimsTab />
            </TabsContent>

            <TabsContent value="chat" className="h-full m-0 p-4 data-[state=active]:flex data-[state=active]:flex-col">
              <ChatTab />
            </TabsContent>

            <TabsContent value="brief" className="h-full m-0 p-4 data-[state=active]:flex data-[state=active]:flex-col">
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
