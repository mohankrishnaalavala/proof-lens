/**
 * Chat History Management for TruthLens
 * Conversation persistence and management utilities
 */

import { truthLensCache } from './cache';
import { useTruthLensStore } from './store';

export interface ChatMessage {
  id: string;
  message: string;
  response: string;
  source: 'on-device' | 'cloud';
  timestamp: number;
  context?: string;
  metadata?: {
    model?: string;
    tokensUsed?: number;
    responseTime?: number;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  lastUpdated: number;
  totalMessages: number;
}

export interface ChatStats {
  totalSessions: number;
  totalMessages: number;
  onDeviceMessages: number;
  cloudMessages: number;
  averageResponseTime: number;
}

class ChatHistoryManager {
  private readonly MAX_MESSAGES_PER_SESSION = 100;
  private readonly MAX_SESSIONS = 50;
  // private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  /**
   * Add a new chat message
   */
  async addMessage(
    message: string,
    response: string,
    source: 'on-device' | 'cloud',
    context?: string,
    // metadata?: ChatMessage['metadata']
  ): Promise<string> {
    try {
      // Store in IndexedDB cache
      const messageId = await truthLensCache.storeChatMessage(message, response, source, context);
      
      // Update Zustand store
      const store = useTruthLensStore.getState();
      store.addChatMessage(message, response, source);
      
      console.debug('[TruthLens Chat] Added message:', {
        messageId,
        source,
        messageLength: message.length,
        responseLength: response.length,
      });

      return messageId;
    } catch (error) {
      console.error('[TruthLens Chat] Failed to add message:', error);
      return '';
    }
  }

  /**
   * Get chat history with pagination
   */
  async getHistory(limit: number = 50, offset: number = 0): Promise<ChatMessage[]> {
    try {
      const messages = await truthLensCache.getChatHistory(limit + offset);
      
      // Apply offset and return requested slice
      return messages.slice(offset, offset + limit).map(msg => ({
        id: msg.id,
        message: msg.message,
        response: msg.response,
        source: msg.source,
        timestamp: msg.timestamp,
        context: msg.context || '',
        metadata: {},
      }));
    } catch (error) {
      console.error('[TruthLens Chat] Failed to get history:', error);
      return [];
    }
  }

  /**
   * Search chat history
   */
  async searchHistory(query: string, limit: number = 20): Promise<ChatMessage[]> {
    try {
      const allMessages = await truthLensCache.getChatHistory(1000); // Get more for searching
      const lowerQuery = query.toLowerCase();
      
      const matches = allMessages.filter(msg => 
        msg.message.toLowerCase().includes(lowerQuery) ||
        msg.response.toLowerCase().includes(lowerQuery) ||
        (msg.context && msg.context.toLowerCase().includes(lowerQuery))
      );

      return matches.slice(0, limit).map(msg => ({
        id: msg.id,
        message: msg.message,
        response: msg.response,
        source: msg.source,
        timestamp: msg.timestamp,
        context: msg.context || '',
        metadata: {},
      }));
    } catch (error) {
      console.error('[TruthLens Chat] Failed to search history:', error);
      return [];
    }
  }

  /**
   * Get recent conversations grouped by context
   */
  async getRecentConversations(limit: number = 10): Promise<ChatSession[]> {
    try {
      const messages = await truthLensCache.getChatHistory(200);
      const sessions = new Map<string, ChatMessage[]>();
      
      // Group messages by context or time proximity
      for (const message of messages) {
        const sessionKey = this.getSessionKey(message);
        
        if (!sessions.has(sessionKey)) {
          sessions.set(sessionKey, []);
        }
        
        sessions.get(sessionKey)!.push({
          id: message.id,
          message: message.message,
          response: message.response,
          source: message.source,
          timestamp: message.timestamp,
          context: message.context || '',
          metadata: {},
        });
      }

      // Convert to ChatSession objects
      const chatSessions: ChatSession[] = [];
      
      for (const [sessionKey, sessionMessages] of sessions) {
        if (sessionMessages.length === 0) continue;
        
        const sortedMessages = sessionMessages.sort((a, b) => a.timestamp - b.timestamp);
        const firstMessage = sortedMessages[0];
        const lastMessage = sortedMessages[sortedMessages.length - 1];

        if (firstMessage && lastMessage) {
          chatSessions.push({
            id: sessionKey,
            title: this.generateSessionTitle(firstMessage.message),
            messages: sortedMessages,
            createdAt: firstMessage.timestamp,
            lastUpdated: lastMessage.timestamp,
            totalMessages: sortedMessages.length,
          });
        }
      }

      // Sort by last updated and limit
      return chatSessions
        .sort((a, b) => b.lastUpdated - a.lastUpdated)
        .slice(0, limit);
    } catch (error) {
      console.error('[TruthLens Chat] Failed to get recent conversations:', error);
      return [];
    }
  }

  /**
   * Generate session key for grouping messages
   */
  private getSessionKey(message: ChatMessage): string {
    // Group by context if available, otherwise by time proximity
    if (message.context) {
      return `context_${message.context.substring(0, 50).replace(/[^\w]/g, '_')}`;
    }
    
    // Group by hour for time-based sessions
    const hourKey = Math.floor(message.timestamp / (60 * 60 * 1000));
    return `time_${hourKey}`;
  }

