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
  private fileSystem: FileSystemService;
  private tools: ToolHandler;
  private mainWindow: BrowserWindow | null;
  private currentTasks: ITask[] = [];
  private proposalManager: ProposalManager;
  private abortController: AbortController | null = null;
  private sessionStats = {
    totalInput: 0,
    totalOutput: 0,
    currentContextSize: 0,
    agentStats: {} as Record<string, { input: number; output: number; contextSize: number }>
  };

  private currentTurnStats = {
    input: 0,
    output: 0,
    agent: ''
  };

  // Files modified or read during the session (Auto-Context)
  private projectWorkingSet = new Map<string, string>();

  constructor(llm: LLMService, fileSystem: FileSystemService, mainWindow: BrowserWindow | null, proposalManager: ProposalManager) {
    this.llm = llm;
    this.fileSystem = fileSystem;
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

  private emitStats() {
    if (!this.mainWindow) return;

    // Combine session + current
    const displayStats = {
        totalInput: this.sessionStats.totalInput + this.currentTurnStats.input,
        totalOutput: this.sessionStats.totalOutput + (Math.round(this.currentTurnStats.output)),
        currentContextSize: this.currentTurnStats.input || this.sessionStats.currentContextSize,
        agentStats: { ...this.sessionStats.agentStats }
    };

    // Update the specific agent in the display stats
    if (this.currentTurnStats.agent) {
        const agent = this.currentTurnStats.agent;
        const existing = displayStats.agentStats[agent] || { input: 0, output: 0, contextSize: 0 };
        displayStats.agentStats[agent] = {
            input: existing.input + this.currentTurnStats.input,
            output: existing.output + Math.round(this.currentTurnStats.output),
            contextSize: this.currentTurnStats.input || existing.contextSize
        };
    }

    this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.AGENT_TOKEN_UPDATE, displayStats);
  }

  private emitPlan() {
    if (this.mainWindow) {
      this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.AGENT_PLAN_UPDATE, this.currentTasks);
    }
  }

  private updateStats(usage: any, agent: string) {
      if (!usage) return;
      
      // Overwrite current turn estimates with official data
      this.currentTurnStats.input = usage.promptTokenCount || 0;
      this.currentTurnStats.output = usage.candidatesTokenCount || 0;
      this.currentTurnStats.agent = agent;

      this.emitStats();
  }

  private commitTurn() {
      const agent = this.currentTurnStats.agent;
      if (!agent) return;

      this.sessionStats.totalInput += this.currentTurnStats.input;
      this.sessionStats.totalOutput += Math.round(this.currentTurnStats.output);
      this.sessionStats.currentContextSize = this.currentTurnStats.input;

      if (!this.sessionStats.agentStats[agent]) {
          this.sessionStats.agentStats[agent] = { input: 0, output: 0, contextSize: 0 };
      }
      this.sessionStats.agentStats[agent].input += this.currentTurnStats.input;
      this.sessionStats.agentStats[agent].output += Math.round(this.currentTurnStats.output);
      this.sessionStats.agentStats[agent].contextSize = this.currentTurnStats.input;

      // Reset current
      this.currentTurnStats = { input: 0, output: 0, agent: '' };
      this.emitStats();
  }

  public async compressHistory(messages: any[]): Promise<any[]> {
      if (!messages || messages.length <= 6) return messages;

      // Keep last 4 messages (plus the very first system message if it exists, but here we just take last 4)
      // Actually, typically we keep the last few turns.
      const KEEP_COUNT = 4;
      const recentMessages = messages.slice(-KEEP_COUNT);
      const olderMessages = messages.slice(0, -KEEP_COUNT);

      // Format older messages for summarization
      const historyText = olderMessages.map(m => `[${m.role} (${m.agentName || 'User'})]: ${m.content}`).join('\n\n');

      const systemPrompt = "You are a Technical Project Manager. Your task is to compress the following chat history into a detailed, structured summary.";
      const userPrompt = `
      Analyze the conversation history below. 
      Identify the key topics discussed, decisions made, and technical details established.
      Produce a summary that preserves all critical technical context (file paths, bug fixes, user preferences, architectural decisions) but removes conversational fluff.
      
      Format the output as a set of topic blocks:
      ### Topic: [Topic Name]
      - [Chronological Detail 1]
      - [Chronological Detail 2]
      
      HISTORY TO COMPRESS:
      ${historyText}
      `;

      try {
          // Use a basic context (empty) for this utility call
          const summary = await this.llm.generateCompletion(systemPrompt, userPrompt, "", (usage) => this.updateStats(usage, 'System_Compressor'));
          
          const summaryMessage = {
              id: Date.now().toString(),
              role: 'system',
              agentName: 'Context Manager',
              content: `**[CONTEXT COMPRESSED]**\nThe following is a summary of the earlier conversation:\n\n${summary}`,
              timestamp: Date.now()
          };

          return [summaryMessage, ...recentMessages];
      } catch (err) {
          console.error("Compression failed", err);
          return messages; // Fallback
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
      
      // Live estimation
      this.currentTurnStats.output += delta.length / 4;
      this.emitStats();
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

    // Build context with persistent working set
    let formattedContext = this.buildContextString(context, context?.fileTree, this.projectWorkingSet);

    let currentHistory = `User Request: ${message}`;
    let loopCount = 0;
    const MAX_LOOPS = 15;
    let finalContent = "";

    let nextAgent = 'Router';
    let currentInput = message;

    while (loopCount < MAX_LOOPS) {
      if (signal.aborted) break;

      // Refresh Context with latest file structure and session changes
      const freshTree = await this.fileSystem.getFileTree();
      formattedContext = this.buildContextString(context, freshTree, this.projectWorkingSet);

      // Force finish if all tasks are done
      if (this.currentTasks.length > 0 && this.currentTasks.every(t => t.status === 'completed')) {
        const finishMsg = `\n\n### ✅ All tasks completed. Finishing workflow.`;
        finalContent += finishMsg;
        this.emitContent(finalContent);
        nextAgent = 'FINISH';
      }

      loopCount++;

      // PRIORITY: If any task awaits review, force Reviewer
      if (this.currentTasks.some(t => t.status === 'review_pending') && nextAgent === 'Router') {
          nextAgent = 'Reviewer';
      }

      if (nextAgent === 'FINISH') break;

      if (nextAgent === 'Router') {
        this.emitStatus('Router');
        this.currentTurnStats.agent = 'Router';
        const routerSystemPrompt = ROUTER_PROMPT;

        const taskContext = this.currentTasks.length > 0
          ? `\n### CURRENT PLAN STATUS:\n${this.currentTasks.map(t => `- [${t.status === 'completed' ? 'x' : ' '}] **${t.id}:** ${t.description}`).join('\n')}`
          : "";

        const routerInput = `${currentHistory}${taskContext}\n\n[SYSTEM]: Based on the history above, who should act next? (Analyser, Planner, Coder, QA, Reviewer, or FINISH). Return JSON.`;

        let routerResponse = "";
        try {
          const stream = this.llm.generateCompletionStream(routerSystemPrompt, routerInput, formattedContext, signal, (usage) => this.updateStats(usage, 'Router'));
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
          this.commitTurn();

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

        this.currentTurnStats.agent = nextAgent;
        let agentOutput = "";

        try {
          const stream = this.llm.generateCompletionStream(agentSystemPrompt, currentInput, formattedContext, signal, (usage) => this.updateStats(usage, nextAgent));

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
                this.projectWorkingSet.set(path, content);
                streamBuffer = streamBuffer.replace(fullMatch, ""); 
                toolExecuted = true;
            } else if (replaceMatch) {
                const [fullMatch, path, oldStr, newStr] = replaceMatch;
                result = await this.tools.executeReplace(path, oldStr, newStr, autoApply);
                if (result) {
                   try {
                       const fullContent = await this.fileSystem.handleReadFile(path);
                       this.projectWorkingSet.set(path, fullContent);
                   } catch (e) { /* ignore read error */ }
                }
                streamBuffer = streamBuffer.replace(fullMatch, "");
                toolExecuted = true;
            } else if (readMatch) {
                const [fullMatch, path] = readMatch;
                result = await this.tools.executeRead(path);
                if (result) {
                   try {
                       const fullContent = await this.fileSystem.handleReadFile(path);
                       this.projectWorkingSet.set(path, fullContent);
                   } catch (e) { /* ignore */ }
                }
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

          // --- TASK STATUS PARSING ---
          const completedMatch = agentOutput.match(/\[COMPLETED:\s*(?:Task\s*)?([\d,\s]+)\]/gi);
          const verifiedMatch = agentOutput.match(/\[VERIFIED:\s*(?:Task\s*)?([\d,\s]+)\]/gi);
          const rejectedMatch = agentOutput.match(/\[REJECTED:\s*(?:Task\s*)?([\d,\s]+)\]/gi);

          if (completedMatch) {
              completedMatch.forEach(tag => {
                  const content = tag.match(/\[COMPLETED:\s*(?:Task\s*)?([\d,\s]+)\]/i);
                  if (content && content[1]) {
                      const ids = content[1].split(',').map(s => s.trim()).filter(Boolean);
                      ids.forEach(id => {
                          const task = this.currentTasks.find(t => t.id === id || t.id === `Task ${id}`);
                          if (task && task.status !== 'completed') {
                              if (autoMarkTasks) {
                                  task.status = 'completed';
                                  const msg = `\n\n[System: Auto-marked Task ${task.id} as COMPLETED]`;
                                  finalContent += msg;
                                  this.emitDelta(msg);
                              } else {
                                  task.status = 'review_pending';
                                  const msg = `\n\n[System: Task ${task.id} marked for REVIEW]`;
                                  finalContent += msg;
                                  this.emitDelta(msg);
                              }
                          }
                      });
                      this.emitPlan();
                  }
              });
          }

          if (verifiedMatch) {
              for (const tag of verifiedMatch) {
                  const content = tag.match(/\[VERIFIED:\s*(?:Task\s*)?([\d,\s]+)\]/i);
                  if (content && content[1]) {
                      const ids = content[1].split(',').map(s => s.trim()).filter(Boolean);
                      for (const id of ids) {
                          const task = this.currentTasks.find(t => t.id === id || t.id === `Task ${id}`);
                          if (task && (task.status === 'review_pending' || task.status === 'in_progress')) {
                              if (autoMarkTasks) {
                                  task.status = 'completed';
                                  const msg = `\n\n✅ [System: Task ${task.id} VERIFIED and COMPLETED]`;
                                  finalContent += msg;
                                  this.emitDelta(msg);
                              } else {
                                  if (signal.aborted) break;
                                  const result = await this.proposalManager.requestTaskConfirmation(task.description);
                                  if (result.status === 'confirmed') {
                                      task.status = 'completed';
                                      const msg = `\n\n✅ [System: User confirmed Task ${task.id}]`;
                                      finalContent += msg;
                                      this.emitDelta(msg);
                                  } else {
                                      task.status = 'in_progress';
                                      const msg = `\n\n❌ [System: User rejected Task ${task.id}: ${result.comment}]`;
                                      finalContent += msg;
                                      this.emitDelta(msg);
                                      currentHistory += `\n[User Rejection]: Task ${task.id} was rejected. Reason: ${result.comment}`;
                                  }
                              }
                          }
                      }
                      this.emitPlan();
                  }
              }
          }

          if (rejectedMatch) {
              rejectedMatch.forEach(tag => {
                  const content = tag.match(/\[REJECTED:\s*(?:Task\s*)?([\d,\s]+)\]/i);
                  if (content && content[1]) {
                      const ids = content[1].split(',').map(s => s.trim()).filter(Boolean);
                      ids.forEach(id => {
                          const task = this.currentTasks.find(t => t.id === id || t.id === `Task ${id}`);
                          if (task) {
                              task.status = 'in_progress';
                              const msg = `\n\n❌ [System: Task ${task.id} REJECTED by Reviewer]`;
                              finalContent += msg;
                              this.emitDelta(msg);
                          }
                      });
                      this.emitPlan();
                  }
              });
          }

          if (nextAgent === 'Planner') {
            this.parseChecklist(agentOutput);
          }

          currentHistory += `\n\n### ${nextAgent} Output:\n${agentOutput}`;

          steps.push({ agent: nextAgent, input: '...', output: agentOutput });
          this.emitSteps(steps);
          this.commitTurn();
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
      // Merge with existing tasks to preserve status if ID exists
      if (this.currentTasks.length > 0) {
          const merged = newTasks.map(newTask => {
              const existing = this.currentTasks.find(t => t.id === newTask.id || t.description === newTask.description);
              return existing ? { ...newTask, status: existing.status } : newTask;
          });
          this.currentTasks = merged;
      } else {
          this.currentTasks = newTasks;
      }
      this.emitPlan();
    }
  }

  // Helper to flatten context
  private buildContextString(baseContext: any, fileTree: any[], modifiedFiles: Map<string, string>): string {
      let output = "";

      // 1. File Tree (Structure)
      if (fileTree) {
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
          const paths = flatten(fileTree);
          output += `Project Files (Structure):\n${paths.join('\n')}\n\n`;
      }

      // 2. Active Context (User Selected)
      if (baseContext && baseContext.activeContext && baseContext.activeContext.length > 0) {
          output += "### ACTIVE CONTEXT (User Selected):\n";
          for (const item of baseContext.activeContext) {
              // We trust the user-selected context, but ideally it should be fresh too.
              // For now, we assume user selections are static references.
              if (item.type === 'fragment') {
                  output += `\n### FRAGMENT: ${item.path} (Lines ${item.startLine}-${item.endLine})\n${item.content}\n### END FRAGMENT\n`;
              } else if (item.type === 'file') {
                  output += `\n### FILE: ${item.path}\n${item.content}\n### END FILE\n`;
              }
          }
          output += "\n";
      }

      // 3. Recently Modified (Session Context)
      if (modifiedFiles.size > 0) {
          output += "### RECENTLY MODIFIED FILES (Auto-Context):\n";
          for (const [path, content] of modifiedFiles) {
              output += `\n### FILE: ${path}\n${content}\n### END FILE\n`;
          }
          output += "\n";
      }

      return output;
  }
}
