import { GoogleGenerativeAI } from "@google/generative-ai";
import { SettingsService } from "./SettingsService";

export class LLMService {
  private settingsService: SettingsService;

  constructor(settingsService: SettingsService) {
    this.settingsService = settingsService;
  }

  async generateCompletion(systemPrompt: string, userMessage: string, context: string): Promise<string> {
    const settings = await this.settingsService.getSettings();
    
    if (!settings.geminiApiKey) {
      return "ERROR: No API Key provided. Please check Settings.";
    }

    const fullPrompt = `
      ${systemPrompt}

      ### CONTEXT:
      ${context}

      ### USER MESSAGE:
      ${userMessage}
    `;

    console.log(`[LLMService] Sending Prompt: ${fullPrompt.length} chars. Context: ${context.length} chars.`);

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
        try {
            const model = genAI.getGenerativeModel({ model: settings.selectedModel });

            // Create a timeout promise
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Request timed out")), 60000) // 60s timeout
            );

            const result = await Promise.race([
                model.generateContent(fullPrompt),
                timeoutPromise
            ]) as any;

            const response = await result.response;
            return response.text();
        } catch (error: any) {
            attempts++;
            // ... (rest of error handling)
        }
    }
    return "ERROR: Unknown error in LLMService.";
  }

  async *generateCompletionStream(systemPrompt: string, userMessage: string, context: string, signal?: AbortSignal): AsyncGenerator<string, void, unknown> {
    const settings = await this.settingsService.getSettings();
    if (!settings.geminiApiKey) {
      yield "ERROR: No API Key provided.";
      return;
    }

    const fullPrompt = `
      ${systemPrompt}

      ### CONTEXT:
      ${context}

      ### USER MESSAGE:
      ${userMessage}
    `;

    console.log(`[LLMService] Streaming Prompt: ${fullPrompt.length} chars.`);

    const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
    try {
        const model = genAI.getGenerativeModel({ model: settings.selectedModel });
        const result = await model.generateContentStream(fullPrompt);

        for await (const chunk of result.stream) {
            if (signal?.aborted) {
                throw new Error("Aborted by user");
            }
            const chunkText = chunk.text();
            yield chunkText;
        }
    } catch (error: any) {
        if (error.message === "Aborted by user") {
             yield "\n[Aborted by user]\n";
             return;
        }
        console.error("Gemini Streaming Error:", error);
        yield `\n[System Error: ${error.message}]\n`;
    }
  }
}
