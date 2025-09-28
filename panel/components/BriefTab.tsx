import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download, Plus } from 'lucide-react';
import { useFactChecks, useChatHistory } from '@/lib/state/store';
import { useBriefCompiler } from '@/lib/state/brief';

export function BriefTab() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const factChecks = useFactChecks();
  const chatHistory = useChatHistory();
  const { compileBrief } = useBriefCompiler();

  const handleGenerateBrief = async () => {
    setIsGenerating(true);
    try {
      await compileBrief();
      setLastUpdated(Date.now());
    } catch (e) {
      console.error('[TruthLens Brief] Failed to compile brief:', e);
    } finally {
      setIsGenerating(false);
    }
  };

  const mockBriefData = {
    factsCount: factChecks.length,
    chatMessagesCount: chatHistory.length,
    lastUpdated,
  };

  if (mockBriefData.factsCount === 0 && mockBriefData.chatMessagesCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-6 p-6">
        <div className="flex items-center justify-center w-16 h-16 bg-muted rounded-full">
          <FileText className="w-8 h-8 text-muted-foreground" />
        </div>
        
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">Decision Brief</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Export your fact-checks and analysis as a professional PDF report with facts, 
            analysis, and recommendations.
          </p>
        </div>

        <Card className="w-full max-w-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Get Started</CardTitle>
            <CardDescription className="text-sm">
              To create a brief, you need some content first:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>Fact-checked claims</span>
              <span className="text-muted-foreground">{mockBriefData.factsCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Chat messages</span>
              <span className="text-muted-foreground">{mockBriefData.chatMessagesCount}</span>
            </div>
            
            <div className="pt-2 space-y-2">
              <p className="text-xs text-muted-foreground">
                1. Fact-check some claims in the Claims tab
              </p>
              <p className="text-xs text-muted-foreground">
                2. Chat with the analyst for insights
              </p>
              <p className="text-xs text-muted-foreground">
                3. Return here to generate your brief
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Brief will include facts, analysis, and recommendations
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Decision Brief</h3>
        <Button onClick={handleGenerateBrief} disabled={isGenerating}>
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
              Generating...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </>
          )}
        </Button>
      </div>

      {/* Brief Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brief Preview</CardTitle>
          <CardDescription>
            {mockBriefData.lastUpdated 
              ? `Last updated: ${new Date(mockBriefData.lastUpdated).toLocaleString()}`
              : 'Ready to generate'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Facts Section */}
          <div>
            <h4 className="font-medium mb-2 flex items-center">
              <span className="w-6 h-6 bg-blue-100 text-blue-800 rounded-full text-xs flex items-center justify-center mr-2">
                1
              </span>
              Facts ({mockBriefData.factsCount})
            </h4>
            <div className="ml-8 text-sm text-muted-foreground">
              {mockBriefData.factsCount > 0 
                ? `${mockBriefData.factsCount} fact-checked claims with evidence scores and citations`
                : 'No facts available yet'
              }
            </div>
          </div>

          {/* Analysis Section */}
          <div>
            <h4 className="font-medium mb-2 flex items-center">
              <span className="w-6 h-6 bg-green-100 text-green-800 rounded-full text-xs flex items-center justify-center mr-2">
                2
              </span>
              Analysis ({mockBriefData.chatMessagesCount})
            </h4>
            <div className="ml-8 text-sm text-muted-foreground">
              {mockBriefData.chatMessagesCount > 0 
                ? `${mockBriefData.chatMessagesCount} analyst insights and research findings`
                : 'No analysis available yet'
              }
            </div>
          </div>

          {/* Recommendations Section */}
          <div>
            <h4 className="font-medium mb-2 flex items-center">
              <span className="w-6 h-6 bg-purple-100 text-purple-800 rounded-full text-xs flex items-center justify-center mr-2">
                3
              </span>
              Recommendations
            </h4>
            <div className="ml-8 text-sm text-muted-foreground">
              AI-generated recommendations based on facts and analysis
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export Options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">PDF Format</p>
              <p className="text-xs text-muted-foreground">Professional report with citations</p>
            </div>
            <Button variant="outline" size="sm" disabled>
              <Download className="w-4 h-4 mr-2" />
              PDF
            </Button>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Markdown Format</p>
              <p className="text-xs text-muted-foreground">Plain text with formatting</p>
            </div>
            <Button variant="outline" size="sm" disabled>
              <Download className="w-4 h-4 mr-2" />
              MD
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add Content Shortcuts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="outline" className="w-full justify-start" size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add more fact-checks
          </Button>
          <Button variant="outline" className="w-full justify-start" size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Continue analysis chat
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
