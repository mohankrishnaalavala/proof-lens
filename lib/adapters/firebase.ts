/**
 * Firebase Cloud Fallback Adapter for TruthLens
 * Handles cloud AI interactions using Firebase AI Logic (Gemini Pro)
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface CloudPromptOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  model?: 'gemini-pro' | 'gemini-pro-vision';
}

export interface CloudPromptResult {
  response: string;
  source: 'cloud';
  model: string;
  timestamp: number;
  tokensUsed?: number;
}

export interface CloudError {
  code: 'NOT_CONFIGURED' | 'NETWORK_ERROR' | 'AUTH_ERROR' | 'QUOTA_EXCEEDED' | 'INVALID_REQUEST';
  message: string;
  details?: any;
}

class FirebaseCloudAdapter {
  private isConfigured: boolean = false;
  private isEnabled: boolean = false;
  private config: FirebaseConfig | null = null;
  private baseUrl: string = '';

  constructor() {
    this.loadConfiguration();

    // Live-update configuration when Options change
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        if (changes['firebaseConfig']) {
          const cfg = changes['firebaseConfig'].newValue as FirebaseConfig | null;
          this.config = cfg || null;
          this.isConfigured = !!this.config?.projectId;
          this.baseUrl = this.isConfigured ? `https://us-central1-${this.config!.projectId}.cloudfunctions.net` : '';
          console.debug('[TruthLens Firebase] firebaseConfig changed:', { configured: this.isConfigured });
        }
        if (changes['cloudFallbackEnabled']) {
          this.isEnabled = Boolean(changes['cloudFallbackEnabled'].newValue);
          console.debug('[TruthLens Firebase] cloudFallbackEnabled changed:', this.isEnabled);
        }
      });
    } catch (err) {
      console.debug('[TruthLens Firebase] storage listener setup failed:', err);
    }
  }

  /**
   * Load configuration from storage
   */
  private async loadConfiguration(): Promise<void> {
    try {
      const result = await chrome.storage.sync.get([
        'firebaseConfig',
        'cloudFallbackEnabled'
      ]);

      this.config = result['firebaseConfig'] || null;
      this.isEnabled = result['cloudFallbackEnabled'] || false;
      this.isConfigured = !!this.config?.projectId;

      if (this.isConfigured) {
        this.baseUrl = `https://us-central1-${this.config!.projectId}.cloudfunctions.net`;
      }

      console.debug('[TruthLens Firebase] Configuration loaded:', {
        configured: this.isConfigured,
        enabled: this.isEnabled
      });
    } catch (error) {
      console.error('[TruthLens Firebase] Error loading configuration:', error);
    }
  }

  /**
   * Configure Firebase settings
   */
  async configure(config: FirebaseConfig, enabled: boolean = true): Promise<void> {
    this.config = config;
    this.isEnabled = enabled;
    this.isConfigured = true;
    this.baseUrl = `https://us-central1-${config.projectId}.cloudfunctions.net`;

    try {
      await chrome.storage.sync.set({
        firebaseConfig: config,
        cloudFallbackEnabled: enabled
      });
      console.debug('[TruthLens Firebase] Configuration saved');
    } catch (error) {
      console.error('[TruthLens Firebase] Error saving configuration:', error);
    }
  }

  /**
   * Enable or disable cloud fallback
   */
  async setEnabled(enabled: boolean): Promise<void> {
    this.isEnabled = enabled;
    try {
      await chrome.storage.sync.set({ cloudFallbackEnabled: enabled });
      console.debug('[TruthLens Firebase] Cloud fallback enabled:', enabled);
    } catch (error) {
      console.error('[TruthLens Firebase] Error updating enabled state:', error);
    }
  }

  /**
   * Check if cloud fallback is available
   */
  isAvailable(): boolean {
    return this.isConfigured && this.isEnabled;
  }

  /**
   * Send a prompt to cloud AI
   */
  async prompt(message: string, options: CloudPromptOptions = {}): Promise<CloudPromptResult> {
    if (!this.isAvailable()) {
      throw this.createError('NOT_CONFIGURED', 'Firebase cloud fallback not configured or disabled');
    }

    try {
      const requestBody = {
        message,
        options: {
          temperature: options.temperature ?? 0.7,
          maxTokens: options.maxTokens ?? 1000,
          model: options.model ?? 'gemini-pro',
          systemPrompt: options.systemPrompt
        }
      };

      console.debug('[TruthLens Firebase] Sending cloud prompt:', {
        messageLength: message.length,
        model: requestBody.options.model
      });

      const response = await fetch(`${this.baseUrl}/truthlensPrompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config!.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw this.createError('AUTH_ERROR', 'Authentication failed');
        }
        if (response.status === 429) {
          throw this.createError('QUOTA_EXCEEDED', 'Cloud AI quota exceeded');
        }
        throw new Error(`Cloud request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      const result: CloudPromptResult = {
        response: data.response,
        source: 'cloud',
        model: data.model || requestBody.options.model,
        timestamp: Date.now(),
        tokensUsed: data.tokensUsed
      };

      console.debug('[TruthLens Firebase] Cloud prompt successful:', {
        responseLength: result.response.length,
        tokensUsed: result.tokensUsed
      });

      return result;
    } catch (error) {
      console.error('[TruthLens Firebase] Error sending cloud prompt:', error);
      
      if ((error as any).code) {
        throw error; // Re-throw our custom errors
      }
      
      throw this.createError('NETWORK_ERROR', 'Failed to send cloud prompt', error);
    }
  }

  /**
   * Fact-check using cloud AI
   */
  async factCheckCloud(claim: string): Promise<CloudPromptResult> {
    const systemPrompt = `You are a fact-checking assistant. Analyze the given claim objectively and provide:
1. Key factual elements that can be verified
2. Potential concerns or red flags
3. Suggested verification approaches
4. A balanced assessment

Be clear about uncertainty and avoid definitive claims when evidence is limited.`;

    const message = `Please fact-check this claim: "${claim}"

Provide a structured analysis focusing on verifiable facts and potential verification sources.`;

    return this.prompt(message, {
      systemPrompt,
      temperature: 0.3,
      model: 'gemini-pro'
    });
  }

  /**
   * Extract claims using cloud AI
   */
  async extractClaimsCloud(text: string): Promise<CloudPromptResult> {
    const systemPrompt = `You are a claim extraction specialist. Extract specific, verifiable factual claims from the given text. Focus on statements that can be fact-checked, not opinions or subjective assessments.`;

    const message = `Extract verifiable factual claims from this text: "${text}"

Return only specific, factual statements that can be fact-checked. Format as a numbered list.`;

    return this.prompt(message, {
      systemPrompt,
      temperature: 0.2,
      model: 'gemini-pro'
    });
  }

  /**
   * Synthesize search results using cloud AI
   */
  async synthesizeSearchResultsCloud(
    query: string, 
    results: Array<{title: string; snippet: string; url: string}>
  ): Promise<CloudPromptResult> {
    const resultsText = results.map((r, i) => 
      `${i + 1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.url}`
    ).join('\n\n');

    const systemPrompt = `You are a search result synthesizer. Analyze search results to identify key themes, conflicts, and reliable sources. Provide concise summaries that highlight the most important information.`;

    const message = `Search query: "${query}"

Results:
${resultsText}

Provide a concise synthesis that:
1. Summarizes the main themes
2. Identifies any conflicts or disagreements
3. Highlights the most reliable sources
4. Suggests 2-3 key takeaways

Keep it under 200 words.`;

    return this.prompt(message, {
      systemPrompt,
      temperature: 0.4,
      model: 'gemini-pro'
    });
  }

  /**
   * Chat with analyst using cloud AI
   */
  async chatWithAnalyst(message: string, context?: string): Promise<CloudPromptResult> {
    const systemPrompt = `You are a research analyst assistant. Help users understand complex topics by providing clear, well-structured analysis. Break down information into key points, identify important patterns, and suggest relevant follow-up questions.`;

    let fullMessage = message;
    if (context) {
      fullMessage = `Context: ${context}\n\nQuestion: ${message}`;
    }

    return this.prompt(fullMessage, {
      systemPrompt,
      temperature: 0.6,
      model: 'gemini-pro'
    });
  }

  /**
   * Get usage statistics
   */
  async getUsageStats(): Promise<any> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/truthlensUsage`, {
        headers: {
          'Authorization': `Bearer ${this.config!.apiKey}`
        }
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('[TruthLens Firebase] Error getting usage stats:', error);
    }

    return null;
  }

  /**
   * Test cloud connection
   */
  async testConnection(): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const result = await this.prompt('Test connection', {
        temperature: 0,
        maxTokens: 10
      });
      return !!result.response;
    } catch (error) {
      console.error('[TruthLens Firebase] Connection test failed:', error);
      return false;
    }
  }

  /**
   * Create a standardized error
   */
  private createError(code: CloudError['code'], message: string, details?: any): CloudError {
    return { code, message, details };
  }
}

// Export singleton instance
export const firebaseAdapter = new FirebaseCloudAdapter();

// Utility functions for cloud operations
export async function promptWithFallback(
  message: string, 
  onDevicePrompt: () => Promise<any>,
  options: CloudPromptOptions = {}
): Promise<any> {
  try {
    // Try on-device first
    return await onDevicePrompt();
  } catch (error) {
    console.debug('[TruthLens] On-device failed, trying cloud fallback:', (error as any).message);
    
    if (firebaseAdapter.isAvailable()) {
      const result = await firebaseAdapter.prompt(message, options);
      return {
        response: result.response,
        source: result.source,
        timestamp: result.timestamp
      };
    }
    
    throw error; // Re-throw if no fallback available
  }
}

export async function isCloudFallbackEnabled(): Promise<boolean> {
  return firebaseAdapter.isAvailable();
}
