import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClaimCard } from './ClaimCard';
import { Search, AlertCircle } from 'lucide-react';
import type { ChromeAICapabilities, FactCheckResult } from '@/lib/types/messages';

interface ClaimsTabProps {
  capabilities: ChromeAICapabilities | null;
}

export function ClaimsTab({ capabilities }: ClaimsTabProps) {
  const [claims, setClaims] = useState<FactCheckResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);

  useEffect(() => {
    // Listen for text extraction messages
    const handleMessage = (message: any) => {
      if (message.type === 'TL_TEXT_EXTRACTED' && message.payload?.action === 'fact-check') {
        setExtractedText(message.payload.text);
        if (message.payload.text) {
          handleFactCheck(message.payload.text);
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const handleFactCheck = async (text: string) => {
    setIsAnalyzing(true);
    
    try {
      // TODO: This will be implemented in Agent 4 (AI Adapters)
      // For now, show mock data
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const mockClaim: FactCheckResult = {
        claim: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
        claimId: `claim_${Date.now()}`,
        reviews: [
          {
            publisher: 'FactCheck.org',
            url: 'https://factcheck.org/example',
            title: 'Analysis of this claim',
            reviewDate: new Date().toISOString(),
            textualRating: 'Mostly True',
            languageCode: 'en'
          },
          {
            publisher: 'Snopes',
            url: 'https://snopes.com/example',
            title: 'Fact-check: Claim verification',
            reviewDate: new Date(Date.now() - 86400000).toISOString(),
            textualRating: 'True',
            languageCode: 'en'
          }
        ],
        evidenceScore: 75,
        evidenceBand: 'High',
        lastChecked: Date.now()
      };
      
      setClaims(prev => [mockClaim, ...prev]);
    } catch (error) {
      console.error('Error fact-checking:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleManualFactCheck = () => {
    // Request text selection from current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'TL_GET_SELECTION',
          payload: { action: 'fact-check' },
          timestamp: Date.now()
        });
      }
    });
  };

  if (isAnalyzing) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="text-sm text-muted-foreground">Analyzing claims...</p>
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

  if (claims.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-6 p-6">
        <div className="flex items-center justify-center w-16 h-16 bg-muted rounded-full">
          <Search className="w-8 h-8 text-muted-foreground" />
        </div>
        
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">Fact Check Claims</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Select text on any webpage and right-click to fact-check it with TruthLens. 
            We'll find independent reviews and show evidence scores.
          </p>
        </div>

        <div className="space-y-3">
          <Button onClick={handleManualFactCheck} className="w-full">
            <Search className="w-4 h-4 mr-2" />
            Fact-check Selection
          </Button>
          
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Or use keyboard shortcut: <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Alt+Shift+F</kbd>
            </p>
          </div>
        </div>

        {!capabilities?.summarizerAPI?.available && (
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
        {claims.map((claim) => (
          <ClaimCard key={claim.claimId} claim={claim} />
        ))}
      </div>
    </div>
  );
}