  /**
   * Generate a title for a chat session
   */
  private generateSessionTitle(firstMessage: string): string {
    // Extract key topics or use first few words
    const words = firstMessage.trim().split(/\s+/).slice(0, 6);
    let title = words.join(' ');
    
    if (title.length > 50) {
      title = title.substring(0, 47) + '...';
    }
    
    return title || 'Untitled Conversation';
  }

  /**
   * Get chat statistics
   */
  async getStats(): Promise<ChatStats> {
    try {
      const messages = await truthLensCache.getChatHistory(1000);
      
      const onDeviceMessages = messages.filter(m => m.source === 'on-device').length;
      const cloudMessages = messages.filter(m => m.source === 'cloud').length;
      
      // Group into sessions for session count
      const sessions = new Set<string>();
      for (const message of messages) {
        sessions.add(this.getSessionKey(message));
      }

      return {
        totalSessions: sessions.size,
        totalMessages: messages.length,
        onDeviceMessages,
        cloudMessages,
        averageResponseTime: 0, // Would need to track response times
      };
    } catch (error) {
      console.error('[TruthLens Chat] Failed to get stats:', error);
      return {
        totalSessions: 0,
        totalMessages: 0,
        onDeviceMessages: 0,
        cloudMessages: 0,
        averageResponseTime: 0,
      };
    }
  }

  /**
   * Export chat history as JSON
   */
  async exportHistory(): Promise<string> {
    try {
      const messages = await truthLensCache.getChatHistory(1000);
      const sessions = await this.getRecentConversations(100);
      
      const exportData = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        stats: await this.getStats(),
        sessions,
        allMessages: messages,
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('[TruthLens Chat] Failed to export history:', error);
      return JSON.stringify({ error: 'Failed to export chat history' }, null, 2);
    }
  }

  /**
   * Clear all chat history
   */
  async clearHistory(): Promise<void> {
    try {
      await truthLensCache.clearChatHistory();
      
      // Update Zustand store
      const store = useTruthLensStore.getState();
      store.clearChatHistory();
      
      console.debug('[TruthLens Chat] Cleared all chat history');
    } catch (error) {
      console.error('[TruthLens Chat] Failed to clear history:', error);
    }
  }

  /**
   * Clean up old messages beyond limits
   */
  async cleanupOldMessages(): Promise<void> {
    try {
      const messages = await truthLensCache.getChatHistory(2000);
      
      if (messages.length <= this.MAX_MESSAGES_PER_SESSION * this.MAX_SESSIONS) {
        return; // No cleanup needed
      }

      // Keep only the most recent messages
      const keepMessages = messages
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, this.MAX_MESSAGES_PER_SESSION * this.MAX_SESSIONS);

      // Clear all and re-add kept messages
      await truthLensCache.clearChatHistory();
      
      for (const message of keepMessages.reverse()) {
        await truthLensCache.storeChatMessage(
          message.message,
          message.response,
          message.source,
          message.context
        );
      }

      console.debug('[TruthLens Chat] Cleaned up old messages:', {
        total: messages.length,
        kept: keepMessages.length,
        removed: messages.length - keepMessages.length,
      });
    } catch (error) {
      console.error('[TruthLens Chat] Failed to cleanup old messages:', error);
    }
  }

  /**
   * Get context suggestions based on chat history
   */
  async getContextSuggestions(currentMessage: string, limit: number = 5): Promise<string[]> {
    try {
      const messages = await truthLensCache.getChatHistory(100);
      const suggestions = new Set<string>();
      
      const lowerCurrentMessage = currentMessage.toLowerCase();
      
      for (const message of messages) {
        if (message.context && message.context.length > 20) {
          // Check if context is relevant to current message
          const contextWords = message.context.toLowerCase().split(/\s+/);
          const messageWords = lowerCurrentMessage.split(/\s+/);
          
          const overlap = contextWords.filter(word => 
            word.length > 3 && messageWords.some(mWord => mWord.includes(word))
          );
          
          if (overlap.length > 0) {
            suggestions.add(message.context);
          }
        }
      }

      return Array.from(suggestions).slice(0, limit);
    } catch (error) {
      console.error('[TruthLens Chat] Failed to get context suggestions:', error);
      return [];
    }
  }
}

// Export singleton instance
export const chatHistoryManager = new ChatHistoryManager();

// Utility hooks for React components
export const useChatHistory = () => {
  return {
    addMessage: chatHistoryManager.addMessage.bind(chatHistoryManager),
    getHistory: chatHistoryManager.getHistory.bind(chatHistoryManager),
    searchHistory: chatHistoryManager.searchHistory.bind(chatHistoryManager),
    getRecentConversations: chatHistoryManager.getRecentConversations.bind(chatHistoryManager),
    getStats: chatHistoryManager.getStats.bind(chatHistoryManager),
    exportHistory: chatHistoryManager.exportHistory.bind(chatHistoryManager),
    clearHistory: chatHistoryManager.clearHistory.bind(chatHistoryManager),
    getContextSuggestions: chatHistoryManager.getContextSuggestions.bind(chatHistoryManager),
  };
};
