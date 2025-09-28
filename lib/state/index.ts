/**
 * TruthLens State Management
 * Centralized exports for all state management utilities
 */

// Zustand Store
export * from './store';
export {
  useTruthLensStore,
  useUIState,
  useCapabilities,
  usePreferences,
  useSession,
  useFactChecks,

  useBriefData,
} from './store';

// React Query
export * from './queries';
export {
  createQueryClient,
  queryKeys,
  useCapabilitiesQuery,
  useFactCheckQuery,
  useExtractClaimsQuery,
  useSearchSynthesisQuery,
  useFactCheckMutation,
  usePromptMutation,
  useChatMutation,
  useInvalidateQueries,
  usePrefetchFactCheck,
} from './queries';

// IndexedDB Cache
export { truthLensCache } from './cache';

// Chat History Management
export * from './chat';
export { chatHistoryManager, useChatHistory } from './chat';

// Brief Compilation
export * from './brief';
export { briefCompiler, useBriefCompiler } from './brief';

// Re-export key types for convenience
export type {
  UIState,
  CapabilitiesState,
  UserPreferences,
  SessionData,
  TruthLensStore,
} from './store';

export type {
  ChatMessage,
  ChatSession,
  ChatStats,
} from './chat';

export type {
  BriefSection,
  DecisionBrief,
  BriefExportOptions,
} from './brief';
