/**
 * Google Fact Check Tools API Adapter for TruthLens
 * Handles fact-checking using Google's Fact Check Tools API with caching
 */

export interface ClaimReview {
  publisher: string;
  url: string;
  title: string;
  reviewDate?: string;
  textualRating: string;
  languageCode: string;
}

export interface FactCheckResult {
  claim: string;
  claimId: string;
  reviews: ClaimReview[];
  evidenceScore: number;
  evidenceBand: 'Low' | 'Medium' | 'High';
  lastChecked: number;
  cached?: boolean;
}

export interface FactCheckError {
  code: 'API_KEY_MISSING' | 'NETWORK_ERROR' | 'QUOTA_EXCEEDED' | 'INVALID_CLAIM' | 'NO_RESULTS';
  message: string;
  details?: any;
}

interface CachedResult {
  result: FactCheckResult;
  timestamp: number;
  ttl: number;
}

class GoogleFactCheckAdapter {
  private readonly API_BASE = 'https://factchecktools.googleapis.com/v1alpha1/claims:search';
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private cache: Map<string, CachedResult> = new Map();
  private apiKey: string | null = null;

  constructor() {
    this.loadApiKey();
    this.loadCache();
  }

  /**
   * Load API key from storage
   */
  private async loadApiKey(): Promise<void> {
    try {
      const result = await chrome.storage.sync.get(['factCheckApiKey']);
      this.apiKey = result['factCheckApiKey'] || null;
      
      if (!this.apiKey) {
        console.warn('[TruthLens FactCheck] No API key configured. Fact-checking will be limited.');
      }
    } catch (error) {
      console.error('[TruthLens FactCheck] Error loading API key:', error);
    }
  }

  /**
   * Set API key
   */
  async setApiKey(apiKey: string): Promise<void> {
    this.apiKey = apiKey;
    try {
      await chrome.storage.sync.set({ factCheckApiKey: apiKey });
      console.debug('[TruthLens FactCheck] API key updated');
    } catch (error) {
      console.error('[TruthLens FactCheck] Error saving API key:', error);
    }
  }

