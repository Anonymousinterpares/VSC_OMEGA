import { GoogleGenerativeAI } from "@google/generative-ai";
import { SettingsService } from "./SettingsService";

export class LLMService {
  private settingsService: SettingsService;

  constructor(settingsService: SettingsService) {
    this.settingsService = settingsService;
  }

  async generateCompletion(systemPrompt: string, userMessage: string, context: string, onUsage?: (usage: any) => void): Promise<string> {
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
            if (result.response.usageMetadata && onUsage) {
                onUsage(result.response.usageMetadata);
            }
            return response.text();
        } catch (error: any) {
            attempts++;
            // ... (rest of error handling)
        }
    }
    return "ERROR: Unknown error in LLMService.";
  }

  async *generateCompletionStream(systemPrompt: string, userMessage: string, context: string, signal?: AbortSignal, onUsage?: (usage: any) => void): AsyncGenerator<string, void, unknown> {
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

        const streamIterator = result.stream[Symbol.asyncIterator]();
        let timeoutId: NodeJS.Timeout | null = null;
        
        while (true) {
            if (signal?.aborted) {
                throw new Error("Aborted by user");
            }

            // Race between next chunk and silence timeout
            const chunkPromise = streamIterator.next();
            const timeoutPromise = new Promise<IteratorResult<any>>((resolve) => {
                timeoutId = setTimeout(() => {
                    console.log("[LLMService] Stream silence timeout (15s). Assuming completion.");
                    resolve({ done: true, value: undefined });
                }, 15000); // 15s silence timeout
            });

            const { done, value } = await Promise.race([chunkPromise, timeoutPromise]);
            
            if (timeoutId) clearTimeout(timeoutId);

            if (done || !value) break;

            const chunk = value;
            if (chunk.usageMetadata && onUsage) {
                onUsage(chunk.usageMetadata);
            }
            const chunkText = typeof chunk.text === 'function' ? chunk.text() : "";
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
