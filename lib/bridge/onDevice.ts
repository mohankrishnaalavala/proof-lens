/*
 * On-device AI bridge: executes Chrome AI APIs in content-script context
 * Fallback path for panel when window.ai is not available there
 */

import type { AIResult } from '../types/messages';

// Simple circuit breaker to avoid hammering content when on-device AI is unavailable
let onDeviceUnavailableAt = 0;
const ONDEVICE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function isOnDeviceInCooldown(): boolean {
  return onDeviceUnavailableAt > 0 && Date.now() - onDeviceUnavailableAt < ONDEVICE_COOLDOWN_MS;
}

function markOnDeviceUnavailable(): void {
  onDeviceUnavailableAt = Date.now();
}

/**
 * Prompt via content script using the on-device assistant.
 */
export async function promptViaContent(message: string, systemPrompt?: string): Promise<AIResult> {
  if (isOnDeviceInCooldown()) {
    const err: any = new Error('On-device AI not available (cooldown)');
    err.code = 'NOT_AVAILABLE';
    throw err;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Active tab not found');

    const url = typeof tab.url === 'string' ? tab.url : '';
    const isWebPage = /^https?:\/\//i.test(url);
    if (!isWebPage) {
      const err: any = new Error('Active tab is not an accessible webpage');
      err.code = 'NOT_AVAILABLE';
      throw err;
    }

    try {
      const resp = await chrome.tabs.sendMessage(tab.id, {
        type: 'TL_ONDEVICE_PROMPT',
        payload: { message, systemPrompt },
        timestamp: Date.now(),
      });
      if (resp && resp.success === false) {
        throw new Error((resp.error as string) || 'On-device prompt failed');
      }
      const text: string = (resp && (resp.response as string)) || (resp && (resp.text as string)) || '';
      if (!text) throw new Error('Empty response from on-device assistant');
      return { response: text, source: 'on-device', timestamp: Date.now() };
    } catch (err: any) {
      if (typeof err?.message === 'string' && /not available/i.test(err.message)) {
        markOnDeviceUnavailable();
      }
      // Attempt to inject content script then retry once
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content.js'] });
      const resp = await chrome.tabs.sendMessage(tab.id, {
        type: 'TL_ONDEVICE_PROMPT',
        payload: { message, systemPrompt },
        timestamp: Date.now(),
      });
      if (resp && resp.success === false) {
        const errMsg = (resp.error as string) || 'On-device prompt failed (after inject)';
        if (/not available/i.test(errMsg)) markOnDeviceUnavailable();
        throw new Error(errMsg);
      }
      const text: string = (resp && (resp.response as string)) || (resp && (resp.text as string)) || '';
      if (!text) throw new Error('Empty response from on-device assistant (after inject)');
      return { response: text, source: 'on-device', timestamp: Date.now() };
    }
  } catch (error: any) {
    console.error('[TruthLens Bridge] promptViaContent failed:', error);
    const e: any = error instanceof Error ? error : new Error('promptViaContent failed');
    if (!e.code) e.code = /not available/i.test(String(e.message)) ? 'NOT_AVAILABLE' : 'BRIDGE_ERROR';
    if (e.code === 'NOT_AVAILABLE') markOnDeviceUnavailable();
    throw e;
  }
}

/**
 * Extract claims via content script using on-device summarizer or assistant fallback.
 */
export async function extractClaimsViaContent(text: string): Promise<string[]> {
  try {
    if (isOnDeviceInCooldown()) {
      const err: any = new Error('On-device AI not available (cooldown)');
      err.code = 'NOT_AVAILABLE';
      throw err;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Active tab not found');

    const url = typeof tab.url === 'string' ? tab.url : '';
    const isWebPage = /^https?:\/\//i.test(url);
    if (!isWebPage) {
      const err: any = new Error('Active tab is not an accessible webpage');
      err.code = 'NOT_AVAILABLE';
      throw err;
    }

    try {
      const resp = await chrome.tabs.sendMessage(tab.id, {
        type: 'TL_EXTRACT_CLAIMS',
        payload: { text },
        timestamp: Date.now(),
      });
      if (resp && resp.success === false) {
        const errMsg = (resp.error as string) || 'On-device extract failed';
        if (/not available/i.test(errMsg)) markOnDeviceUnavailable();
        throw new Error(errMsg);
      }
      const claims: string[] = (resp && (resp.claims as string[])) || [];
      return claims;
    } catch (err: any) {
      if (typeof err?.message === 'string' && /not available/i.test(err.message)) {
        markOnDeviceUnavailable();
      }
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content.js'] });
      const resp = await chrome.tabs.sendMessage(tab.id, {
        type: 'TL_EXTRACT_CLAIMS',
        payload: { text },
        timestamp: Date.now(),
      });
      if (resp && resp.success === false) {
        const errMsg = (resp.error as string) || 'On-device extract failed';
        if (/not available/i.test(errMsg)) markOnDeviceUnavailable();
        throw new Error(errMsg);
      }
      const claims: string[] = (resp && (resp.claims as string[])) || [];
      return claims;
    }
  } catch (error: any) {
    console.error('[TruthLens Bridge] extractClaimsViaContent failed:', error);
    const e: any = error instanceof Error ? error : new Error('extractClaimsViaContent failed');
    if (!e.code) e.code = /not available/i.test(String(e.message)) ? 'NOT_AVAILABLE' : 'BRIDGE_ERROR';
    if (e.code === 'NOT_AVAILABLE') markOnDeviceUnavailable();
    throw e;
  }
}

