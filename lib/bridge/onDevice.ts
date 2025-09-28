/*
 * On-device AI bridge: executes Chrome AI APIs in content-script context
 * Fallback path for panel when window.ai is not available there
 */

import type { AIResult } from '../types/messages';

/**
 * Prompt via content script using the on-device assistant.
 */
export async function promptViaContent(message: string, systemPrompt?: string): Promise<AIResult> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Active tab not found');

    try {
      const resp = await chrome.tabs.sendMessage(tab.id, {
        type: 'TL_ONDEVICE_PROMPT',
        payload: { message, systemPrompt },
        timestamp: Date.now(),
      });
      const text: string = (resp && (resp.response as string)) || (resp && (resp.text as string)) || '';
      if (!text) throw new Error('Empty response from on-device assistant');
      return { response: text, source: 'on-device', timestamp: Date.now() };
    } catch (err) {
      // Attempt to inject content script then retry once
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content.js'] });
      const resp = await chrome.tabs.sendMessage(tab.id, {
        type: 'TL_ONDEVICE_PROMPT',
        payload: { message, systemPrompt },
        timestamp: Date.now(),
      });
      const text: string = (resp && (resp.response as string)) || (resp && (resp.text as string)) || '';
      if (!text) throw new Error('Empty response from on-device assistant (after inject)');
      return { response: text, source: 'on-device', timestamp: Date.now() };
    }
  } catch (error) {
    console.error('[TruthLens Bridge] promptViaContent failed:', error);
    throw error instanceof Error ? error : new Error('promptViaContent failed');
  }
}

/**
 * Extract claims via content script using on-device summarizer or assistant fallback.
 */
export async function extractClaimsViaContent(text: string): Promise<string[]> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Active tab not found');

    try {
      const resp = await chrome.tabs.sendMessage(tab.id, {
        type: 'TL_EXTRACT_CLAIMS',
        payload: { text },
        timestamp: Date.now(),
      });
      const claims: string[] = (resp && (resp.claims as string[])) || [];
      return claims;
    } catch (err) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content.js'] });
      const resp = await chrome.tabs.sendMessage(tab.id, {
        type: 'TL_EXTRACT_CLAIMS',
        payload: { text },
        timestamp: Date.now(),
      });
      const claims: string[] = (resp && (resp.claims as string[])) || [];
      return claims;
    }
  } catch (error) {
    console.error('[TruthLens Bridge] extractClaimsViaContent failed:', error);
    throw error instanceof Error ? error : new Error('extractClaimsViaContent failed');
  }
}

