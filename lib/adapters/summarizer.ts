/**
 * Chrome Summarizer API Adapter for TruthLens
 * Handles claim extraction and text summarization using Chrome's built-in AI
 */

export interface SummarizerOptions {
  type?: 'key-points' | 'tl;dr' | 'teaser' | 'headline';
  format?: 'markdown' | 'plain-text';
  length?: 'short' | 'medium' | 'long';
}

export interface SummarizerResult {
  summary: string;
  claims: string[];
  source: 'on-device';
  timestamp: number;
  options: SummarizerOptions;
}

export interface SummarizerError {
  code: 'NOT_AVAILABLE' | 'SUMMARIZER_FAILED' | 'INVALID_INPUT' | 'QUOTA_EXCEEDED';
  message: string;
  details?: any;
}

class ChromeSummarizerAdapter {
  private isAvailable: boolean | null = null;
  private capabilities: any = null;

  /**
   * Check if Chrome Summarizer API is available
   */
  async checkAvailability(): Promise<boolean> {
    try {
      if (this.isAvailable !== null) {
        return this.isAvailable;
      }

      // Check if the API exists
      if (!('ai' in window) || !('summarizer' in (window as any).ai)) {
        this.isAvailable = false;
        return false;
      }

      // Check capabilities
      const ai = (window as any).ai;
      this.capabilities = await ai.summarizer.capabilities();
      
      this.isAvailable = this.capabilities.available === 'readily';
      
      console.debug('[TruthLens Summarizer] API availability:', {
        available: this.isAvailable,
        capabilities: this.capabilities
      });

      return this.isAvailable;
    } catch (error) {
      console.error('[TruthLens Summarizer] Error checking availability:', error);
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Summarize text and extract claims
   */
  async summarizeAndExtractClaims(text: string, options: SummarizerOptions = {}): Promise<SummarizerResult> {
    const isAvailable = await this.checkAvailability();
    if (!isAvailable) {
      throw this.createError('NOT_AVAILABLE', 'Chrome Summarizer API not available');
    }

    if (!text || text.trim().length < 50) {
      throw this.createError('INVALID_INPUT', 'Text too short for summarization (minimum 50 characters)');
    }

    try {
      const ai = (window as any).ai;
      
      // Create summarizer with options
      const summarizerOptions: any = {
        type: options.type || 'key-points',
        format: options.format || 'plain-text',
        length: options.length || 'medium'
      };

      const summarizer = await ai.summarizer.create(summarizerOptions);
      
      try {
        // Get summary
        const summary = await summarizer.summarize(text);
        
        // Extract claims from the summary and original text
        const claims = await this.extractClaims(text, summary);
        
        const result: SummarizerResult = {
          summary,
          claims,
          source: 'on-device',
          timestamp: Date.now(),
          options: summarizerOptions
        };

        console.debug('[TruthLens Summarizer] Summarization successful:', {
          inputLength: text.length,
          summaryLength: summary.length,
          claimsCount: claims.length
        });

        return result;
      } finally {
        // Clean up the summarizer
        summarizer.destroy?.();
      }
    } catch (error) {
      console.error('[TruthLens Summarizer] Error during summarization:', error);
      
      // Handle quota exceeded
      if ((error as any).message?.includes('quota') || (error as any).message?.includes('limit')) {
        throw this.createError('QUOTA_EXCEEDED', 'Summarizer quota exceeded, try again later', error);
      }
      
      throw this.createError('SUMMARIZER_FAILED', 'Failed to summarize text', error);
    }
  }

  /**
   * Extract factual claims from text
   */
  private async extractClaims(originalText: string, summary: string): Promise<string[]> {
    const claims: string[] = [];
    
    // Simple claim extraction using patterns
    // This is a basic implementation - in production, you might want to use
    // the Prompt API for more sophisticated claim extraction
    
    const combinedText = `${summary}\n\n${originalText}`;
    const sentences = this.splitIntoSentences(combinedText);
    
    for (const sentence of sentences) {
      if (this.isFactualClaim(sentence)) {
        const cleanClaim = this.cleanClaim(sentence);
        if (cleanClaim && !claims.includes(cleanClaim)) {
          claims.push(cleanClaim);
        }
      }
    }
    
    // Limit to most important claims
    return claims.slice(0, 10);
  }

  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 20); // Filter out very short fragments
  }

