/**
 * Chrome Prompt API Adapter for TruthLens
 * Handles on-device AI interactions using Gemini Nano
 */

export interface PromptSession {
  id: string;
  session: any; // Chrome AI session object
  createdAt: number;
  lastUsed: number;
}

export interface PromptOptions {
  temperature?: number;
  topK?: number;
  systemPrompt?: string;
}

export interface PromptResult {
  response: string;
  source: 'on-device';
  sessionId: string;
  timestamp: number;
}

export interface PromptError {
  code: 'NOT_AVAILABLE' | 'SESSION_FAILED' | 'PROMPT_FAILED' | 'QUOTA_EXCEEDED';
  message: string;
  details?: any;
}

class ChromePromptAdapter {
  private sessions: Map<string, PromptSession> = new Map();
  private isAvailable: boolean | null = null;
  private capabilities: any = null;

  /**
   * Check if Chrome Prompt API is available
   */
  async checkAvailability(): Promise<boolean> {
    try {
      if (this.isAvailable !== null) {
        return this.isAvailable;
      }

      // Check if the API exists
      if (!('ai' in window) || !('assistant' in (window as any).ai)) {
        this.isAvailable = false;
        return false;
      }

      // Check capabilities
      const ai = (window as any).ai;
      this.capabilities = await ai.assistant.capabilities();
      
      this.isAvailable = this.capabilities.available === 'readily';
      
      console.debug('[TruthLens Prompt] API availability:', {
        available: this.isAvailable,
        capabilities: this.capabilities
      });

      return this.isAvailable;
    } catch (error) {
      console.error('[TruthLens Prompt] Error checking availability:', error);
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Create a new prompt session
   */
  async createSession(options: PromptOptions = {}): Promise<string> {
    const isAvailable = await this.checkAvailability();
    if (!isAvailable) {
      throw new Error('Chrome Prompt API not available');
    }

    try {
      const ai = (window as any).ai;
      
      const sessionOptions: any = {
        temperature: options.temperature ?? 0.7,
        topK: options.topK ?? 40,
      };

      if (options.systemPrompt) {
        sessionOptions.systemPrompt = options.systemPrompt;
      }

      const session = await ai.assistant.create(sessionOptions);
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const promptSession: PromptSession = {
        id: sessionId,
        session,
        createdAt: Date.now(),
        lastUsed: Date.now()
      };

      this.sessions.set(sessionId, promptSession);

      console.debug('[TruthLens Prompt] Session created:', sessionId);
      return sessionId;
    } catch (error) {
      console.error('[TruthLens Prompt] Error creating session:', error);
      throw this.createError('SESSION_FAILED', 'Failed to create prompt session', error);
    }
  }

  /**
   * Send a prompt to an existing session
   */
  async prompt(sessionId: string, message: string): Promise<PromptResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw this.createError('SESSION_FAILED', 'Session not found');
    }

    try {
      session.lastUsed = Date.now();
      
      const response = await session.session.prompt(message);
      
      const result: PromptResult = {
        response,
        source: 'on-device',
        sessionId,
        timestamp: Date.now()
      };

      console.debug('[TruthLens Prompt] Prompt successful:', {
        sessionId,
        messageLength: message.length,
        responseLength: response.length
      });

      return result;
    } catch (error) {
      console.error('[TruthLens Prompt] Error sending prompt:', error);
      
      // Handle quota exceeded
      if ((error as any).message?.includes('quota') || (error as any).message?.includes('limit')) {
        throw this.createError('QUOTA_EXCEEDED', 'AI quota exceeded, try again later', error);
      }
      
      throw this.createError('PROMPT_FAILED', 'Failed to send prompt', error);
    }
  }

  /**
   * Create a session and send a prompt in one call
   */
  async promptOnce(message: string, options: PromptOptions = {}): Promise<PromptResult> {
    const sessionId = await this.createSession(options);
    
    try {
      const result = await this.prompt(sessionId, message);
      this.destroySession(sessionId); // Clean up immediately
      return result;
    } catch (error) {
      this.destroySession(sessionId); // Clean up on error
      throw error;
    }
  }

