/**
 * IndexedDB Cache for TruthLens
 * 24h TTL fact-check result persistence and cache management
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { FactCheckResult, AIResult } from '../types/messages';

// Database Schema
interface TruthLensDB extends DBSchema {
  factChecks: {
    key: string;
    value: {
      id: string;
      claim: string;
      result: FactCheckResult;
      timestamp: number;
      ttl: number;
    };
    indexes: {
      'by-timestamp': number;
      'by-claim': string;
    };
  };
  
  aiResponses: {
    key: string;
    value: {
      id: string;
      query: string;
      response: AIResult;
      timestamp: number;
      ttl: number;
      type: 'prompt' | 'chat' | 'synthesis' | 'claims';
    };
    indexes: {
      'by-timestamp': number;
      'by-type': string;
      'by-query': string;
    };
  };
  
  chatHistory: {
    key: string;
    value: {
      id: string;
      message: string;
      response: string;
      source: 'on-device' | 'cloud';
      timestamp: number;
      context?: string;
    };
    indexes: {
      'by-timestamp': number;
      'by-source': string;
    };
  };
  
  briefData: {
    key: string;
    value: {
      id: string;
      facts: string[];
      analysis: string[];
      recommendations: string[];
      timestamp: number;
      version: number;
    };
    indexes: {
      'by-timestamp': number;
      'by-version': number;
    };
  };
}

class TruthLensCache {
  private db: IDBPDatabase<TruthLensDB> | null = null;
  private readonly DB_NAME = 'TruthLensCache';
  private readonly DB_VERSION = 1;
  private readonly DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Initialize the database
   */
  async init(): Promise<void> {
    try {
      this.db = await openDB<TruthLensDB>(this.DB_NAME, this.DB_VERSION, {
        upgrade(db) {
          // Fact checks store
          const factChecksStore = db.createObjectStore('factChecks', { keyPath: 'id' });
          factChecksStore.createIndex('by-timestamp', 'timestamp');
          factChecksStore.createIndex('by-claim', 'claim');

          // AI responses store
          const aiResponsesStore = db.createObjectStore('aiResponses', { keyPath: 'id' });
          aiResponsesStore.createIndex('by-timestamp', 'timestamp');
          aiResponsesStore.createIndex('by-type', 'type');
          aiResponsesStore.createIndex('by-query', 'query');

          // Chat history store
          const chatHistoryStore = db.createObjectStore('chatHistory', { keyPath: 'id' });
          chatHistoryStore.createIndex('by-timestamp', 'timestamp');
          chatHistoryStore.createIndex('by-source', 'source');

          // Brief data store
          const briefDataStore = db.createObjectStore('briefData', { keyPath: 'id' });
          briefDataStore.createIndex('by-timestamp', 'timestamp');
          briefDataStore.createIndex('by-version', 'version');
        },
      });

      console.debug('[TruthLens Cache] Database initialized');
      
      // Clean up expired entries on init
      await this.cleanupExpired();
    } catch (error) {
      console.error('[TruthLens Cache] Failed to initialize database:', error);
    }
  }

  /**
   * Generate cache key for a claim
   */
  private generateClaimKey(claim: string): string {
    return `claim_${claim.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_')}`;
  }

  /**
   * Generate cache key for AI response
   */
  private generateResponseKey(query: string, type: string): string {
    return `${type}_${query.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_')}`;
  }

  /**
   * Store fact-check result
   */
  async storeFactCheck(claim: string, result: FactCheckResult, ttl?: number): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    try {
      const id = this.generateClaimKey(claim);
      const entry = {
        id,
        claim,
        result,
        timestamp: Date.now(),
        ttl: ttl || this.DEFAULT_TTL,
      };

      await this.db.put('factChecks', entry);
      console.debug('[TruthLens Cache] Stored fact-check:', claim.substring(0, 50));
    } catch (error) {
      console.error('[TruthLens Cache] Failed to store fact-check:', error);
    }
  }

  /**
   * Retrieve fact-check result
   */
  async getFactCheck(claim: string): Promise<FactCheckResult | null> {
    if (!this.db) await this.init();
    if (!this.db) return null;

    try {
      const id = this.generateClaimKey(claim);
      const entry = await this.db.get('factChecks', id);

      if (!entry) return null;

      // Check if expired
      if (Date.now() - entry.timestamp > entry.ttl) {
        await this.db.delete('factChecks', id);
        return null;
      }

      console.debug('[TruthLens Cache] Retrieved fact-check from cache:', claim.substring(0, 50));
      return { ...entry.result, cached: true };
    } catch (error) {
      console.error('[TruthLens Cache] Failed to retrieve fact-check:', error);
      return null;
    }
  }

  /**
   * Store AI response
   */
  async storeAIResponse(
    query: string,
    response: AIResult,
    type: 'prompt' | 'chat' | 'synthesis' | 'claims',
    ttl?: number
  ): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    try {
      const id = this.generateResponseKey(query, type);
      const entry = {
        id,
        query,
        response,
        timestamp: Date.now(),
        ttl: ttl || (60 * 60 * 1000), // 1 hour default for AI responses
        type,
      };

      await this.db.put('aiResponses', entry);
      console.debug('[TruthLens Cache] Stored AI response:', type, query.substring(0, 50));
    } catch (error) {
      console.error('[TruthLens Cache] Failed to store AI response:', error);
    }
  }

  /**
   * Retrieve AI response
   */
  async getAIResponse(
    query: string,
    type: 'prompt' | 'chat' | 'synthesis' | 'claims'
  ): Promise<AIResult | null> {
    if (!this.db) await this.init();
    if (!this.db) return null;

    try {
      const id = this.generateResponseKey(query, type);
      const entry = await this.db.get('aiResponses', id);

      if (!entry) return null;

      // Check if expired
      if (Date.now() - entry.timestamp > entry.ttl) {
        await this.db.delete('aiResponses', id);
        return null;
      }

      console.debug('[TruthLens Cache] Retrieved AI response from cache:', type, query.substring(0, 50));
      return entry.response;
    } catch (error) {
      console.error('[TruthLens Cache] Failed to retrieve AI response:', error);
      return null;
    }
  }

  /**
   * Store chat message
   */
  async storeChatMessage(
    message: string,
    response: string,
    source: 'on-device' | 'cloud',
    context?: string
  ): Promise<string> {
    if (!this.db) await this.init();
    if (!this.db) return '';

    try {
      const id = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const entry = {
        id,
        message,
        response,
        source,
        timestamp: Date.now(),
        context,
      };

      await this.db.put('chatHistory', {
        ...entry,
        context: context || '',
      });
      console.debug('[TruthLens Cache] Stored chat message');
      return id;
    } catch (error) {
      console.error('[TruthLens Cache] Failed to store chat message:', error);
      return '';
    }
  }

  /**
   * Get chat history
   */
  async getChatHistory(limit: number = 50): Promise<Array<{
    id: string;
    message: string;
    response: string;
    source: 'on-device' | 'cloud';
    timestamp: number;
    context?: string;
  }>> {
    if (!this.db) await this.init();
    if (!this.db) return [];

    try {
      const tx = this.db.transaction('chatHistory', 'readonly');
      const index = tx.store.index('by-timestamp');
      const entries = await index.getAll();

      // Sort by timestamp descending and limit
      return entries
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    } catch (error) {
      console.error('[TruthLens Cache] Failed to retrieve chat history:', error);
      return [];
    }
  }

  /**
   * Clear chat history
   */
  async clearChatHistory(): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    try {
      await this.db.clear('chatHistory');
      console.debug('[TruthLens Cache] Cleared chat history');
    } catch (error) {
      console.error('[TruthLens Cache] Failed to clear chat history:', error);
    }
  }

  /**
   * Store brief data
   */
  async storeBriefData(
    facts: string[],
    analysis: string[],
    recommendations: string[]
  ): Promise<string> {
    if (!this.db) await this.init();
    if (!this.db) return '';

    try {
      const id = `brief_${Date.now()}`;
      const entry = {
        id,
        facts,
        analysis,
        recommendations,
        timestamp: Date.now(),
        version: 1,
      };

      await this.db.put('briefData', entry);
      console.debug('[TruthLens Cache] Stored brief data');
      return id;
    } catch (error) {
      console.error('[TruthLens Cache] Failed to store brief data:', error);
      return '';
    }
  }

  /**
   * Get latest brief data
   */
  async getLatestBriefData(): Promise<{
    id: string;
    facts: string[];
    analysis: string[];
    recommendations: string[];
    timestamp: number;
    version: number;
  } | null> {
    if (!this.db) await this.init();
    if (!this.db) return null;

    try {
      const tx = this.db.transaction('briefData', 'readonly');
      const index = tx.store.index('by-timestamp');
      const entries = await index.getAll();

      if (entries.length === 0) return null;

      // Return the most recent entry
      return entries.sort((a, b) => b.timestamp - a.timestamp)[0] || null;
    } catch (error) {
      console.error('[TruthLens Cache] Failed to retrieve brief data:', error);
      return null;
    }
  }

  /**
   * Clean up expired entries
   */
  async cleanupExpired(): Promise<void> {
    if (!this.db) return;

    try {
      const now = Date.now();
      
      // Clean fact checks
      const factCheckTx = this.db.transaction('factChecks', 'readwrite');
      const factCheckCursor = await factCheckTx.store.openCursor();
      let factCheckCount = 0;
      
      while (factCheckCursor) {
        const entry = factCheckCursor.value;
        if (now - entry.timestamp > entry.ttl) {
          await factCheckCursor.delete();
          factCheckCount++;
        }
        await factCheckCursor.continue();
      }

      // Clean AI responses
      const aiResponseTx = this.db.transaction('aiResponses', 'readwrite');
      const aiResponseCursor = await aiResponseTx.store.openCursor();
      let aiResponseCount = 0;
      
      while (aiResponseCursor) {
        const entry = aiResponseCursor.value;
        if (now - entry.timestamp > entry.ttl) {
          await aiResponseCursor.delete();
          aiResponseCount++;
        }
        await aiResponseCursor.continue();
      }

      if (factCheckCount > 0 || aiResponseCount > 0) {
        console.debug('[TruthLens Cache] Cleaned up expired entries:', {
          factChecks: factCheckCount,
          aiResponses: aiResponseCount,
        });
      }
    } catch (error) {
      console.error('[TruthLens Cache] Failed to cleanup expired entries:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    factChecks: number;
    aiResponses: number;
    chatHistory: number;
    briefData: number;
  }> {
    if (!this.db) await this.init();
    if (!this.db) return { factChecks: 0, aiResponses: 0, chatHistory: 0, briefData: 0 };

    try {
      const [factChecks, aiResponses, chatHistory, briefData] = await Promise.all([
        this.db.count('factChecks'),
        this.db.count('aiResponses'),
        this.db.count('chatHistory'),
        this.db.count('briefData'),
      ]);

      return { factChecks, aiResponses, chatHistory, briefData };
    } catch (error) {
      console.error('[TruthLens Cache] Failed to get stats:', error);
      return { factChecks: 0, aiResponses: 0, chatHistory: 0, briefData: 0 };
    }
  }

  /**
   * Clear all cache data
   */
  async clearAll(): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    try {
      await Promise.all([
        this.db.clear('factChecks'),
        this.db.clear('aiResponses'),
        this.db.clear('chatHistory'),
        this.db.clear('briefData'),
      ]);

      console.debug('[TruthLens Cache] Cleared all cache data');
    } catch (error) {
      console.error('[TruthLens Cache] Failed to clear all cache data:', error);
    }
  }
}

// Export singleton instance
export const truthLensCache = new TruthLensCache();

// Initialize cache on module load
truthLensCache.init().catch(console.error);
