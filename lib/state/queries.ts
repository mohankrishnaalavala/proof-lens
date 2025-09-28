/**
 * React Query Setup for TruthLens
 * Intelligent API response caching and background refetching
 */

import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import type { FactCheckResult, AIResult, ChromeAICapabilities } from '../types/messages';
import { factCheckAdapter } from '../adapters/factcheck';
import { promptAdapter, extractClaimsPrompt, synthesizeSearchResults } from '../adapters/prompt';
import { summarizerAdapter, extractClaimsFromText } from '../adapters/summarizer';
import { firebaseAdapter } from '../adapters/firebase';

import { truthLensCache } from './cache';
import { promptViaContent, extractClaimsViaContent } from '../bridge/onDevice';

// Query Keys
export const queryKeys = {
  capabilities: ['capabilities'] as const,
  factCheck: (claim: string) => ['factCheck', claim] as const,
  extractClaims: (text: string) => ['extractClaims', text] as const,
  promptResponse: (message: string, sessionId?: string) => ['promptResponse', message, sessionId] as const,
  searchSynthesis: (query: string, results: any[]) => ['searchSynthesis', query, results] as const,
  chatHistory: ['chatHistory'] as const,
} as const;

// Query Client Configuration
export const createQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 24 * 60 * 60 * 1000, // 24 hours (formerly cacheTime)
        retry: (failureCount, error) => {
          // Don't retry on certain errors
          if ((error as any)?.code === 'NOT_AVAILABLE' || (error as any)?.code === 'API_KEY_MISSING') {
            return false;
          }
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 1,
      },
    },
  });
};

// Capabilities Query
export const useCapabilitiesQuery = () => {
  return useQuery({
    queryKey: queryKeys.capabilities,
    queryFn: async (): Promise<ChromeAICapabilities> => {
      const promptAvailable = await promptAdapter.checkAvailability();
      const summarizerAvailable = await summarizerAdapter.checkAvailability();
      // const cloudAvailable = firebaseAdapter.isAvailable();

      return {
        promptAPI: {
          available: promptAvailable,
          defaultTemperature: 0.7,
          defaultTopK: 3,
          maxTopK: 8,
        },
        summarizerAPI: {
          available: summarizerAvailable,
          defaultType: 'key-points',
          defaultFormat: 'markdown',
          defaultLength: 'medium',
        },
        writerAPI: {
          available: false, // Not implemented yet
          defaultTone: 'neutral',
          defaultFormat: 'markdown',
          defaultLength: 'medium',
        },
        rewriterAPI: {
          available: false, // Not implemented yet
          defaultTone: 'neutral',
          defaultFormat: 'markdown',
          defaultLength: 'medium',
        },
        // cloudFallback: cloudAvailable,
      };
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // Check every 5 minutes
  });
};

// Fact Check Query
export const useFactCheckQuery = (claim: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: queryKeys.factCheck(claim),
    queryFn: async (): Promise<FactCheckResult> => {
      if (!claim || claim.trim().length < 10) {
        throw new Error('Claim too short for fact-checking');
      }
      // Try persistent cache first (IndexedDB)
      try {
        const cached = await truthLensCache.getFactCheck(claim);
        if (cached) return cached;
      } catch (e) {
        console.debug('[TruthLens Queries] IDB getFactCheck failed, continuing:', e);
      }

      const result = await factCheckAdapter.factCheck(claim);
      // Store in persistent cache (best-effort)
      try { await truthLensCache.storeFactCheck(claim, result); } catch (e) { console.debug('[TruthLens Queries] IDB storeFactCheck failed:', e); }
      return result;
    },
    enabled: enabled && !!claim && claim.trim().length >= 10,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - fact checks are relatively stable
    gcTime: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

// Extract Claims Query
export const useExtractClaimsQuery = (text: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: queryKeys.extractClaims(text),
    queryFn: async (): Promise<string[]> => {
      if (!text || text.trim().length < 50) {
        throw new Error('Text too short for claim extraction');
      }

      try {
        // Try Chrome Summarizer API first
        const onDeviceClaims = await extractClaimsFromText(text);
        if (onDeviceClaims && onDeviceClaims.length > 0) return onDeviceClaims;
      } catch (error) {
        console.debug('[TruthLens Queries] Summarizer threw, will try other paths:', error);
      }

      // Try via content script (on-device bridge)
      try {
        const bridgedClaims = await extractClaimsViaContent(text);
        if (bridgedClaims && bridgedClaims.length > 0) return bridgedClaims;
      } catch (bridgeErr) {
        console.debug('[TruthLens Queries] Content bridge extract failed:', bridgeErr);
      }

      // Fallback to Prompt API (on-device in panel, may fail)
      try {
        const result = await extractClaimsPrompt(text);
        const claims = result.response
          .split('\n')
          .map(line => line.trim())
          .map(line => line.replace(/^\d+\.\s*/, '').replace(/^[-*]\s*/, ''))
          .filter(claim => claim.length > 10);
        return claims;
      } catch (promptError) {
        console.debug('[TruthLens Queries] Prompt API failed, trying cloud fallback:', promptError);

        // Final fallback to cloud
        if (firebaseAdapter.isAvailable()) {
          const cloudResult = await firebaseAdapter.extractClaimsCloud(text);
          const claims = cloudResult.response
            .split('\n')
            .map(line => line.trim())
            .map(line => line.replace(/^\d+\.\s*/, '').replace(/^[-*]\s*/, ''))
            .filter(claim => claim.length > 10);
          return claims;
        }
        throw new Error('No AI service available for claim extraction');
      }
    },
    enabled: enabled && !!text && text.trim().length >= 50,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
  });
};

