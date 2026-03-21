import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { setNetworkDebugLoggingEnabled } from '../services/debugLogService';

export interface AIConfig {
    apiBase: string;
    apiKey: string;
    model: string;
}

export type DisplayMode = 'desktop' | 'mobile';

export const MIN_SENT_HISTORY_LIMIT = 10;
export const MAX_SENT_HISTORY_LIMIT = 30;

export function clampSentHistoryLimit(value: number): number {
    if (!Number.isFinite(value)) {
        return MIN_SENT_HISTORY_LIMIT;
    }

    return Math.min(
        MAX_SENT_HISTORY_LIMIT,
        Math.max(MIN_SENT_HISTORY_LIMIT, Math.round(value))
    );
}

export interface Settings {
    mainAI: AIConfig;
    contentAI: AIConfig;
    useIndependentContentAI: boolean;
    useSillyTavernGenerate: boolean;
    debugLoggingEnabled: boolean;
    displayMode: DisplayMode;
    sentHistoryLimit: number;
    presetContent: string;
    writingStyle: string;
    perspective: string;
    nsfwStyle: string;
    jailbreakPrompt: string;
}

const defaultMainApiBase =
    import.meta.env.VITE_MAIN_AI_API_BASE ||
    import.meta.env.VITE_OPENAI_API_BASE ||
    import.meta.env.VITE_AI_API_BASE ||
    'https://api.openai.com/v1';

const defaultMainApiKey =
    import.meta.env.VITE_MAIN_AI_API_KEY ||
    import.meta.env.VITE_OPENAI_API_KEY ||
    import.meta.env.VITE_AI_API_KEY ||
    '';

const defaultMainModel =
    import.meta.env.VITE_MAIN_AI_MODEL ||
    import.meta.env.VITE_OPENAI_MODEL ||
    import.meta.env.VITE_AI_MODEL ||
    'gpt-4o-mini';

const defaultContentApiBase =
    import.meta.env.VITE_CONTENT_AI_API_BASE || defaultMainApiBase;

const defaultContentApiKey =
    import.meta.env.VITE_CONTENT_AI_API_KEY || defaultMainApiKey;

const defaultContentModel =
    import.meta.env.VITE_CONTENT_AI_MODEL || defaultMainModel;

const defaultSettings: Settings = {
    mainAI: {
        apiBase: defaultMainApiBase,
        apiKey: defaultMainApiKey,
        model: defaultMainModel
    },
    contentAI: {
        apiBase: defaultContentApiBase,
        apiKey: defaultContentApiKey,
        model: defaultContentModel
    },
    useIndependentContentAI: false,
    useSillyTavernGenerate: false,
    debugLoggingEnabled: false,
    displayMode: 'desktop',
    sentHistoryLimit: MIN_SENT_HISTORY_LIMIT,
    presetContent: '',
    writingStyle: '',
    perspective: '',
    nsfwStyle: '',
    jailbreakPrompt: ''
};