  /**
   * Check if a sentence contains a factual claim
   */
  private isFactualClaim(sentence: string): boolean {
    const lowerSentence = sentence.toLowerCase();
    
    // Skip if it's clearly opinion or subjective
    const opinionWords = ['think', 'believe', 'feel', 'opinion', 'seems', 'appears', 'might', 'could', 'should', 'would'];
    if (opinionWords.some(word => lowerSentence.includes(word))) {
      return false;
    }
    
    // Skip questions
    if (sentence.includes('?')) {
      return false;
    }
    
    // Look for factual indicators
    const factualIndicators = [
      'according to', 'study shows', 'research indicates', 'data reveals',
      'statistics show', 'report states', 'announced', 'confirmed',
      'discovered', 'found that', 'revealed that', 'demonstrated',
      'percent', '%', 'million', 'billion', 'thousand',
      'in 20', 'since 19', 'during', 'between', 'from', 'to',
      'increased', 'decreased', 'rose', 'fell', 'grew', 'declined'
    ];
    
    const hasFactualIndicator = factualIndicators.some(indicator => 
      lowerSentence.includes(indicator)
    );
    
    // Check for specific entities (names, places, organizations)
    const hasProperNoun = /[A-Z][a-z]+/.test(sentence);
    
    // Check for numbers or dates
    const hasNumbers = /\d/.test(sentence);
    
    return hasFactualIndicator || (hasProperNoun && hasNumbers);
  }

  /**
   * Clean and normalize a claim
   */
  private cleanClaim(claim: string): string {
    return claim
      .trim()
      .replace(/^[^\w]+/, '') // Remove leading punctuation
      .replace(/[^\w\s.,!?%-]+$/, '') // Remove trailing punctuation except basic ones
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Get current capabilities
   */
  getCapabilities(): any {
    return this.capabilities;
  }

  /**
   * Create a standardized error
   */
  private createError(code: SummarizerError['code'], message: string, details?: any): SummarizerError {
    return { code, message, details };
  }
}

// Export singleton instance
export const summarizerAdapter = new ChromeSummarizerAdapter();

// Utility functions for common summarization patterns
export async function extractClaimsFromText(text: string): Promise<string[]> {
  try {
    const result = await summarizerAdapter.summarizeAndExtractClaims(text, {
      type: 'key-points',
      length: 'medium'
    });
    return result.claims;
  } catch (error) {
    console.error('[TruthLens] Error extracting claims:', error);
    return [];
  }
}

export async function summarizeForFactCheck(text: string): Promise<SummarizerResult> {
  return summarizerAdapter.summarizeAndExtractClaims(text, {
    type: 'key-points',
    format: 'plain-text',
    length: 'short'
  });
}

export async function summarizeSearchResults(results: Array<{title: string; snippet: string}>): Promise<string> {
  const combinedText = results
    .map(r => `${r.title}: ${r.snippet}`)
    .join('\n\n');
  
  try {
    const result = await summarizerAdapter.summarizeAndExtractClaims(combinedText, {
      type: 'tl;dr',
      length: 'short'
    });
    return result.summary;
  } catch (error) {
    console.error('[TruthLens] Error summarizing search results:', error);
    return 'Unable to summarize search results.';
  }
}

// Fallback claim extraction using simple patterns (when Summarizer API is not available)
export function extractClaimsFallback(text: string): string[] {
  const adapter = new ChromeSummarizerAdapter();
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);
  const claims: string[] = [];
  
  for (const sentence of sentences) {
    if ((adapter as any).isFactualClaim(sentence)) {
      const cleanClaim = (adapter as any).cleanClaim(sentence);
      if (cleanClaim && !claims.includes(cleanClaim)) {
        claims.push(cleanClaim);
      }
    }
  }
  
  return claims.slice(0, 10);
}
