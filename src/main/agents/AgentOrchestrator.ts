import { BrowserWindow } from 'electron';
import { LLMService } from '../services/LLMService';
import { ToolHandler } from './ToolHandler';
import { FileSystemService } from '../services/FileSystem';
import { ANALYSER_PROMPT, PLANNER_PROMPT } from './definitions/01_Analysis_Planning';
import { CODER_PROMPT } from './definitions/02_Coding_QA';
import { ROUTER_PROMPT } from './definitions/03_Router';
import { CHANNELS } from '../../shared/constants';

interface IOrchestratorRequest {
  agent?: string;
  message: string;
  context: any;
  history?: any[];
}

interface IOrchestratorResponse {
    content: string; // The "Final" output for the user
    steps: { agent: string, input: string, output: string, reasoning?: string }[]; // Hidden trace
}

export class AgentOrchestrator {
  private llm: LLMService;
  private tools: ToolHandler;
  private mainWindow: BrowserWindow | null;

  constructor(llm: LLMService, fileSystem: FileSystemService, mainWindow: BrowserWindow | null) {
    this.llm = llm;
    this.tools = new ToolHandler(fileSystem);
    this.mainWindow = mainWindow;
  }

  private emitSteps(steps: any[]) {
      if (this.mainWindow) {
          this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.AGENT_STEP_UPDATE, { steps });
      }
  }

  async handleMessage(request: IOrchestratorRequest): Promise<IOrchestratorResponse> {
    const { agent, message, context } = request;
    const steps: { agent: string, input: string, output: string, reasoning?: string }[] = [];
    const autoApply = context?.autoApply ?? true;

    const onStepUpdate = (agentName: string, input: string, output: string) => {
        // Find if step already exists (to update it) or push new
        const existingIdx = steps.findIndex(s => s.agent === agentName && s.input === input);
        if (existingIdx >= 0) {
            steps[existingIdx].output = output;
        } else {
            steps.push({ agent: agentName, input, output });
        }
        this.emitSteps(steps);
    };
    
    // 1. Determine System Prompt based on Agent Role
    let systemPrompt = ROUTER_PROMPT;
    if (agent === 'Analyser') systemPrompt = ANALYSER_PROMPT;
    if (agent === 'Planner') systemPrompt = PLANNER_PROMPT;
    if (agent === 'Coder') systemPrompt = CODER_PROMPT;

    // 2. Call LLM
    const formattedContext = this.formatContext(context);
    const llmResponse = await this.llm.generateCompletion(
      systemPrompt, 
      message, 
      formattedContext
    );

    // 2a. Handle Router JSON Logic
    if (agent === 'Router' || !agent) {
        try {
            const cleanJson = llmResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            const routerDecision = JSON.parse(cleanJson);
            
            steps.push({ agent: 'Router', input: message, output: llmResponse, reasoning: routerDecision.reasoning });
            this.emitSteps(steps);

            if (routerDecision.next_agent) {
                const nextAgent = routerDecision.next_agent;
                
                // --- CHAIN LOGIC ---
                if (nextAgent === 'Analyser') {
                    // Step 1: Analyser
                    const analysisRes = await this.callAgent('Analyser', message, context, 1, onStepUpdate, autoApply);

                    // Check clarification
                    if (analysisRes.includes('"clarification_needed": true')) {
                        // Parse to format nicely
                        let prettyOutput = "The system needs more information to proceed.";
                        try {
                            const json = JSON.parse(analysisRes.replace(/```json/g, '').replace(/```/g, '').trim());
                            prettyOutput = `**Clarification Needed**\n\n**Risks:**\n${json.risks.map((r:string) => `- ${r}`).join('\n')}\n\n**Missing Info:**\n${json.requirements.join('\n')}`;
                        } catch (e) {
                             prettyOutput += `\n\n${analysisRes}`;
                        }

                        return {
                            content: prettyOutput,
                            steps
                        };
                    }

                    // Step 2: Planner
                    const plannerInput = `Based on this analysis, create a detailed plan. Note any 'verification_needed' items and include tasks to read those files if necessary.\n\nAnalysis:\n${analysisRes}`;
                    const planRes = await this.callAgent('Planner', plannerInput, context, 1, onStepUpdate, autoApply);

                    // Step 3: Coder
                    const coderInput = `Execute this plan. Use <read_file> to investigate any files mentioned in verification tasks.\n\nPlan:\n${planRes}\n\nOriginal Request: ${message}`;
                    const codeRes = await this.callAgent('Coder', coderInput, context, 5, onStepUpdate, autoApply);

                    // Clean up the final output for the USER
                    // codeRes contains the verbose LLM Output (File Dumps). We want to strip that.
                    let cleanFinal = codeRes;
                    
                    // 1. Remove File Dumps
                    cleanFinal = cleanFinal.replace(/### FILE:[\s\S]*?### END FILE/g, '[File Content Hidden]');
                    
                    return {
                        content: cleanFinal,
                        steps
                    };
                }

                // Recursive fallback
                const nextRes = await this.callAgent(nextAgent, message, context, 5, onStepUpdate, autoApply);
                return {
                    content: nextRes,
                    steps
                };
            }
        } catch (e) {
            console.warn("Router returned non-JSON:", llmResponse);
            return { content: llmResponse, steps: [] };
        }
    }

    // Direct Agent Call (Tool execution)
    let finalOutput = llmResponse;
    if (agent === 'Coder') {
        const toolResult = await this.tools.executeTools(llmResponse, autoApply);
        if (toolResult) {
            finalOutput = `${llmResponse}\n\n--- TOOL OUTPUT ---\n${toolResult.userOutput}`;
        }
    }

    return {
        content: finalOutput,
        steps: [] 
    };
  }

  // Helper to call agents internally with potential looping for tool use
  private async callAgent(agentName: string, message: string, context: any, maxTurns = 5, onStepUpdate?: (agent: string, input: string, output: string) => void, autoApply = true): Promise<string> {
      let systemPrompt = ROUTER_PROMPT;
      if (agentName === 'Analyser') systemPrompt = ANALYSER_PROMPT;
      if (agentName === 'Planner') systemPrompt = PLANNER_PROMPT;
      if (agentName === 'Coder') systemPrompt = CODER_PROMPT;

      const formattedContext = this.formatContext(context);
      let currentInput = message;
      let fullResponse = "";
      let turn = 0;

      while (turn < maxTurns) {
          const response = await this.llm.generateCompletion(systemPrompt, currentInput, formattedContext);
          fullResponse += (fullResponse ? "\n\n" : "") + response;
          
          if (onStepUpdate) {
              onStepUpdate(agentName, message, fullResponse);
          }

          if (agentName === 'Coder') {
              const toolResult = await this.tools.executeTools(response, autoApply);
              if (toolResult) {
                  fullResponse += `\n\n--- TOOL OUTPUT ---\n${toolResult.llmOutput}`;
                  if (onStepUpdate) {
                      onStepUpdate(agentName, message, fullResponse);
                  }
                  
                  // Update input for next turn
                  currentInput = `${message}\n\nPREVIOUS TOOL OUTPUT:\n${toolResult.llmOutput}\n\nPlease continue based on this information.`;
                  turn++;
                  continue; 
              } else {
                  // NO TOOLS FOUND. Check if the agent wrote code blocks but forgot to save.
                  // Regex to check for code blocks
                  if (response.includes('```') && turn < maxTurns - 1) {
                      const warning = "\n\n[SYSTEM WARNING]: You generated a code block but did not use <write_file> or <replace> to save it. You MUST use the tools to apply changes to the file system. Please retry.";
                      fullResponse += warning;
                      if (onStepUpdate) {
                        onStepUpdate(agentName, message, fullResponse);
                      }
                      currentInput = `${message}\n\nPREVIOUS RESPONSE:\n${response}\n\n${warning}`;
                      turn++;
                      continue;
                  }
              }
          }
          break;
      }

      return fullResponse;
  }

  // Helper to flatten context
  private formatContext(context: any): string {
      if (!context || !context.fileTree) return '';
      
      const flatten = (nodes: any[]): string[] => {
          let paths: string[] = [];
          for (const node of nodes) {
              if (node.type === 'file') {
                  paths.push(node.path); // Use absolute path or relative if preferred
              } else if (node.children) {
                  paths = [...paths, ...flatten(node.children)];
              }
          }
          return paths;
      };

      const paths = flatten(context.fileTree);
      return `Project Files:\n${paths.join('\n')}`;
  }
}