interface SettingsContextType {
    settings: Settings;
    updateSettings: (newSettings: Partial<Settings>) => void;
    updateMainAI: (config: Partial<AIConfig>) => void;
    updateContentAI: (config: Partial<AIConfig>) => void;
    updateUseIndependentContentAI: (enabled: boolean) => void;
    updateUseSillyTavernGenerate: (enabled: boolean) => void;
    updateDebugLoggingEnabled: (enabled: boolean) => void;
    updateDisplayMode: (mode: DisplayMode) => void;
    updateSentHistoryLimit: (limit: number) => void;
    updatePresetContent: (content: string) => void;
    updateWritingStyle: (style: string) => void;
    updatePerspective: (perspective: string) => void;
    updateNsfwStyle: (style: string) => void;
    updateJailbreakPrompt: (prompt: string) => void;
    resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const loadSettings = (): Settings => {
    try {
        const saved = localStorage.getItem('game_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            const loaded: Settings = {
                mainAI: {
                    apiBase: parsed.mainAI?.apiBase || defaultSettings.mainAI.apiBase,
                    apiKey: parsed.mainAI?.apiKey || defaultSettings.mainAI.apiKey,
                    model: parsed.mainAI?.model || defaultSettings.mainAI.model
                },
                contentAI: {
                    apiBase: parsed.contentAI?.apiBase || defaultSettings.contentAI.apiBase,
                    apiKey: parsed.contentAI?.apiKey || defaultSettings.contentAI.apiKey,
                    model: parsed.contentAI?.model || defaultSettings.contentAI.model
                },
                useIndependentContentAI: parsed.useIndependentContentAI ?? defaultSettings.useIndependentContentAI,
                useSillyTavernGenerate: parsed.useSillyTavernGenerate ?? defaultSettings.useSillyTavernGenerate,
                debugLoggingEnabled: parsed.debugLoggingEnabled ?? defaultSettings.debugLoggingEnabled,
                displayMode: parsed.displayMode || defaultSettings.displayMode,
                sentHistoryLimit: clampSentHistoryLimit(parsed.sentHistoryLimit ?? defaultSettings.sentHistoryLimit),
                presetContent: parsed.presetContent ?? defaultSettings.presetContent,
                writingStyle: parsed.writingStyle ?? defaultSettings.writingStyle,
                perspective: parsed.perspective ?? defaultSettings.perspective,
                nsfwStyle: parsed.nsfwStyle ?? defaultSettings.nsfwStyle,
                jailbreakPrompt: parsed.jailbreakPrompt ?? defaultSettings.jailbreakPrompt
            };
            console.log('Loaded settings from localStorage:', loaded);
            return loaded;
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }

    return defaultSettings;
};

const saveSettings = (settings: Settings) => {
    try {
        localStorage.setItem('game_settings', JSON.stringify({
            ...settings,
            sentHistoryLimit: clampSentHistoryLimit(settings.sentHistoryLimit),
        }));
    } catch (error) {
        console.error('Failed to save settings:', error);
    }
};

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<Settings>(loadSettings);

    useEffect(() => {
        saveSettings(settings);
    }, [settings]);

    useEffect(() => {
        setNetworkDebugLoggingEnabled(settings.debugLoggingEnabled);
    }, [settings.debugLoggingEnabled]);

    const updateSettings = (newSettings: Partial<Settings>) => {
        setSettings(prev => ({ ...prev, ...newSettings }));
    };

    const updateMainAI = (config: Partial<AIConfig>) => {
        setSettings(prev => ({
            ...prev,
            mainAI: { ...prev.mainAI, ...config }
        }));
    };

    const updateContentAI = (config: Partial<AIConfig>) => {
        setSettings(prev => ({
            ...prev,
            contentAI: { ...prev.contentAI, ...config }
        }));
    };

    const updateUseIndependentContentAI = (enabled: boolean) => {
        setSettings(prev => ({
            ...prev,
            useIndependentContentAI: enabled
        }));
    };

    const updateUseSillyTavernGenerate = (enabled: boolean) => {
        setSettings(prev => ({
            ...prev,
            useSillyTavernGenerate: enabled
        }));
    };

    const updateDebugLoggingEnabled = (enabled: boolean) => {
        setSettings(prev => ({
            ...prev,
            debugLoggingEnabled: enabled
        }));
    };

    const updateDisplayMode = (mode: DisplayMode) => {
        setSettings(prev => ({
            ...prev,
            displayMode: mode
        }));
    };

    const updateSentHistoryLimit = (limit: number) => {
        setSettings(prev => ({
            ...prev,
            sentHistoryLimit: clampSentHistoryLimit(limit)
        }));
    };

    const updatePresetContent = (content: string) => {
        setSettings(prev => ({
            ...prev,
            presetContent: content
        }));
    };

    const updateWritingStyle = (style: string) => {
        setSettings(prev => ({
            ...prev,
            writingStyle: style
        }));
    };

    const updatePerspective = (perspective: string) => {
        setSettings(prev => ({
            ...prev,
            perspective
        }));
    };

    const updateNsfwStyle = (style: string) => {
        setSettings(prev => ({
            ...prev,
            nsfwStyle: style
        }));
    };

    const updateJailbreakPrompt = (prompt: string) => {
        setSettings(prev => ({
            ...prev,
            jailbreakPrompt: prompt
        }));
    };

    const resetSettings = () => {
        setSettings(defaultSettings);
    };

    return (
        <SettingsContext.Provider
            value={{
                settings,
                updateSettings,
                updateMainAI,
                updateContentAI,
                updateUseIndependentContentAI,
                updateUseSillyTavernGenerate,
                updateDebugLoggingEnabled,
                updateDisplayMode,
                updateSentHistoryLimit,
                updatePresetContent,
                updateWritingStyle,
                updatePerspective,
                updateNsfwStyle,
                updateJailbreakPrompt,
                resetSettings
            }}
        >
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