  /**
   * Destroy a session and free resources
   */
  destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        session.session.destroy?.();
      } catch (error) {
        console.warn('[TruthLens Prompt] Error destroying session:', error);
      }
      
      this.sessions.delete(sessionId);
      console.debug('[TruthLens Prompt] Session destroyed:', sessionId);
    }
  }

  /**
   * Clean up old sessions
   */
  cleanupSessions(maxAge: number = 30 * 60 * 1000): void { // 30 minutes default
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastUsed > maxAge) {
        toDelete.push(sessionId);
      }
    }

    toDelete.forEach(sessionId => this.destroySession(sessionId));
    
    if (toDelete.length > 0) {
      console.debug('[TruthLens Prompt] Cleaned up sessions:', toDelete.length);
    }
  }

  /**
   * Get current capabilities
   */
  getCapabilities(): any {
    return this.capabilities;
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Create a standardized error
   */
  private createError(code: PromptError['code'], message: string, details?: any): PromptError {
    return { code, message, details };
  }
}

// Export singleton instance
export const promptAdapter = new ChromePromptAdapter();

// Predefined system prompts for different use cases
export const SYSTEM_PROMPTS = {
  FACT_CHECKER: `You are a fact-checking assistant. Analyze claims objectively and provide balanced assessments. Focus on verifiable information and cite sources when possible. Be clear about uncertainty and avoid definitive claims when evidence is limited.`,
  
  ANALYST: `You are a research analyst assistant. Help users understand complex topics by providing clear, well-structured analysis. Break down information into key points, identify important patterns, and suggest relevant follow-up questions.`,
  
  SEARCH_SYNTHESIZER: `You are a search result synthesizer. Analyze search results to identify key themes, conflicts, and reliable sources. Provide concise summaries that highlight the most important information and any disagreements between sources.`,
  
  CLAIM_EXTRACTOR: `You are a claim extraction specialist. Identify factual claims that can be verified from the given text. Focus on specific, verifiable statements rather than opinions or subjective assessments. Present claims as clear, standalone statements.`
};

// Utility functions for common prompt patterns
export async function factCheckPrompt(claim: string): Promise<PromptResult> {
  const prompt = `Analyze this claim for fact-checking: "${claim}"

Please provide:
1. Key factual elements that can be verified
2. Potential sources or types of evidence to look for
3. Any obvious red flags or concerns
4. Suggested search terms for verification

Keep your response concise and focused on verifiable facts.`;

  return promptAdapter.promptOnce(prompt, {
    systemPrompt: SYSTEM_PROMPTS.FACT_CHECKER,
    temperature: 0.3
  });
}

export async function extractClaimsPrompt(text: string): Promise<PromptResult> {
  const prompt = `Extract verifiable factual claims from this text: "${text}"

Return only specific, factual statements that can be fact-checked. Ignore opinions, predictions, or subjective statements. Format as a numbered list.`;

  return promptAdapter.promptOnce(prompt, {
    systemPrompt: SYSTEM_PROMPTS.CLAIM_EXTRACTOR,
    temperature: 0.2
  });
}

export async function synthesizeSearchResults(query: string, results: Array<{title: string; snippet: string; url: string}>): Promise<PromptResult> {
  const resultsText = results.map((r, i) => 
    `${i + 1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.url}`
  ).join('\n\n');

  const prompt = `Search query: "${query}"

Results:
${resultsText}

Provide a concise synthesis that:
1. Summarizes the main themes
2. Identifies any conflicts or disagreements
3. Highlights the most reliable sources
4. Suggests 2-3 key takeaways

Keep it under 200 words.`;

  return promptAdapter.promptOnce(prompt, {
    systemPrompt: SYSTEM_PROMPTS.SEARCH_SYNTHESIZER,
    temperature: 0.4
  });
}
