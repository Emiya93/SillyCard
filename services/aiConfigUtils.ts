export interface AIConfigLike {
  apiBase: string;
  apiKey: string;
  model: string;
}

export function hasValidAIConfig(config?: Partial<AIConfigLike> | null): config is AIConfigLike {
  return !!(
    config?.apiBase &&
    config.apiBase.trim() &&
    config?.apiKey &&
    config.apiKey.trim() &&
    config?.model &&
    config.model.trim()
  );
}

export function selectAIConfig(primary: AIConfigLike, fallback: AIConfigLike): AIConfigLike {
  return hasValidAIConfig(primary) ? primary : fallback;
}

export function getSecondaryAIConfig(
  enabled: boolean,
  secondary: AIConfigLike,
  fallback: AIConfigLike
): AIConfigLike {
  return enabled ? selectAIConfig(secondary, fallback) : fallback;
}
