import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClaimCard } from './ClaimCard';
import { Search, AlertCircle, Loader2 } from 'lucide-react';
import {
  useFactChecks,
  useCapabilities,
  useExtractClaimsQuery,
  useFactCheckMutation,
  useTruthLensStore
} from '@/lib/state';
// import type { FactCheckResult } from '@/lib/types/messages';

export function ClaimsTab() {
  const factChecks = useFactChecks();
  // const ui = useUIState();
  const capabilities = useCapabilities();
  const { addFactCheck, setSelectedText } = useTruthLensStore();

  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Extract claims from text
  const {
    data: extractedClaims,
    isLoading: isExtractingClaims,
    error: extractError
  } = useExtractClaimsQuery(extractedText || '', !!extractedText);

  // Fact-check mutation
  const factCheckMutation = useFactCheckMutation();

  useEffect(() => {
    // Listen for text extraction messages
    const handleMessage = (message: any) => {
      if (message.type === 'TL_TEXT_EXTRACTED' && message.payload?.action === 'fact-check') {
        setExtractedText(message.payload.text);
        setSelectedText(message.payload.text);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [setSelectedText]);

  // Auto fact-check extracted claims
  useEffect(() => {
    if (extractedClaims && extractedClaims.length > 0) {
      setIsAnalyzing(true);

      // Fact-check each claim
      extractedClaims.forEach(async (claim) => {
        try {
          const result = await factCheckMutation.mutateAsync(claim);
          addFactCheck(result);
        } catch (error) {
          console.error('[TruthLens Claims] Failed to fact-check claim:', error);
        }
      });

      setIsAnalyzing(false);
    }
  }, [extractedClaims, factCheckMutation, addFactCheck]);

  // Future feature: manual text input fact-checking
  // const handleManualFactCheckText = async (text: string) => {
  //   if (!text.trim()) return;
  //
  //   setIsAnalyzing(true);
  //
  //   try {
  //     const result = await factCheckMutation.mutateAsync(text.trim());
  //     addFactCheck(result);
  //   } catch (error) {
  //     console.error('[TruthLens Claims] Manual fact-check failed:', error);
  //   } finally {
  //     setIsAnalyzing(false);
  //   }
  // };

  const handleManualFactCheck = async () => {
    try {
      // Request text selection from current tab; if content script missing, inject and retry
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (!tabId) throw new Error('Active tab not found');
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'TL_GET_SELECTION',
          payload: { action: 'fact-check' },
          timestamp: Date.now()
        });
      } catch (err) {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] });
        await chrome.tabs.sendMessage(tabId, {
          type: 'TL_GET_SELECTION',
          payload: { action: 'fact-check' },
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('[TruthLens Claims] Error requesting text selection:', error);

      // Fallback: prompt user to select text
      alert('Please select text on the page and try again. On macOS: press Option+Shift+F.');
    }
  };

  const isLoading = isAnalyzing || isExtractingClaims || factCheckMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {isExtractingClaims ? 'Extracting claims...' :
           factCheckMutation.isPending ? 'Fact-checking...' :
           'Analyzing claims...'}
        </p>
        {extractedText && (
          <Card className="w-full max-w-md">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                <strong>Analyzing:</strong> {extractedText.substring(0, 150)}
                {extractedText.length > 150 ? '...' : ''}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (factChecks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-6 p-6">
        <div className="flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-100 to-blue-100 rounded-full shadow-sm">
          <Search className="w-10 h-10 text-green-600" />
        </div>

        <div className="text-center space-y-3">
          <h3 className="text-xl font-semibold text-foreground">Fact Check Claims</h3>
          <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
            Select text on any webpage to fact-check claims and verify information.
            We'll find independent reviews and show evidence scores.
          </p>
        </div>

        <div className="space-y-4 w-full max-w-md">
          <Button
            onClick={handleManualFactCheck}
            className="w-full h-12 bg-green-600 hover:bg-green-700 transition-colors"
          >
            <Search className="w-5 h-5 mr-2" />
            Fact-check Selection
          </Button>

          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Or use keyboard shortcut: <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Alt+Shift+F</kbd>
            </p>
          </div>
        </div>

        {!capabilities.chromeAI?.summarizerAPI?.available && (
          <Card className="w-full max-w-md border-orange-200 bg-orange-50">
            <CardContent className="p-4">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-orange-800">Limited AI capabilities</p>
                  <p className="text-orange-700">
                    On-device AI not available. Fact-checking will use cloud services when enabled.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Fact-checked Claims</h3>
        <Button variant="outline" size="sm" onClick={handleManualFactCheck}>
          <Search className="w-4 h-4 mr-2" />
          Check More
        </Button>
      </div>

      <div className="space-y-4">
        {factChecks.map((claim) => (
          <ClaimCard key={claim.claimId} claim={claim} />
        ))}
      </div>

      {extractError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-red-800">Error extracting claims</p>
                <p className="text-red-700">{extractError.message}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
