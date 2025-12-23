import { GoogleGenerativeAI } from "@google/generative-ai";
import { SettingsService } from "./SettingsService";
import { AgentPhase } from "../../shared/types";

export class LLMService {
  private settingsService: SettingsService;

  constructor(settingsService: SettingsService) {
    this.settingsService = settingsService;
  }

  async generateCompletion(systemPrompt: string, userMessage: string, context: string, onUsage?: (usage: any) => void, onStatus?: (phase: AgentPhase, details?: string) => void): Promise<string> {
    const settings = await this.settingsService.getSettings();
    
    if (!settings.geminiApiKey) {
      return "ERROR: No API Key provided. Please check Settings.";
    }

    if (onStatus) onStatus('WAITING_FOR_API', 'Initializing request...');

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
            
            const startTime = Date.now();
            if (onStatus) onStatus('WAITING_FOR_API', `Request sent. Waiting...`);

            // Create a timeout promise
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Request timed out")), 60000) // 60s timeout
            );

            const contentPromise = model.generateContent(fullPrompt);
            // Prevent unhandled rejection if timeout wins
            contentPromise.catch(() => {});

            const result = await Promise.race([
                contentPromise,
                timeoutPromise
            ]) as any;
            
            if (onStatus) onStatus('ANALYZING', 'Processing response...');

            const response = await result.response;
            if (result.response.usageMetadata && onUsage) {
                onUsage(result.response.usageMetadata);
            }
            return response.text();
        } catch (error: any) {
            attempts++;
            if (onStatus) onStatus('WAITING_FOR_API', `Error detected. Retrying (${attempts}/${maxAttempts})...`);
            // ... (rest of error handling)
        }
    }
    return "ERROR: Unknown error in LLMService.";
  }

  async *generateCompletionStream(systemPrompt: string, userMessage: string, context: string, signal?: AbortSignal, onUsage?: (usage: any) => void, onStatus?: (phase: AgentPhase, details?: string) => void): AsyncGenerator<string, void, unknown> {
    const settings = await this.settingsService.getSettings();
    if (!settings.geminiApiKey) {
      yield "ERROR: No API Key provided.";
      return;
    }

    if (onStatus) onStatus('WAITING_FOR_API', 'Initializing stream...');

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
        
        const startTime = Date.now();
        if (onStatus) onStatus('WAITING_FOR_API', 'Request sent. Waiting for first token...');

        const result = await model.generateContentStream(fullPrompt);
        const streamIterator = result.stream[Symbol.asyncIterator]();
        
        let timeoutId: NodeJS.Timeout | null = null;
        let isFirstToken = true;
        
        while (true) {
            if (signal?.aborted) {
                throw new Error("Aborted by user");
            }

            // Race between next chunk and silence timeout
            const nextChunk = streamIterator.next();
            // Attach a silent catch to prevent unhandled rejections if the timeout wins
            nextChunk.catch(() => {}); 
            
            const timeoutPromise = new Promise<IteratorResult<any>>((resolve) => {
                timeoutId = setTimeout(() => {
                    console.log("[LLMService] Stream silence timeout (15s). Assuming completion.");
                    resolve({ done: true, value: undefined });
                }, 15000); // 15s silence timeout
            });

            // Update timer display while waiting for chunks
            const waitInterval = setInterval(() => {
                if (isFirstToken && onStatus) {
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                    onStatus('WAITING_FOR_API', `Waiting... ${elapsed}s`);
                }
            }, 1000);

            const { done, value } = await Promise.race([nextChunk, timeoutPromise]);
            
            clearInterval(waitInterval);
            if (timeoutId) clearTimeout(timeoutId);

            if (done || !value) break;

            if (isFirstToken) {
                isFirstToken = false;
                if (onStatus) onStatus('STREAMING', 'Receiving tokens...');
            }

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
