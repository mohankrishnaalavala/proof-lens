import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, Copy, RefreshCw, ExternalLink } from 'lucide-react';
import { formatDate, copyToClipboard } from '@/lib/utils';
import type { FactCheckResult } from '@/lib/types/messages';

interface ClaimCardProps {
  claim: FactCheckResult;
}

export function ClaimCard({ claim }: ClaimCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isRechecking, setIsRechecking] = useState(false);

  const getEvidenceVariant = (band: string) => {
    switch (band.toLowerCase()) {
      case 'high': return 'evidence-high';
      case 'medium': return 'evidence-medium';
      case 'low': return 'evidence-low';
      default: return 'secondary';
    }
  };

  const handleCopyCitations = async () => {
    setIsCopying(true);
    
    const citations = claim.reviews.map((review: any, index: number) =>
      `${index + 1}. ${review.title} - ${review.publisher} (${review.textualRating})\n   ${review.url}`
    ).join('\n\n');
    
    const text = `Claim: ${claim.claim}\n\nCitations:\n${citations}`;
    
    const success = await copyToClipboard(text);
    
    setTimeout(() => setIsCopying(false), 1000);
    
    if (success) {
      // TODO: Show toast notification in Phase 2
      console.log('Citations copied to clipboard');
    }
  };

  const handleRecheck = async () => {
    setIsRechecking(true);
    
    // TODO: Implement actual re-checking in Agent 4
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setIsRechecking(false);
    // TODO: Update claim data
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-relaxed">
              {claim.claim}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant={getEvidenceVariant(claim.evidenceBand)}>
              {claim.evidenceBand} Evidence
            </Badge>
            <span className="text-xs text-muted-foreground">
              {claim.evidenceScore}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-3">
          {/* Quick Summary */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {claim.reviews.length} review{claim.reviews.length !== 1 ? 's' : ''} found
            </span>
            <span className="text-muted-foreground">
              {formatDate(claim.lastChecked)}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1">
                  {isExpanded ? (
                    <>
                      <ChevronUp className="w-4 h-4 mr-2" />
                      Hide Citations
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4 mr-2" />
                      Show Citations
                    </>
                  )}
                </Button>
              </CollapsibleTrigger>
            </Collapsible>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleCopyCitations}
              disabled={isCopying}
            >
              <Copy className="w-4 h-4" />
            </Button>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRecheck}
              disabled={isRechecking}
            >
              <RefreshCw className={`w-4 h-4 ${isRechecking ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Expandable Citations */}
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleContent className="space-y-3">
              <div className="border-t pt-3">
                <h4 className="text-sm font-medium mb-3">Independent Reviews</h4>
                <div className="space-y-3">
                  {claim.reviews.map((review: any, index: number) => (
                    <div key={index} className="border rounded-lg p-3 bg-muted/30">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <h5 className="text-sm font-medium truncate">
                            {review.title}
                          </h5>
                          <p className="text-xs text-muted-foreground">
                            {review.publisher}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {review.textualRating}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {review.reviewDate ? formatDate(new Date(review.reviewDate).getTime()) : 'No date'}
                        </span>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-auto p-1"
                          onClick={() => window.open(review.url, '_blank')}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Evidence Score Breakdown */}
                <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                  <h5 className="text-sm font-medium mb-2">Evidence Score Breakdown</h5>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="flex justify-between">
                      <span>Multiple publishers ({new Set(claim.reviews.map((r: any) => r.publisher)).size})</span>
                      <span>+{new Set(claim.reviews.map((r: any) => r.publisher)).size >= 2 ? 40 : 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Recent reviews</span>
                      <span>+{claim.reviews.some((r: any) => r.reviewDate &&
                        Date.now() - new Date(r.reviewDate).getTime() < 365 * 24 * 60 * 60 * 1000) ? 20 : 0}</span>
                    </div>
                    <div className="flex justify-between font-medium border-t pt-1">
                      <span>Total Score</span>
                      <span>{claim.evidenceScore}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CardContent>
    </Card>
  );
}
