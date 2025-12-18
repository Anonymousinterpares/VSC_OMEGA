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
                    const analysisRes = await this.callAgent('Analyser', message, context);
                    steps.push({ agent: 'Analyser', input: message, output: analysisRes });
                    this.emitSteps(steps);

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
                    const planRes = await this.callAgent('Planner', plannerInput, context);
                    steps.push({ agent: 'Planner', input: plannerInput, output: planRes });
                    this.emitSteps(steps);

                    // Step 3: Coder
                    const coderInput = `Execute this plan. Use <read_file> to investigate any files mentioned in verification tasks.\n\nPlan:\n${planRes}\n\nOriginal Request: ${message}`;
                    const codeRes = await this.callAgent('Coder', coderInput, context);
                    steps.push({ agent: 'Coder', input: coderInput, output: codeRes });
                    this.emitSteps(steps);

                    // Clean up the final output to remove internal JSON artifacts if any leaked
                    let cleanFinal = codeRes;
                    if (cleanFinal.includes('```json')) {
                         // Keep as is
                    }

                    return {
                        content: cleanFinal,
                        steps
                    };
                }

                // Recursive fallback
                const nextRes = await this.callAgent(nextAgent, message, context);
                steps.push({ agent: nextAgent, input: message, output: nextRes });
                this.emitSteps(steps);

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
        const toolOutput = await this.tools.executeTools(llmResponse);
        if (toolOutput) {
            finalOutput = `${llmResponse}\n\n--- TOOL OUTPUT ---\n${toolOutput}`;
        }
    }

    return {
        content: finalOutput,
        steps: [] 
    };
  }

  // Helper to call agents internally without full orchestrator overhead
  private async callAgent(agentName: string, message: string, context: any): Promise<string> {
      let systemPrompt = ROUTER_PROMPT;
      if (agentName === 'Analyser') systemPrompt = ANALYSER_PROMPT;
      if (agentName === 'Planner') systemPrompt = PLANNER_PROMPT;
      if (agentName === 'Coder') systemPrompt = CODER_PROMPT;

      const formattedContext = this.formatContext(context);
      const response = await this.llm.generateCompletion(systemPrompt, message, formattedContext);
      
      if (agentName === 'Coder') {
          const toolOutput = await this.tools.executeTools(response);
          if (toolOutput) {
              return `${response}\n\n--- TOOL OUTPUT ---\n${toolOutput}`;
          }
      }
      return response;
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
