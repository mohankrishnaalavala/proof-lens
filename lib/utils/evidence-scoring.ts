/**
 * Evidence Scoring Utility for TruthLens
 * Implementation based on TRUTHLENS_SPEC.md section 5.4
 */

export interface EvidenceReview {
  publisher: string;
  reviewDate?: string;
  textualRating?: string;
  url?: string;
  title?: string;
}

export interface EvidenceScore {
  score: number;
  band: 'Low' | 'Medium' | 'High';
  breakdown: {
    publisherDiversity: number;
    recency: number;
    corroboration: number;
    counterClaims: number;
  };
  explanation: string[];
}

/**
 * Score evidence based on reviews according to TRUTHLENS_SPEC.md section 5.4
 * 
 * Scoring algorithm:
 * - +40 if ≥2 unique publishers
 * - +20 if most recent review < 12 months
 * - +10 per corroborating source (max +20)
 * - -20 if detected counter-claim with newer date
 */
export function scoreEvidence(
  reviews: EvidenceReview[], 
  primaryCount: number = 0, 
  newerCounter: boolean = false
): EvidenceScore {
  let score = 0;
  const explanation: string[] = [];
  const breakdown = {
    publisherDiversity: 0,
    recency: 0,
    corroboration: 0,
    counterClaims: 0
  };

  // Publisher diversity (+40 if ≥2 unique publishers)
  const publishers = new Set(reviews.map(r => r.publisher).filter(Boolean));
  if (publishers.size >= 2) {
    breakdown.publisherDiversity = 40;
    score += 40;
    explanation.push(`+40: Multiple publishers (${publishers.size}) provide diverse perspectives`);
  } else if (publishers.size === 1) {
    explanation.push(`+0: Only one publisher found - diversity bonus not applied`);
  } else {
    explanation.push(`+0: No valid publishers identified`);
  }

  // Recency (+20 if most recent review < 12 months)
  const recent = reviews.some(r => {
    if (!r.reviewDate) return false;
    const reviewTime = new Date(r.reviewDate).getTime();
    const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
    return reviewTime > oneYearAgo;
  });

  if (recent) {
    breakdown.recency = 20;
    score += 20;
    explanation.push(`+20: Recent fact-checks (within 12 months) available`);
  } else {
    explanation.push(`+0: No recent fact-checks found (older than 12 months)`);
  }

  // Corroboration (+10 per corroborating source, max +20)
  const corroborationScore = Math.min(primaryCount * 10, 20);
  breakdown.corroboration = corroborationScore;
  score += corroborationScore;
  
  if (corroborationScore > 0) {
    explanation.push(`+${corroborationScore}: ${primaryCount} corroborating source${primaryCount > 1 ? 's' : ''} found`);
  } else {
    explanation.push(`+0: No corroborating sources identified`);
  }

  // Counter-claims (-20 if detected counter-claim with newer date)
  if (newerCounter) {
    breakdown.counterClaims = -20;
    score -= 20;
    explanation.push(`-20: Newer counter-claims detected that contradict this claim`);
  } else {
    explanation.push(`+0: No newer counter-claims detected`);
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(100, score));

  // Determine evidence band
  const band = getEvidenceBand(score);

  return {
    score,
    band,
    breakdown,
    explanation
  };
}

/**
 * Get evidence band from numerical score
 */
