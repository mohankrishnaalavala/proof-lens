/**
 * Brief Compilation Logic for TruthLens
 * Compiling facts, analysis, and recommendations into exportable format
 */

import { truthLensCache } from './cache';
import { useTruthLensStore } from './store';
import { chatHistoryManager } from './chat';
import type { FactCheckResult } from '../types/messages';

export interface BriefSection {
  title: string;
  content: string[];
  sources: string[];
  lastUpdated: number;
}

export interface DecisionBrief {
  id: string;
  title: string;
  summary: string;
  facts: BriefSection;
  analysis: BriefSection;
  recommendations: BriefSection;
  metadata: {
    createdAt: number;
    lastUpdated: number;
    version: number;
    totalSources: number;
    evidenceScore: number;
    wordCount: number;
  };
}

export interface BriefExportOptions {
  format: 'markdown' | 'html' | 'json';
  includeMetadata: boolean;
  includeSources: boolean;
  includeTimestamps: boolean;
}

class BriefCompiler {
  /**
   * Compile current session data into a decision brief
   */
  async compileBrief(title?: string): Promise<DecisionBrief> {
    try {
      const store = useTruthLensStore.getState();
      const factChecks = store.session.factChecks;
      const chatHistory = await chatHistoryManager.getHistory(50);
      
      // Extract facts from fact-checks
      const facts = await this.extractFacts(factChecks);
      
      // Extract analysis from chat history and fact-checks
      const analysis = await this.extractAnalysis(chatHistory, factChecks);
      
      // Generate recommendations based on facts and analysis
      const recommendations = await this.generateRecommendations(facts, analysis);
      
      // Calculate metadata
      const metadata = this.calculateMetadata(facts, analysis, recommendations);
      
      const brief: DecisionBrief = {
        id: `brief_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: title || this.generateBriefTitle(facts, analysis),
        summary: this.generateSummary(facts, analysis, recommendations),
        facts,
        analysis,
        recommendations,
        metadata,
      };

      // Store in cache
      await truthLensCache.storeBriefData(
        facts.content,
        analysis.content,
        recommendations.content
      );

      // Update Zustand store
      store.updateBriefData({
        facts: facts.content,
        analysis: analysis.content,
        recommendations: recommendations.content,
      });

      console.debug('[TruthLens Brief] Compiled brief:', {
        id: brief.id,
        title: brief.title,
        wordCount: metadata.wordCount,
        totalSources: metadata.totalSources,
      });

      return brief;
    } catch (error) {
      console.error('[TruthLens Brief] Failed to compile brief:', error);
      throw new Error('Failed to compile decision brief');
    }
  }

  /**
   * Extract facts from fact-check results
   */
  private async extractFacts(factChecks: FactCheckResult[]): Promise<BriefSection> {
    const facts: string[] = [];
    const sources: string[] = [];
    let lastUpdated = 0;

    for (const factCheck of factChecks) {
      // Add the main claim as a fact
      facts.push(`**Claim:** ${factCheck.claim}`);
      
      // Add evidence assessment
      const evidenceText = `Evidence Level: ${factCheck.evidenceBand} (Score: ${factCheck.evidenceScore}/100)`;
      facts.push(`**${evidenceText}**`);
      
      // Add key findings from reviews
      if (factCheck.reviews.length > 0) {
        const reviewSummary = factCheck.reviews
          .slice(0, 3) // Top 3 reviews
          .map(review => `${review.publisher}: "${review.textualRating}"`)
          .join('; ');
        
        facts.push(`**Reviews:** ${reviewSummary}`);
      }
      
      // Collect sources
      factCheck.reviews.forEach(review => {
        if (review.url && !sources.includes(review.url)) {
          sources.push(review.url);
        }
      });
      
      lastUpdated = Math.max(lastUpdated, factCheck.lastChecked);
    }

    return {
      title: 'Facts & Evidence',
      content: facts,
      sources,
      lastUpdated,
    };
  }

  /**
   * Extract analysis from chat history and fact-checks
   */
  private async extractAnalysis(
    chatHistory: Array<{message: string; response: string; source: string}>,
    factChecks: FactCheckResult[]
  ): Promise<BriefSection> {
    const analysis: string[] = [];
    const sources: string[] = [];
    let lastUpdated = 0;

    // Analyze fact-check patterns
    if (factChecks.length > 0) {
      const highEvidence = factChecks.filter(fc => fc.evidenceBand === 'High').length;
      const mediumEvidence = factChecks.filter(fc => fc.evidenceBand === 'Medium').length;
      const lowEvidence = factChecks.filter(fc => fc.evidenceBand === 'Low').length;
      
      analysis.push(`**Evidence Distribution:** ${highEvidence} high-confidence, ${mediumEvidence} medium-confidence, ${lowEvidence} low-confidence claims verified.`);
      
      // Identify most reliable sources
      const publisherCounts = new Map<string, number>();
      factChecks.forEach(fc => {
        fc.reviews.forEach(review => {
          publisherCounts.set(review.publisher, (publisherCounts.get(review.publisher) || 0) + 1);
        });
      });
      
      const topPublishers = Array.from(publisherCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([publisher, count]) => `${publisher} (${count} reviews)`);
      
      if (topPublishers.length > 0) {
        analysis.push(`**Key Sources:** ${topPublishers.join(', ')}`);
      }
    }

    // Extract insights from chat responses
    const analyticalResponses = chatHistory
      .filter(chat => chat.response.length > 100) // Substantial responses
      .slice(0, 5); // Most recent 5

    for (const chat of analyticalResponses) {
      // Extract key insights (simplified - could use AI for better extraction)
      const sentences = chat.response.split(/[.!?]+/).filter(s => s.trim().length > 50);
      const insights = sentences.slice(0, 2).map(s => s.trim());
      
      if (insights.length > 0) {
        analysis.push(`**Analysis:** ${insights.join('. ')}.`);
      }
      
      lastUpdated = Math.max(lastUpdated, Date.now());
    }

    return {
      title: 'Analysis & Insights',
      content: analysis,
      sources,
      lastUpdated,
    };
  }

  /**
   * Generate recommendations based on facts and analysis
   */
  private async generateRecommendations(
    facts: BriefSection,
    analysis: BriefSection
  ): Promise<BriefSection> {
    const recommendations: string[] = [];
    // const sources: string[] = [];

    // Generate recommendations based on evidence quality
    const factContent = facts.content.join(' ');
    
    if (factContent.includes('High')) {
      recommendations.push('**High Confidence:** Claims with high evidence scores can be considered reliable for decision-making.');
    }
    
    if (factContent.includes('Low')) {
      recommendations.push('**Verification Needed:** Claims with low evidence scores require additional verification before use.');
    }
    
    if (factContent.includes('Medium')) {
      recommendations.push('**Moderate Confidence:** Medium evidence claims should be cross-referenced with additional sources.');
    }

    // Source diversity recommendations
    const uniqueSources = new Set([...facts.sources, ...analysis.sources]);
    if (uniqueSources.size < 3) {
      recommendations.push('**Source Diversity:** Consider seeking additional independent sources to strengthen evidence base.');
    }

    // Default recommendations if none generated
    if (recommendations.length === 0) {
      recommendations.push('**Continue Monitoring:** Stay updated on new information and fact-checks related to these topics.');
      recommendations.push('**Cross-Reference:** Verify important claims through multiple independent sources.');
    }

    return {
      title: 'Recommendations',
      content: recommendations,
      sources: Array.from(uniqueSources),
      lastUpdated: Date.now(),
    };
  }

  /**
   * Generate a brief title based on content
   */
  private generateBriefTitle(facts: BriefSection, analysis: BriefSection): string {
    // Extract key topics from facts
    const factText = facts.content.join(' ').toLowerCase();
    const analysisText = analysis.content.join(' ').toLowerCase();
    const combinedText = `${factText} ${analysisText}`;
    
    // Simple keyword extraction (could be enhanced with AI)
    const keywords = combinedText
      .split(/\s+/)
      .filter(word => word.length > 4 && !['claim', 'evidence', 'analysis', 'review'].includes(word))
      .slice(0, 3);
    
    if (keywords.length > 0) {
      return `Decision Brief: ${keywords.join(', ')}`;
    }
    
    return `Decision Brief - ${new Date().toLocaleDateString()}`;
  }

  /**
   * Generate a summary of the brief
   */
  private generateSummary(
    facts: BriefSection,
    analysis: BriefSection,
    recommendations: BriefSection
  ): string {
    const factCount = facts.content.length;
    const analysisCount = analysis.content.length;
    const recommendationCount = recommendations.content.length;
    const totalSources = new Set([...facts.sources, ...analysis.sources, ...recommendations.sources]).size;
    
    return `This decision brief contains ${factCount} verified facts, ${analysisCount} analytical insights, and ${recommendationCount} recommendations based on ${totalSources} sources. Generated on ${new Date().toLocaleDateString()}.`;
  }

  /**
   * Calculate brief metadata
   */
  private calculateMetadata(
    facts: BriefSection,
    analysis: BriefSection,
    recommendations: BriefSection
  ): DecisionBrief['metadata'] {
    const allContent = [
      ...facts.content,
      ...analysis.content,
      ...recommendations.content,
    ].join(' ');
    
    const wordCount = allContent.split(/\s+/).length;
    const totalSources = new Set([
      ...facts.sources,
      ...analysis.sources,
      ...recommendations.sources,
    ]).size;
    
    // Calculate average evidence score (simplified)
    const evidenceScore = 75; // Would calculate from actual fact-checks
    
    const now = Date.now();
    
    return {
      createdAt: now,
      lastUpdated: now,
      version: 1,
      totalSources,
      evidenceScore,
      wordCount,
    };
  }

  /**
   * Export brief in specified format
   */
  async exportBrief(brief: DecisionBrief, options: BriefExportOptions): Promise<string> {
    try {
      switch (options.format) {
        case 'markdown':
          return this.exportAsMarkdown(brief, options);
        case 'html':
          return this.exportAsHTML(brief, options);
        case 'json':
          return this.exportAsJSON(brief, options);
        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }
    } catch (error) {
      console.error('[TruthLens Brief] Failed to export brief:', error);
      throw new Error('Failed to export decision brief');
    }
  }

  /**
   * Export as Markdown
   */
  private exportAsMarkdown(brief: DecisionBrief, options: BriefExportOptions): string {
    let markdown = `# ${brief.title}\n\n`;
    
    if (options.includeMetadata) {
      markdown += `*Generated on ${new Date(brief.metadata.createdAt).toLocaleString()}*\n\n`;
      markdown += `**Summary:** ${brief.summary}\n\n`;
    }
    
    // Facts section
    markdown += `## ${brief.facts.title}\n\n`;
    brief.facts.content.forEach(fact => {
      markdown += `- ${fact}\n`;
    });
    markdown += '\n';
    
    // Analysis section
    markdown += `## ${brief.analysis.title}\n\n`;
    brief.analysis.content.forEach(analysis => {
      markdown += `- ${analysis}\n`;
    });
    markdown += '\n';
    
    // Recommendations section
    markdown += `## ${brief.recommendations.title}\n\n`;
    brief.recommendations.content.forEach((rec, index) => {
      markdown += `${index + 1}. ${rec}\n`;
    });
    markdown += '\n';
    
    // Sources section
    if (options.includeSources) {
      const allSources = new Set([
        ...brief.facts.sources,
        ...brief.analysis.sources,
        ...brief.recommendations.sources,
      ]);
      
      if (allSources.size > 0) {
        markdown += `## Sources\n\n`;
        Array.from(allSources).forEach((source, index) => {
          markdown += `${index + 1}. ${source}\n`;
        });
      }
    }
    
    return markdown;
  }

  /**
   * Export as HTML
   */
  private exportAsHTML(brief: DecisionBrief, options: BriefExportOptions): string {
    const markdown = this.exportAsMarkdown(brief, options);
    // Simple markdown to HTML conversion (could use a proper library)
    return markdown
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^\* (.*$)/gm, '<li>$1</li>')
      .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }

  /**
   * Export as JSON
   */
  private exportAsJSON(brief: DecisionBrief, options: BriefExportOptions): string {
    const exportData = {
      ...brief,
      exportOptions: options,
      exportedAt: new Date().toISOString(),
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Get latest brief from cache
   */
  async getLatestBrief(): Promise<DecisionBrief | null> {
    try {
      const briefData = await truthLensCache.getLatestBriefData();
      if (!briefData) return null;
      
      // Reconstruct brief from cached data
      return {
        id: briefData.id,
        title: 'Cached Decision Brief',
        summary: 'Restored from cache',
        facts: {
          title: 'Facts & Evidence',
          content: briefData.facts,
          sources: [],
          lastUpdated: briefData.timestamp,
        },
        analysis: {
          title: 'Analysis & Insights',
          content: briefData.analysis,
          sources: [],
          lastUpdated: briefData.timestamp,
        },
        recommendations: {
          title: 'Recommendations',
          content: briefData.recommendations,
          sources: [],
          lastUpdated: briefData.timestamp,
        },
        metadata: {
          createdAt: briefData.timestamp,
          lastUpdated: briefData.timestamp,
          version: briefData.version,
          totalSources: 0,
          evidenceScore: 0,
          wordCount: [...briefData.facts, ...briefData.analysis, ...briefData.recommendations]
            .join(' ').split(/\s+/).length,
        },
      };
    } catch (error) {
      console.error('[TruthLens Brief] Failed to get latest brief:', error);
      return null;
    }
  }
}

// Export singleton instance
export const briefCompiler = new BriefCompiler();

// Utility hooks for React components
export const useBriefCompiler = () => {
  return {
    compileBrief: briefCompiler.compileBrief.bind(briefCompiler),
    exportBrief: briefCompiler.exportBrief.bind(briefCompiler),
    getLatestBrief: briefCompiler.getLatestBrief.bind(briefCompiler),
  };
};