  /**
   * Load cache from storage
   */
  private async loadCache(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['factCheckCache']);
      if (result['factCheckCache']) {
        const cacheData = JSON.parse(result['factCheckCache']);
        this.cache = new Map(cacheData);
        this.cleanExpiredCache();
      }
    } catch (error) {
      console.error('[TruthLens FactCheck] Error loading cache:', error);
    }
  }

  /**
   * Save cache to storage
   */
  private async saveCache(): Promise<void> {
    try {
      const cacheData = Array.from(this.cache.entries());
      await chrome.storage.local.set({ 
        factCheckCache: JSON.stringify(cacheData) 
      });
    } catch (error) {
      console.error('[TruthLens FactCheck] Error saving cache:', error);
    }
  }

  /**
   * Clean expired cache entries
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, cached] of this.cache) {
      if (now - cached.timestamp > cached.ttl) {
        toDelete.push(key);
      }
    }

    toDelete.forEach(key => this.cache.delete(key));
    
    if (toDelete.length > 0) {
      console.debug('[TruthLens FactCheck] Cleaned expired cache entries:', toDelete.length);
      this.saveCache();
    }
  }

  /**
   * Generate cache key for a claim
   */
  private getCacheKey(claim: string): string {
    return `claim_${claim.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_')}`;
  }

  /**
   * Check if claim is cached and valid
   */
  private getCachedResult(claim: string): FactCheckResult | null {
    const key = this.getCacheKey(claim);
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      console.debug('[TruthLens FactCheck] Using cached result for:', claim.substring(0, 50));
      return { ...cached.result, cached: true };
    }
    
    return null;
  }

  /**
   * Cache a fact-check result
   */
  private cacheResult(claim: string, result: FactCheckResult): void {
    const key = this.getCacheKey(claim);
    const cached: CachedResult = {
      result,
      timestamp: Date.now(),
      ttl: this.CACHE_TTL
    };
    
    this.cache.set(key, cached);
    this.saveCache();
  }

  /**
   * Fact-check a claim using Google Fact Check Tools API
   */
  async factCheck(claim: string): Promise<FactCheckResult> {
    if (!claim || claim.trim().length < 10) {
      throw this.createError('INVALID_CLAIM', 'Claim too short for fact-checking');
    }

    // Check cache first
    const cachedResult = this.getCachedResult(claim);
    if (cachedResult) {
      return cachedResult;
    }

    if (!this.apiKey) {
      throw this.createError('API_KEY_MISSING', 'Google Fact Check Tools API key not configured');
    }

    try {
      const url = new URL(this.API_BASE);
      url.searchParams.set('query', claim);
      url.searchParams.set('key', this.apiKey);
      url.searchParams.set('languageCode', 'en');

      console.debug('[TruthLens FactCheck] Checking claim:', claim.substring(0, 100));

      const response = await fetch(url.toString());
      
      if (!response.ok) {
        if (response.status === 429) {
          throw this.createError('QUOTA_EXCEEDED', 'API quota exceeded');
        }
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const result = this.processApiResponse(claim, data);
      
      // Cache the result
      this.cacheResult(claim, result);
      
      console.debug('[TruthLens FactCheck] Fact-check completed:', {
        claim: claim.substring(0, 50),
        reviewsFound: result.reviews.length,
        evidenceScore: result.evidenceScore
      });

      return result;
    } catch (error) {
      console.error('[TruthLens FactCheck] Error fact-checking claim:', error);
      
      if ((error as any).code) {
        throw error; // Re-throw our custom errors
      }
      
      throw this.createError('NETWORK_ERROR', 'Failed to fact-check claim', error);
    }
  }

  /**
   * Process API response and create FactCheckResult
   */
  private processApiResponse(claim: string, data: any): FactCheckResult {
    const reviews: ClaimReview[] = [];
    
    if (data.claims && Array.isArray(data.claims)) {
      for (const claimData of data.claims) {
        if (claimData.claimReview && Array.isArray(claimData.claimReview)) {
          for (const review of claimData.claimReview) {
            reviews.push({
              publisher: review.publisher?.name || 'Unknown Publisher',
              url: review.url || '',
              title: review.title || 'Untitled Review',
              reviewDate: review.reviewDate,
              textualRating: review.textualRating || 'No Rating',
              languageCode: review.languageCode || 'en'
            });
          }
        }
      }
    }

    if (reviews.length === 0) {
      throw this.createError('NO_RESULTS', 'No fact-check reviews found for this claim');
    }

    // Calculate evidence score using the scoring utility
    const evidenceScore = this.calculateEvidenceScore(reviews);
    const evidenceBand = this.getEvidenceBand(evidenceScore);

    const claimId = `claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      claim,
      claimId,
      reviews,
      evidenceScore,
      evidenceBand,
      lastChecked: Date.now(),
      cached: false
    };
  }

  /**
   * Calculate evidence score based on reviews
   */
  private calculateEvidenceScore(reviews: ClaimReview[]): number {
    let score = 0;
    
    // +40 if ≥2 unique publishers
    const uniquePublishers = new Set(reviews.map(r => r.publisher).filter(Boolean));
    if (uniquePublishers.size >= 2) {
      score += 40;
    }
    
    // +20 if most recent review < 12 months
    const recentReview = reviews.some(r => {
      if (!r.reviewDate) return false;
      const reviewTime = new Date(r.reviewDate).getTime();
      const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
      return reviewTime > oneYearAgo;
    });
    
    if (recentReview) {
      score += 20;
    }
    
    // +10 per corroborating source (max +20)
    // This is simplified - in practice, you'd analyze the ratings
    const positiveRatings = reviews.filter(r => 
      r.textualRating.toLowerCase().includes('true') ||
      r.textualRating.toLowerCase().includes('correct') ||
      r.textualRating.toLowerCase().includes('accurate')
    );
    
    score += Math.min(positiveRatings.length * 10, 20);
    
    // -20 if detected counter-claim with newer date
    // This would require more sophisticated analysis
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get evidence band from score
   */
  private getEvidenceBand(score: number): 'Low' | 'Medium' | 'High' {
    if (score >= 70) return 'High';
    if (score >= 40) return 'Medium';
    return 'Low';
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate?: number } {
    return {
      size: this.cache.size
    };
  }

  /**
   * Clear cache
   */
  async clearCache(): Promise<void> {
    this.cache.clear();
    await chrome.storage.local.remove(['factCheckCache']);
    console.debug('[TruthLens FactCheck] Cache cleared');
  }

  /**
   * Create a standardized error
   */
  private createError(code: FactCheckError['code'], message: string, details?: any): FactCheckError {
    return { code, message, details };
  }
}

// Export singleton instance
export const factCheckAdapter = new GoogleFactCheckAdapter();

// Utility function for batch fact-checking
export async function factCheckClaims(claims: string[]): Promise<FactCheckResult[]> {
  const results: FactCheckResult[] = [];
  
  for (const claim of claims) {
    try {
      const result = await factCheckAdapter.factCheck(claim);
      results.push(result);
    } catch (error) {
      console.error('[TruthLens] Error fact-checking claim:', claim, error);
      // Continue with other claims even if one fails
    }
  }
  
  return results;
}
