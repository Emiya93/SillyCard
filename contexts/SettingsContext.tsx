import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { setNetworkDebugLoggingEnabled } from '../services/debugLogService';

export interface AIConfig {
    apiBase: string;
    apiKey: string;
    model: string;
}

export type DisplayMode = 'desktop' | 'mobile';

export interface Settings {
    mainAI: AIConfig;
    contentAI: AIConfig;
    useSillyTavernGenerate: boolean;
    debugLoggingEnabled: boolean;
    displayMode: DisplayMode;
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
    useSillyTavernGenerate: false,
    debugLoggingEnabled: false,
    displayMode: 'desktop',
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
    updateUseSillyTavernGenerate: (enabled: boolean) => void;
    updateDebugLoggingEnabled: (enabled: boolean) => void;
    updateDisplayMode: (mode: DisplayMode) => void;
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
                useSillyTavernGenerate: parsed.useSillyTavernGenerate ?? defaultSettings.useSillyTavernGenerate,
                debugLoggingEnabled: parsed.debugLoggingEnabled ?? defaultSettings.debugLoggingEnabled,
                displayMode: parsed.displayMode || defaultSettings.displayMode,
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
        localStorage.setItem('game_settings', JSON.stringify(settings));
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
                updateUseSillyTavernGenerate,
                updateDebugLoggingEnabled,
                updateDisplayMode,
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
