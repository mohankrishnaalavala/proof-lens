/**
 * Zustand Store for TruthLens App State
 * Global state management for UI state, capabilities, and user preferences
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { ChromeAICapabilities, FactCheckResult } from '../types/messages';

// UI State Types
export interface UIState {
  activeTab: 'claims' | 'chat' | 'brief';
  isLoading: boolean;
  sidebarOpen: boolean;
  selectedText: string | null;
  currentUrl: string | null;
}

// Capabilities State
export interface CapabilitiesState {
  chromeAI: ChromeAICapabilities | null;
  isOnDevice: boolean;
  isCloudEnabled: boolean;
  lastChecked: number;
}

// User Preferences
export interface UserPreferences {
  cloudFallbackEnabled: boolean;
  autoFactCheck: boolean;
  showEvidenceScores: boolean;
  defaultEvidenceBand: 'Low' | 'Medium' | 'High' | 'All';
  chatHistoryEnabled: boolean;
  briefAutoSave: boolean;
}

// Current Session Data
export interface SessionData {
  factChecks: FactCheckResult[];
  chatHistory: Array<{
    id: string;
    message: string;
    response: string;
    source: 'on-device' | 'cloud';
    timestamp: number;
  }>;
  briefData: {
    facts: string[];
    analysis: string[];
    recommendations: string[];
    lastUpdated: number;
  };
}

// Combined Store State
export interface TruthLensStore {
  // State
  ui: UIState;
  capabilities: CapabilitiesState;
  preferences: UserPreferences;
  session: SessionData;

  // UI Actions
  setActiveTab: (tab: UIState['activeTab']) => void;
  setLoading: (loading: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setSelectedText: (text: string | null) => void;
  setCurrentUrl: (url: string | null) => void;

  // Capabilities Actions
  updateCapabilities: (capabilities: ChromeAICapabilities) => void;
  setOnDeviceStatus: (isOnDevice: boolean) => void;
  setCloudEnabled: (enabled: boolean) => void;

  // Preferences Actions
  updatePreferences: (preferences: Partial<UserPreferences>) => void;
  toggleCloudFallback: () => void;
  toggleAutoFactCheck: () => void;

  // Session Actions
  addFactCheck: (factCheck: FactCheckResult) => void;
  removeFactCheck: (claimId: string) => void;
  clearFactChecks: () => void;
  addChatMessage: (message: string, response: string, source: 'on-device' | 'cloud') => void;
  clearChatHistory: () => void;
  updateBriefData: (data: Partial<SessionData['briefData']>) => void;
  clearSession: () => void;

  // Utility Actions
  reset: () => void;
}

// Default State Values
const defaultUIState: UIState = {
  activeTab: 'claims',
  isLoading: false,
  sidebarOpen: false,
  selectedText: null,
  currentUrl: null,
};

const defaultCapabilitiesState: CapabilitiesState = {
  chromeAI: null,
  isOnDevice: false,
  isCloudEnabled: false,
  lastChecked: 0,
};

const defaultUserPreferences: UserPreferences = {
  cloudFallbackEnabled: false,
  autoFactCheck: false,
  showEvidenceScores: true,
  defaultEvidenceBand: 'All',
  chatHistoryEnabled: true,
  briefAutoSave: true,
};

const defaultSessionData: SessionData = {
  factChecks: [],
  chatHistory: [],
  briefData: {
    facts: [],
    analysis: [],
    recommendations: [],
    lastUpdated: 0,
  },
};

// Create the Zustand store
export const useTruthLensStore = create<TruthLensStore>()(
  devtools(
    persist(
      (set) => ({
        // Initial State
        ui: defaultUIState,
        capabilities: defaultCapabilitiesState,
        preferences: defaultUserPreferences,
        session: defaultSessionData,

        // UI Actions
        setActiveTab: (tab) =>
          set((state) => ({ ui: { ...state.ui, activeTab: tab } }), false, 'setActiveTab'),

        setLoading: (loading) =>
          set((state) => ({ ui: { ...state.ui, isLoading: loading } }), false, 'setLoading'),

        setSidebarOpen: (open) =>
          set((state) => ({ ui: { ...state.ui, sidebarOpen: open } }), false, 'setSidebarOpen'),

        setSelectedText: (text) =>
          set((state) => ({ ui: { ...state.ui, selectedText: text } }), false, 'setSelectedText'),

        setCurrentUrl: (url) =>
          set((state) => ({ ui: { ...state.ui, currentUrl: url } }), false, 'setCurrentUrl'),

        // Capabilities Actions
        updateCapabilities: (capabilities) =>
          set(
            (state) => ({
              capabilities: {
                ...state.capabilities,
                chromeAI: capabilities,
                lastChecked: Date.now(),
              },
            }),
            false,
            'updateCapabilities'
          ),

        setOnDeviceStatus: (isOnDevice) =>
          set(
            (state) => ({
              capabilities: { ...state.capabilities, isOnDevice },
            }),
            false,
            'setOnDeviceStatus'
          ),

        setCloudEnabled: (enabled) =>
          set(
            (state) => ({
              capabilities: { ...state.capabilities, isCloudEnabled: enabled },
            }),
            false,
            'setCloudEnabled'
          ),

        // Preferences Actions
        updatePreferences: (newPreferences) =>
          set(
            (state) => ({
              preferences: { ...state.preferences, ...newPreferences },
            }),
            false,
            'updatePreferences'
          ),

        toggleCloudFallback: () =>
          set(
            (state) => ({
              preferences: {
                ...state.preferences,
                cloudFallbackEnabled: !state.preferences.cloudFallbackEnabled,
              },
            }),
            false,
            'toggleCloudFallback'
          ),

        toggleAutoFactCheck: () =>
          set(
            (state) => ({
              preferences: {
                ...state.preferences,
                autoFactCheck: !state.preferences.autoFactCheck,
              },
            }),
            false,
            'toggleAutoFactCheck'
          ),

        // Session Actions
        addFactCheck: (factCheck) =>
          set(
            (state) => ({
              session: {
                ...state.session,
                factChecks: [...state.session.factChecks, factCheck],
              },
            }),
            false,
            'addFactCheck'
          ),

        removeFactCheck: (claimId) =>
          set(
            (state) => ({
              session: {
                ...state.session,
                factChecks: state.session.factChecks.filter((fc) => fc.claimId !== claimId),
              },
            }),
            false,
            'removeFactCheck'
          ),

        clearFactChecks: () =>
          set(
            (state) => ({
              session: { ...state.session, factChecks: [] },
            }),
            false,
            'clearFactChecks'
          ),

        addChatMessage: (message, response, source) => {
          const chatEntry = {
            id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            message,
            response,
            source,
            timestamp: Date.now(),
          };

          set(
            (state) => ({
              session: {
                ...state.session,
                chatHistory: [...state.session.chatHistory, chatEntry],
              },
            }),
            false,
            'addChatMessage'
          );
        },

        clearChatHistory: () =>
          set(
            (state) => ({
              session: { ...state.session, chatHistory: [] },
            }),
            false,
            'clearChatHistory'
          ),

        updateBriefData: (data) =>
          set(
            (state) => ({
              session: {
                ...state.session,
                briefData: {
                  ...state.session.briefData,
                  ...data,
                  lastUpdated: Date.now(),
                },
              },
            }),
            false,
            'updateBriefData'
          ),

        clearSession: () =>
          set(
            () => ({
              session: defaultSessionData,
            }),
            false,
            'clearSession'
          ),

        // Utility Actions
        reset: () =>
          set(
            {
              ui: defaultUIState,
              capabilities: defaultCapabilitiesState,
              preferences: defaultUserPreferences,
              session: defaultSessionData,
            },
            false,
            'reset'
          ),
      }),
      {
        name: 'truthlens-store',
        partialize: (state) => ({
          preferences: state.preferences,
          capabilities: {
            ...state.capabilities,
            // Don't persist chromeAI capabilities as they need to be re-checked
            chromeAI: null,
          },
        }),
      }
    ),
    { name: 'TruthLens Store' }
  )
);

// Selector hooks for better performance
export const useUIState = () => useTruthLensStore((state) => state.ui);
export const useCapabilities = () => useTruthLensStore((state) => state.capabilities);
export const usePreferences = () => useTruthLensStore((state) => state.preferences);
export const useSession = () => useTruthLensStore((state) => state.session);
export const useFactChecks = () => useTruthLensStore((state) => state.session.factChecks);
export const useChatHistory = () => useTruthLensStore((state) => state.session.chatHistory);
export const useBriefData = () => useTruthLensStore((state) => state.session.briefData);
