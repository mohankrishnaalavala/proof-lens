/**
 * TruthLens AI Adapters
 * Centralized exports for all AI integration adapters
 */

// Chrome AI Adapters
export * from './prompt';
export * from './summarizer';

// External API Adapters
export * from './factcheck';
export * from './firebase';

// Utilities
export * from '../utils/evidence-scoring';

// Re-export key types for convenience
export type {
  PromptResult,
  PromptOptions,
  PromptError
} from './prompt';

export type {
  SummarizerResult,
  SummarizerOptions,
  SummarizerError
} from './summarizer';

export type {
  FactCheckResult,
  ClaimReview,
  FactCheckError
} from './factcheck';

export type {
  CloudPromptResult,
  CloudPromptOptions,
  CloudError,
  FirebaseConfig
} from './firebase';

export type {
  EvidenceScore,
  EvidenceReview
} from '../utils/evidence-scoring';
