// Re-export from azure-ai.ts so existing imports of @/lib/openai keep working.
// Azure OpenAI is used as the primary provider; OpenAI is the fallback.
export {
  generateMeetingInsight,
  generateTeamRecommendations,
  isAnyAIConfigured,
  isAzureAIConfigured,
} from "./azure-ai";

// Keep legacy helper for any code that still calls getOpenAIApiKey()
export function getOpenAIApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key.startsWith("your_")) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return key;
}

export type {AIRecommendation, TeamInsightInput} from "./azure-ai";