export function getEvidenceBand(score: number): 'Low' | 'Medium' | 'High' {
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

/**
 * Enhanced evidence scoring with textual rating analysis
 */
export function scoreEvidenceEnhanced(reviews: EvidenceReview[]): EvidenceScore {
  // Analyze textual ratings to determine corroboration and counter-claims
  const { corroborating, contradicting } = analyzeTextualRatings(reviews);
  
  // Check for newer counter-claims
  const newerCounter = hasNewerCounterClaims(reviews, contradicting);
  
  return scoreEvidence(reviews, corroborating.length, newerCounter);
}

/**
 * Analyze textual ratings to categorize reviews
 */
function analyzeTextualRatings(reviews: EvidenceReview[]): {
  corroborating: EvidenceReview[];
  contradicting: EvidenceReview[];
  neutral: EvidenceReview[];
} {
  const corroborating: EvidenceReview[] = [];
  const contradicting: EvidenceReview[] = [];
  const neutral: EvidenceReview[] = [];

  for (const review of reviews) {
    const rating = (review.textualRating || '').toLowerCase();
    
    // Positive/corroborating ratings
    if (
      rating.includes('true') ||
      rating.includes('correct') ||
      rating.includes('accurate') ||
      rating.includes('verified') ||
      rating.includes('confirmed')
    ) {
      corroborating.push(review);
    }
    // Negative/contradicting ratings
    else if (
      rating.includes('false') ||
      rating.includes('incorrect') ||
      rating.includes('inaccurate') ||
      rating.includes('debunked') ||
      rating.includes('misleading') ||
      rating.includes('unsubstantiated')
    ) {
      contradicting.push(review);
    }
    // Neutral or unclear ratings
    else {
      neutral.push(review);
    }
  }

  return { corroborating, contradicting, neutral };
}

/**
 * Check if there are newer counter-claims
 */
function hasNewerCounterClaims(
  allReviews: EvidenceReview[], 
  contradictingReviews: EvidenceReview[]
): boolean {
  if (contradictingReviews.length === 0) return false;

  // Find the most recent contradicting review
  const newestContradicting = contradictingReviews
    .filter(r => r.reviewDate)
    .sort((a, b) => new Date(b.reviewDate!).getTime() - new Date(a.reviewDate!).getTime())[0];

  if (!newestContradicting) return false;

  // Find the most recent supporting review
  const supportingReviews = allReviews.filter(r => 
    !contradictingReviews.includes(r) && r.reviewDate
  );

  if (supportingReviews.length === 0) return true; // Only contradicting reviews exist

  const newestSupporting = supportingReviews
    .sort((a, b) => new Date(b.reviewDate!).getTime() - new Date(a.reviewDate!).getTime())[0];

  // Counter-claim is newer if it's more recent than the newest supporting review
  return new Date(newestContradicting.reviewDate!).getTime() >
         new Date(newestSupporting?.reviewDate!).getTime();
}

/**
 * Get a human-readable explanation of the evidence score
 */
export function getScoreExplanation(evidenceScore: EvidenceScore): string {
  const { score, band, explanation } = evidenceScore;
  
  let summary = `Evidence Score: ${score}/100 (${band})\n\n`;
  summary += `Scoring breakdown:\n`;
  summary += explanation.map(exp => `• ${exp}`).join('\n');
  
  summary += `\n\nEvidence Band: ${band}`;
  
  switch (band) {
    case 'High':
      summary += ` - Strong evidence from multiple reliable sources with recent verification.`;
      break;
    case 'Medium':
      summary += ` - Moderate evidence available, but may lack diversity or recency.`;
      break;
    case 'Low':
      summary += ` - Limited evidence available. Additional verification recommended.`;
      break;
  }

  return summary;
}

/**
 * Compare evidence scores for ranking
 */
export function compareEvidenceScores(a: EvidenceScore, b: EvidenceScore): number {
  // Primary sort by score
  if (a.score !== b.score) {
    return b.score - a.score; // Higher scores first
  }
  
  // Secondary sort by publisher diversity
  if (a.breakdown.publisherDiversity !== b.breakdown.publisherDiversity) {
    return b.breakdown.publisherDiversity - a.breakdown.publisherDiversity;
  }
  
  // Tertiary sort by recency
  return b.breakdown.recency - a.breakdown.recency;
}

/**
 * Aggregate evidence scores for multiple claims
 */
export function aggregateEvidenceScores(scores: EvidenceScore[]): {
  averageScore: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  overallBand: 'Low' | 'Medium' | 'High';
} {
  if (scores.length === 0) {
    return {
      averageScore: 0,
      highConfidenceCount: 0,
      mediumConfidenceCount: 0,
      lowConfidenceCount: 0,
      overallBand: 'Low'
    };
  }

  const averageScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
  
  const highConfidenceCount = scores.filter(s => s.band === 'High').length;
  const mediumConfidenceCount = scores.filter(s => s.band === 'Medium').length;
  const lowConfidenceCount = scores.filter(s => s.band === 'Low').length;
  
  const overallBand = getEvidenceBand(averageScore);

  return {
    averageScore: Math.round(averageScore),
    highConfidenceCount,
    mediumConfidenceCount,
    lowConfidenceCount,
    overallBand
  };
}

// Export the original function from the spec for compatibility
export { scoreEvidence as scoreEvidenceOriginal };
