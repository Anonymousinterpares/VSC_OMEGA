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
  steps: { agent: string; input: string; output: string; reasoning?: string }[]; // Hidden trace
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

  private emitDelta(delta: string) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.AGENT_CONTENT_UPDATE, { delta });
    }
  }

  private emitStatus(agent: string) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.AGENT_STATUS_UPDATE, { agent });
    }
  }

  async handleMessage(request: IOrchestratorRequest): Promise<IOrchestratorResponse> {
    const { message, context } = request;
    const steps: { agent: string; input: string; output: string; reasoning?: string }[] = [];
    const autoApply = context?.autoApply ?? true;
    const autoMarkTasks = context?.autoMarkTasks ?? false;

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const formattedContext = this.formatContext(context);
    let currentHistory = `User Request: ${message}`;
    let loopCount = 0;
    const MAX_LOOPS = 15;
    let finalContent = "";

    let nextAgent = 'Router';
    let currentInput = message;

    while (loopCount < MAX_LOOPS) {
      if (signal.aborted) break;

      // Force finish if all tasks are done
      if (this.currentTasks.length > 0 && this.currentTasks.every(t => t.status === 'completed')) {
        const finishMsg = `\n\n### ✅ All tasks completed. Finishing workflow.`;
        finalContent += finishMsg;
        this.emitContent(finalContent);
        nextAgent = 'FINISH';
      }

      loopCount++;

      if (nextAgent === 'FINISH') break;

      if (nextAgent === 'Router') {
        this.emitStatus('Router');
        const routerSystemPrompt = ROUTER_PROMPT;

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

          if (nextAgent === 'FINISH') break;

          this.emitStatus(nextAgent);
          currentInput = currentHistory + taskContext;

        } catch (e: any) {
          if (e.message === 'Aborted by user') break;
          console.error("Router JSON Error:", routerResponse);
          finalContent += `\n[System Error: Router returned invalid JSON. Stopping.]\n`;
          this.emitContent(finalContent);
          break;
        }
      }

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

          finalContent += turnHeader;
          this.emitContent(finalContent);

          let streamBuffer = "";
          
          for await (const chunk of stream) {
            if (signal.aborted) break;
            agentOutput += chunk;
            streamBuffer += chunk;
            this.emitDelta(chunk);

            // --- STREAMING TOOL EXECUTION ---
            const writeMatch = /<write_file path="([^"]+)">([\s\S]*?)<\/write_file>/.exec(streamBuffer);
            const replaceMatch = /<replace path="([^"]+)">\s*<old>([\s\S]*?)<\/old>\s*<new>([\s\S]*?)<\/new>\s*<\/replace>/.exec(streamBuffer);
            const readMatch = /<read_file>(.*?)<\/read_file>/.exec(streamBuffer);

            let toolExecuted = false;
            let result = null;

            if (writeMatch) {
                const [fullMatch, path, content] = writeMatch;
                result = await this.tools.executeWrite(path, content, autoApply);
                streamBuffer = streamBuffer.replace(fullMatch, ""); 
                toolExecuted = true;
            } else if (replaceMatch) {
                const [fullMatch, path, oldStr, newStr] = replaceMatch;
                result = await this.tools.executeReplace(path, oldStr, newStr, autoApply);
                streamBuffer = streamBuffer.replace(fullMatch, "");
                toolExecuted = true;
            } else if (readMatch) {
                const [fullMatch, path] = readMatch;
                result = await this.tools.executeRead(path);
                streamBuffer = streamBuffer.replace(fullMatch, "");
                toolExecuted = true;
            }

            if (toolExecuted && result) {
                const toolMsg = `\n\n[System Tool Output]:\n${result.userOutput}`;
                finalContent += toolMsg;
                this.emitDelta(toolMsg);
                currentHistory += `\n\n### ${nextAgent} Tool Execution:\n${result.llmOutput}`;
            }
          }

          finalContent += agentOutput;

          if (signal.aborted) break;

          // Check for task completion tags
          const completionMatch = agentOutput.match(/ \[COMPLETED:\s*(Task\s*\d+)\]/gi);
          if (completionMatch) {
            completionMatch.forEach(tag => {
              const taskIdMatch = tag.match(/Task\s*\d+/i);
              if (taskIdMatch) {
                const taskId = taskIdMatch[0];
                const task = this.currentTasks.find(t => t.id.toLowerCase().includes(taskId.toLowerCase()));
                if (task && task.status !== 'completed') {
                  task.status = 'completed';
                  const msg = `\n\n[System: Agent marked ${taskId} as completed]`
                  finalContent += msg;
                  this.emitDelta(msg);
                }
              }
            });
          }

          if (nextAgent === 'Planner') {
            this.parseChecklist(agentOutput);
          }

          if (nextAgent === 'Coder') {
            // Streaming execution handles most tools.
            // We use executeTools only for any leftover search or unparsed blocks.
            // For now, we assume streaming covered it to avoid duplication.
            
            // User verification gate if autoMarkTasks is off
            if (!autoMarkTasks && this.currentTasks.some(t => t.status === 'pending')) {
              if (signal.aborted) break;
              const pendingTask = this.currentTasks.find(t => t.status === 'pending');
              if (pendingTask) {
                const result = await this.proposalManager.requestTaskConfirmation(pendingTask.description);
                if (result.status === 'confirmed') {
                  pendingTask.status = 'completed';
                  const msg = `\n\n✅ **User confirmed completion of:** ${pendingTask.description}`;
                  finalContent += msg;
                  currentHistory += `\n\n[SYSTEM]: User confirmed that the task "${pendingTask.description}" is completed.`;
                  this.emitDelta(msg);
                } else {
                  pendingTask.status = 'rejected';
                  const msg = `\n\n❌ **User REJECTED completion of:** ${pendingTask.description}\n**Reason:** ${result.comment}`;
                  finalContent += msg;
                  currentHistory += `\n\n[SYSTEM]: User REJECTED that the task "${pendingTask.description}" is completed. User Comment: ${result.comment}. Please address the issue.`;
                  this.emitDelta(msg);
                }
              }
            }
          } else {
            currentHistory += `\n\n### ${nextAgent} Output:\n${agentOutput}`;
          }

          steps.push({ agent: nextAgent, input: '...', output: agentOutput });
          this.emitSteps(steps);
          nextAgent = 'Router';

        } catch (err: any) {
          if (err.message === 'Aborted by user') break;
          console.error(`Error in ${nextAgent}:`, err);
          const errorMsg = `\n[Error executing ${nextAgent}: ${err.message}]\n`;
          finalContent += errorMsg;
          this.emitDelta(errorMsg);
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
    const strictRegex = /- \[ \] \*\*(Task \d+:)\*\* (.*?)(?:\*Verify by:\* (.*))?$/gm;
    const looseRegex = /^(?:-|\d+\.)\s*(?:[\s]*\[\s*\]\s*)?(?:\*\*)?(Task\s*\d+:)?(?:\*\*)?\s*(.*?)$/gm;

    let match;
    const newTasks: ITask[] = [];

    // Try strict first
    while ((match = strictRegex.exec(text)) !== null) {
      newTasks.push({
        id: match[1].replace(':', ''),
        description: match[2].trim(),
        status: 'pending'
      });
    }

    // If strict failed, try loose
    if (newTasks.length === 0) {
      while ((match = looseRegex.exec(text)) !== null) {
        if (match[2] && match[2].trim().length > 5) {
          newTasks.push({
            id: match[1] ? match[1].replace(':', '') : `Task ${newTasks.length + 1}`,
            description: match[2].trim(),
            status: 'pending'
          });
        }
      }
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