// Search Synthesis Query
export const useSearchSynthesisQuery = (
  query: string,
  results: Array<{title: string; snippet: string; url: string}>,
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: queryKeys.searchSynthesis(query, results),
    queryFn: async (): Promise<AIResult> => {
      if (!query || !results || results.length === 0) {
        throw new Error('Invalid search parameters');
      }

      try {
        // Try on-device first
        return await synthesizeSearchResults(query, results);
      } catch (error) {
        console.debug('[TruthLens Queries] On-device synthesis failed, trying cloud:', error);

        // Fallback to cloud
        if (firebaseAdapter.isAvailable()) {
          return await firebaseAdapter.synthesizeSearchResultsCloud(query, results);
        }

        throw new Error('No AI service available for search synthesis');
      }
    },
    enabled: enabled && !!query && !!results && results.length > 0,
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 2 * 60 * 60 * 1000, // 2 hours
  });
};

// Fact Check Mutation
export const useFactCheckMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (claim: string): Promise<FactCheckResult> => {
      return await factCheckAdapter.factCheck(claim);
    },
    onSuccess: (data, claim) => {
      // Update the cache with the new result
      queryClient.setQueryData(queryKeys.factCheck(claim), data);

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['factCheck'] });
    },
    onError: (error) => {
      console.error('[TruthLens Queries] Fact check mutation failed:', error);
    },
  });
};

// Prompt Mutation
export const usePromptMutation = () => {
  return useMutation({
    mutationFn: async ({
      message,
      systemPrompt,
      useCloud = false
    }: {
      message: string;
      systemPrompt?: string;
      useCloud?: boolean;
    }): Promise<AIResult> => {
      if (useCloud && firebaseAdapter.isAvailable()) {
        return await firebaseAdapter.prompt(message, systemPrompt ? { systemPrompt } : {});
      }

      // Prefer on-device in panel; if unavailable, try content bridge
      const onDeviceAvailable = await promptAdapter.checkAvailability().catch(() => false);
      if (onDeviceAvailable) {
        try {
          return await promptAdapter.promptOnce(message, systemPrompt ? { systemPrompt } : {});
        } catch (error) {
          console.debug('[TruthLens Queries] On-device prompt failed in panel, trying bridge:', error);
        }
      }

      try {
        return await promptViaContent(message, systemPrompt);
      } catch (bridgeErr) {
        console.debug('[TruthLens Queries] Content-bridge prompt failed:', bridgeErr);
      }

      // Final fallback to cloud
      if (firebaseAdapter.isAvailable()) {
        console.debug('[TruthLens Queries] Auto-fallback to cloud for prompt');
        return await firebaseAdapter.prompt(message, systemPrompt ? { systemPrompt } : {});
      }
      throw new Error('No AI service available for prompt');
    },
    onError: (error) => {
      console.error('[TruthLens Queries] Prompt mutation failed:', error);
    },
  });
};

// Chat Mutation
export const useChatMutation = () => {
  return useMutation({
    mutationFn: async ({
      message,
      context,
      useCloud = false
    }: {
      message: string;
      context?: string;
      useCloud?: boolean;
    }): Promise<AIResult> => {
      if (useCloud && firebaseAdapter.isAvailable()) {
        return await firebaseAdapter.chatWithAnalyst(message, context);
      }

      const systemPrompt = `You are a research analyst assistant. Help users understand complex topics by providing clear, well-structured analysis. Break down information into key points, identify important patterns, and suggest relevant follow-up questions.`;

      let fullMessage = message;
      if (context) {
        fullMessage = `Context: ${context}\n\nQuestion: ${message}`;
      }

      // Prefer on-device in panel; if unavailable, try content bridge
      const onDeviceAvailable = await promptAdapter.checkAvailability().catch(() => false);
      if (onDeviceAvailable) {
        try {
          return await promptAdapter.promptOnce(fullMessage, { systemPrompt, temperature: 0.6 });
        } catch (error) {
          console.debug('[TruthLens Queries] On-device chat failed in panel, trying bridge:', error);
        }
      }

      try {
        return await promptViaContent(fullMessage, systemPrompt);
      } catch (bridgeErr) {
        console.debug('[TruthLens Queries] Content-bridge chat failed:', bridgeErr);
      }

      // Final fallback to cloud
      if (firebaseAdapter.isAvailable()) {
        console.debug('[TruthLens Queries] Auto-fallback to cloud for chat');
        return await firebaseAdapter.chatWithAnalyst(message, context);
      }
      throw new Error('No AI service available for chat');
    },
    onError: (error) => {
      console.error('[TruthLens Queries] Chat mutation failed:', error);
    },
  });
};

// Utility hooks for cache management
export const useInvalidateQueries = () => {
  const queryClient = useQueryClient();

  return {
    invalidateCapabilities: () => queryClient.invalidateQueries({ queryKey: queryKeys.capabilities }),
    invalidateFactChecks: () => queryClient.invalidateQueries({ queryKey: ['factCheck'] }),
    invalidateAll: () => queryClient.invalidateQueries(),
    clearCache: () => queryClient.clear(),
  };
};

export const usePrefetchFactCheck = () => {
  const queryClient = useQueryClient();

  return (claim: string) => {
    if (claim && claim.trim().length >= 10) {
      queryClient.prefetchQuery({
        queryKey: queryKeys.factCheck(claim),
        queryFn: () => factCheckAdapter.factCheck(claim),
        staleTime: 24 * 60 * 60 * 1000,
      });
    }
  };
};
