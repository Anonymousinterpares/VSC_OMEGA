import { BrowserWindow } from 'electron';
import { LLMService } from '../services/LLMService';
import { ToolHandler } from './ToolHandler';
import { FileSystemService } from '../services/FileSystem';
import { ProposalManager } from '../services/ProposalManager';
import { ANALYSER_PROMPT, PLANNER_PROMPT } from './definitions/01_Analysis_Planning';
import { CODER_PROMPT, QA_PROMPT, REVIEWER_PROMPT } from './definitions/02_Coding_QA';
import { ROUTER_PROMPT } from './definitions/03_Router';
import { CHANNELS } from '../../shared/constants';
import { ITask } from '../../shared/types';

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
  private currentTasks: ITask[] = [];
  private proposalManager: ProposalManager;
  private abortController: AbortController | null = null;

  constructor(llm: LLMService, fileSystem: FileSystemService, mainWindow: BrowserWindow | null, proposalManager: ProposalManager) {
    this.llm = llm;
    this.mainWindow = mainWindow;
    this.proposalManager = proposalManager;
    this.tools = new ToolHandler(fileSystem, proposalManager);
  }

  public stop() {
      if (this.abortController) {
          this.abortController.abort();
          this.emitContent("\n\n[System: Workflow Stopped by User]\n");
      }
  }

  private emitSteps(steps: any[]) {
      if (this.mainWindow) {
          this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.AGENT_STEP_UPDATE, { steps });
      }
  }

  private emitContent(content: string) {
      if (this.mainWindow) {
          this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.AGENT_CONTENT_UPDATE, { content });
      }
  }

  async handleMessage(request: IOrchestratorRequest): Promise<IOrchestratorResponse> {
    const { agent, message, context } = request;
    const steps: { agent: string, input: string, output: string, reasoning?: string }[] = [];
    const autoApply = context?.autoApply ?? true;
    const autoMarkTasks = context?.autoMarkTasks ?? false;

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // 2. Dynamic Agent Loop
    const formattedContext = this.formatContext(context);
    let currentHistory = `User Request: ${message}`;
    let loopCount = 0;
    const MAX_LOOPS = 15;
    let finalContent = "";

    // Initial state: Start with Router
    let nextAgent = 'Router';
    let currentInput = message;

    while (loopCount < MAX_LOOPS) {
        if (signal.aborted) {
            break;
        }

        loopCount++;

        if (nextAgent === 'FINISH') {
            break;
        }

        // --- 1. Router Step (Determine who goes next) ---
        if (nextAgent === 'Router') {
            const routerSystemPrompt = ROUTER_PROMPT;
            
            // Inject Task List into context
            const taskContext = this.currentTasks.length > 0 
                ? `\n### CURRENT PLAN STATUS:\n${this.currentTasks.map(t => `- [${t.status === 'completed' ? 'x' : ' '}] ${t.description}`).join('\n')}`
                : "";

            const routerInput = `${currentHistory}${taskContext}\n\n[SYSTEM]: Based on the history above, who should act next? (Analyser, Planner, Coder, QA, Reviewer, or FINISH). Return JSON.`;
            
            let routerResponse = "";
            try {
                const stream = this.llm.generateCompletionStream(routerSystemPrompt, routerInput, formattedContext, signal);
                for await (const chunk of stream) {
                    if (signal.aborted) break;
                    routerResponse += chunk;
                }

                if (signal.aborted) break;
                
                const cleanJson = routerResponse.replace(/```json/g, '').replace(/```/g, '').trim();
                const decision = JSON.parse(cleanJson);
                
                nextAgent = decision.next_agent;
                const reasoning = decision.reasoning;
                
                steps.push({ agent: 'Router', input: 'Deciding next step...', output: `Selected: ${nextAgent}`, reasoning });
                this.emitSteps(steps);

                if (nextAgent === 'FINISH') {
                    break;
                }

                currentInput = currentHistory + taskContext;

            } catch (e: any) {
                if (e.message === 'Aborted by user') break;
                console.error("Router JSON Error:", routerResponse);
                finalContent += `\n[System Error: Router returned invalid JSON. Stopping.]\n`;
                this.emitContent(finalContent);
                break;
            }
        }

        // --- 2. Execute Selected Agent ---
        if (nextAgent !== 'Router' && nextAgent !== 'FINISH') {
            if (signal.aborted) break;

            let agentSystemPrompt = ROUTER_PROMPT; 
            if (nextAgent === 'Analyser') agentSystemPrompt = ANALYSER_PROMPT;
            if (nextAgent === 'Planner') agentSystemPrompt = PLANNER_PROMPT;
            if (nextAgent === 'Coder') agentSystemPrompt = CODER_PROMPT;
            if (nextAgent === 'QA') agentSystemPrompt = QA_PROMPT;
            if (nextAgent === 'Reviewer') agentSystemPrompt = REVIEWER_PROMPT;

            let agentOutput = "";
            
            try {
                const stream = this.llm.generateCompletionStream(agentSystemPrompt, currentInput, formattedContext, signal);
                
                let turnHeader = "";
                if (finalContent !== "") turnHeader = `\n\n--- Next Step: ${nextAgent} ---\n\n`;
                else turnHeader = `### ${nextAgent} is working...\n\n`;
                
                this.emitContent(finalContent + turnHeader); 

                for await (const chunk of stream) {
                    if (signal.aborted) break;
                    agentOutput += chunk;
                    this.emitContent(finalContent + turnHeader + agentOutput);
                }

                if (signal.aborted) break;

                // --- 3. Post-Process Agent Output ---
                let uiFriendlyOutput = agentOutput;
                
                // PARSE CHECKLIST if Planner
                if (nextAgent === 'Planner') {
                    this.parseChecklist(agentOutput);
                }

                if (['Analyser', 'QA', 'Reviewer'].includes(nextAgent)) {
                    try {
                        const cleanJson = agentOutput.replace(/```json/g, '').replace(/```/g, '').trim();
                        const parsed = JSON.parse(cleanJson);
                        
                        if (nextAgent === 'Analyser') {
                            uiFriendlyOutput = `**Summary:** ${parsed.summary}\n\n**Subsystems:** ${parsed.domains.join(', ')}\n\n**Risks:**\n${parsed.risks.map((r:string) => `- ${r}`).join('\n')}`;
                        } else if (nextAgent === 'QA') {
                            uiFriendlyOutput = `**QA Status:** ${parsed.status === 'PASS' ? '✅ PASS' : '❌ FAIL'}\n\n**Defects:**\n${parsed.defects.map((d:any) => `- [${d.severity}] ${d.description} (${d.location})`).join('\n')}`;
                        } else if (nextAgent === 'Reviewer') {
                            uiFriendlyOutput = `**Review Status:** ${parsed.status === 'APPROVED' ? '✅ APPROVED' : '❌ REJECTED'}\n\n**Comments:**\n${parsed.comments.map((c:string) => `- ${c}`).join('\n')}`;
                        }
                    } catch (e) {}
                }

                // --- 4. Tool Execution (for Coder) ---
                if (nextAgent === 'Coder') {
                    if (signal.aborted) break;
                    const toolResult = await this.tools.executeTools(agentOutput, autoApply);
                    if (toolResult) {
                        const toolMsg = `\n\n[System Tool Output]:\n${toolResult.userOutput}`;
                        uiFriendlyOutput += toolMsg;
                        this.emitContent(finalContent + turnHeader + uiFriendlyOutput);
                        currentHistory += `\n\n### ${nextAgent} Output:\n${agentOutput}\n\n### Tool Result:\n${toolResult.llmOutput}`;
                    } else {
                         currentHistory += `\n\n### ${nextAgent} Output:\n${agentOutput}`;
                    }

                    // --- VERIFICATION GATE ---
                    if (!autoMarkTasks && this.currentTasks.some(t => t.status === 'pending')) {
                        if (signal.aborted) break;
                        const pendingTask = this.currentTasks.find(t => t.status === 'pending');
                        if (pendingTask) {
                            const result = await this.proposalManager.requestTaskConfirmation(pendingTask.description);
                            if (result.status === 'confirmed') {
                                pendingTask.status = 'completed';
                                finalContent += `\n\n✅ **User confirmed completion of:** ${pendingTask.description}`;
                                currentHistory += `\n\n[SYSTEM]: User confirmed that the task "${pendingTask.description}" is completed.`;
                            } else {
                                pendingTask.status = 'rejected';
                                finalContent += `\n\n❌ **User REJECTED completion of:** ${pendingTask.description}\n**Reason:** ${result.comment}`;
                                currentHistory += `\n\n[SYSTEM]: User REJECTED that the task "${pendingTask.description}" is completed. User Comment: ${result.comment}. Please address the issue.`;
                            }
                            this.emitContent(finalContent);
                        }
                    }
                } else {
                    currentHistory += `\n\n### ${nextAgent} Output:\n${agentOutput}`;
                }
                
                steps.push({ agent: nextAgent, input: '...', output: agentOutput });
                this.emitSteps(steps);

                finalContent += turnHeader + uiFriendlyOutput;
                this.emitContent(finalContent);

                nextAgent = 'Router';

            } catch (err: any) {
                 if (err.message === 'Aborted by user') break;
                 console.error(`Error in ${nextAgent}:`, err);
                 finalContent += `\n[Error executing ${nextAgent}: ${err.message}]\n`;
                 this.emitContent(finalContent);
                 break;
            }
        }
    }
    this.abortController = null;
    return {
        content: finalContent,
        steps: [] 
    };
  }

  private parseChecklist(text: string) {
      const regex = /- \[ \] \*\*(Task \d+:)\*\* (.*?)(?:\*Verify by:\* (.*))?$/gm;
      let match;
      const newTasks: ITask[] = [];
      while ((match = regex.exec(text)) !== null) {
          newTasks.push({
              id: match[1],
              description: match[2].trim(),
              status: 'pending'
          });
      }
      if (newTasks.length > 0) {
          this.currentTasks = newTasks;
      }
  }

  // Helper to flatten context
  private formatContext(context: any): string {
      let output = "";

      // 1. File Tree (Structure)
      if (context && context.fileTree) {
          const flatten = (nodes: any[]): string[] => {
              let paths: string[] = [];
              for (const node of nodes) {
                  if (node.type === 'file') {
                      paths.push(node.path);
                  } else if (node.children) {
                      paths = [...paths, ...flatten(node.children)];
                  }
              }
              return paths;
          };
          const paths = flatten(context.fileTree);
          output += `Project Files (Structure):\n${paths.join('\n')}\n\n`;
      }

      // 2. Active Context (Fragments/Files selected by User)
      if (context && context.activeContext && context.activeContext.length > 0) {
          output += "### ACTIVE CONTEXT (User Selected):\n";
          for (const item of context.activeContext) {
              if (item.type === 'fragment') {
                  output += `\n### FRAGMENT: ${item.path} (Lines ${item.startLine}-${item.endLine})\n${item.content}\n### END FRAGMENT\n`;
              } else if (item.type === 'file') {
                  // For whole files added to context
                  output += `\n### FILE: ${item.path}\n${item.content}\n### END FILE\n`;
              }
          }
          output += "\n";
      }

      return output;
  }
}