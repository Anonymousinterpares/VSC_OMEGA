import { GoogleGenerativeAI } from "@google/generative-ai";
import { SettingsService } from "./SettingsService";
import { AgentPhase } from "../../shared/types";
import * as fs from 'fs-extra';
import * as path from 'path';

export class LLMService {
  private settingsService: SettingsService;

  constructor(settingsService: SettingsService) {
    this.settingsService = settingsService;
  }

  private async processContent(prompt: string): Promise<Array<string | { inlineData: { mimeType: string, data: string } }>> {
    const parts: Array<string | { inlineData: { mimeType: string, data: string } }> = [];
    const imageRegex = /\{\{IMAGE:(.*?)\}\}/g;
    
    let lastIndex = 0;
    let match;

    while ((match = imageRegex.exec(prompt)) !== null) {
        // Add text before the image
        if (match.index > lastIndex) {
            parts.push(prompt.substring(lastIndex, match.index));
        }

        const imagePath = match[1];
        try {
            if (await fs.pathExists(imagePath)) {
                const data = await fs.readFile(imagePath);
                const base64Data = data.toString('base64');
                // Simple mime type detection
                const ext = imagePath.split('.').pop()?.toLowerCase();
                let mimeType = 'image/jpeg';
                if (ext === 'png') mimeType = 'image/png';
                if (ext === 'webp') mimeType = 'image/webp';
                if (ext === 'heic') mimeType = 'image/heic';
                if (ext === 'heif') mimeType = 'image/heif';

                parts.push({
                    inlineData: {
                        mimeType,
                        data: base64Data
                    }
                });
            } else {
                parts.push(`[SYSTEM ERROR: Image not found at ${imagePath}]`);
            }
        } catch (e) {
            parts.push(`[SYSTEM ERROR: Failed to load image at ${imagePath}]`);
        }

        lastIndex = imageRegex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < prompt.length) {
        parts.push(prompt.substring(lastIndex));
    }

    return parts;
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

    const contentParts = await this.processContent(fullPrompt);

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
        try {
            const model = genAI.getGenerativeModel({ model: settings.selectedModel });
            
            if (onStatus) onStatus('WAITING_FOR_API', `Request sent. Waiting...`);

            // Create a timeout promise
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Request timed out")), 60000) // 60s timeout
            );

            const contentPromise = model.generateContent(contentParts as any);
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
            console.error(`Gemini API Error (Attempt ${attempts}):`, error);
            if (attempts >= maxAttempts) {
                return `ERROR: Gemini API failed after ${maxAttempts} attempts. ${error.message}`;
            }
            await new Promise(resolve => setTimeout(resolve, 2000 * attempts)); // Exponential backoff
        }
    }
    return "ERROR: Unknown error in LLMService.";
  }

  async generateImage(prompt: string, aspectRatio: string = "1:1"): Promise<string> {
      const settings = await this.settingsService.getSettings();
      if (!settings.geminiApiKey) {
          throw new Error("API Key not found.");
      }

      const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
      // Using the user-specified Nano Banana Pro model ID
      const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });

      try {
          // Append aspect ratio to prompt as a directive
          const finalPrompt = `${prompt} (Aspect Ratio: ${aspectRatio})`;
          
          const result = await model.generateContent({
              contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
              generationConfig: {
                  // Note: Aspect ratio and other params might vary by model version
                  // but we pass the prompt as the core instruction.
                  // For Imagen 3, the prompt IS the generation command.
              }
          } as any);

          // The response usually contains the image as a part or in the candidate
          const response = await result.response;
          const part = response.candidates?.[0]?.content?.parts?.[0];

          if (part && 'inlineData' in part && part.inlineData && part.inlineData.data) {
              const buffer = Buffer.from(part.inlineData.data, 'base64');
              const tempDir = path.join(process.cwd(), '.gemini', 'tmp', 'generated');
              await fs.ensureDir(tempDir);
              const filePath = path.join(tempDir, `gen_${Date.now()}.png`);
              await fs.writeFile(filePath, buffer);
              return filePath;
          }

          throw new Error("No image data returned from model.");
      } catch (error: any) {
          console.error("Image Generation Error:", error);
          throw new Error(`Nano Banana Pro Generation failed: ${error.message}`);
      }
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

    const contentParts = await this.processContent(fullPrompt);

    const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
    try {
        const model = genAI.getGenerativeModel({ model: settings.selectedModel });
        
        const startTime = Date.now();
        if (onStatus) onStatus('WAITING_FOR_API', 'Request sent. Waiting for first token...');

        const result = await model.generateContentStream(contentParts as any);
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
