export interface LLMSettings {
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export const DEFAULT_LLM_SETTINGS: LLMSettings = {
  enabled: false,
  apiUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-3.5-turbo",
  maxTokens: 1000,
  temperature: 0.7,
};
