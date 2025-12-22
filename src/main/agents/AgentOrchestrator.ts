import { BrowserWindow } from 'electron';
import { LLMService } from '../services/LLMService';
import { ToolHandler } from './ToolHandler';
import { SettingsService } from '../services/SettingsService';
import { FileSystemService } from '../services/FileSystem';
import { ProposalManager } from '../services/ProposalManager';
import { WorkflowService } from '../services/WorkflowService';
import { ContextManager } from '../services/ContextManager';
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
  private workflowService: WorkflowService;
  private settingsService: SettingsService;
  private contextManager: ContextManager;
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

  // Pause State
  private isPaused = false;
  private pausePromise: Promise<void> | null = null;
  private pauseResolve: (() => void) | null = null;

  // Files modified or read during the session (Auto-Context)
  private projectWorkingSet = new Map<string, string>();

  constructor(
      llm: LLMService, 
      fileSystem: FileSystemService, 
      workflowService: WorkflowService,
      settingsService: SettingsService,
      mainWindow: BrowserWindow | null, 
      proposalManager: ProposalManager
  ) {
    this.llm = llm;
    this.fileSystem = fileSystem;
    this.workflowService = workflowService;
    this.settingsService = settingsService;
    this.mainWindow = mainWindow;
    this.proposalManager = proposalManager;
    this.tools = new ToolHandler(fileSystem, proposalManager);
    this.contextManager = new ContextManager();
  }

  public stop() {
    if (this.abortController) {
      this.abortController.abort();
      this.emitContent("\n\n[System: Workflow Stopped by User]\n");
    }
  }

  public pause() {
      this.isPaused = true;
      if (!this.pausePromise) {
          this.pausePromise = new Promise((resolve) => {
              this.pauseResolve = resolve;
          });
      }
      this.emitContent("\n\n[System: Workflow Paused...]\n");
  }

  public resume() {
      this.isPaused = false;
      if (this.pauseResolve) {
          this.pauseResolve();
          this.pauseResolve = null;
          this.pausePromise = null;
      }
      this.emitContent("\n\n[System: Workflow Resumed]\n");
  }

  private async waitForResume() {
      if (this.pausePromise) {
          await this.pausePromise;
      }
  }

  private emitPaused(contextData: any) {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.AGENT_PAUSED, contextData);
      }
  }

  private emitResumed() {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.AGENT_RESUMED);
      }
  }

  private emitStats() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

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
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
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
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.AGENT_STEP_UPDATE, { steps });
    }
  }

  private emitContent(content: string) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.AGENT_CONTENT_UPDATE, { content });
    }
  }

  private emitDelta(delta: string) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.AGENT_CONTENT_UPDATE, { delta });
      
      // Live estimation
      this.currentTurnStats.output += delta.length / 4;
      this.emitStats();
    }
  }

  private emitStatus(agent: string) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.AGENT_STATUS_UPDATE, { agent });
    }
  }

  async handleMessage(request: IOrchestratorRequest): Promise<IOrchestratorResponse> {
    const { message, context } = request;
    const settings = await this.settingsService.getSettings();
    const isSoloMode = settings.agenticMode === 'solo';

    const steps: { agent: string; input: string; output: string; reasoning?: string }[] = [];
    const autoApply = context?.autoApply ?? true;
    const autoMarkTasks = context?.autoMarkTasks ?? false;
    
    // Get Workflow Definition
    const workflow = this.workflowService.getCurrentWorkflow();

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Build context with persistent working set via ContextManager
    let formattedContext = this.contextManager.buildContextString(context?.activeContext, context?.fileTree, this.projectWorkingSet);

    // PREPEND HISTORY: Format the previous messages so the agent sees the full conversation
    const historyText = request.history && request.history.length > 0 
        ? request.history.map(m => `[${m.role === 'user' ? 'User' : (m.agentName || 'System')}]: ${m.content}`).join('\n\n') + '\n\n'
        : "";

    let currentHistory = `${historyText}User Request: ${message}`;
    let loopCount = 0;
    const MAX_LOOPS = 15;
    let finalContent = "";

    // In Solo mode, start with 'Solo'. In Agentic, start with 'Router'.
    let nextAgent = isSoloMode ? 'Solo' : 'Router';
    let currentInput = message;

    while (loopCount < MAX_LOOPS) {
      if (signal.aborted) break;

      // Refresh Context with latest file structure and session changes
      const freshTree = await this.fileSystem.getFileTree();
      formattedContext = this.contextManager.buildContextString(context?.activeContext, freshTree, this.projectWorkingSet);

      if (this.isPaused) {
          let previewSystemPrompt = "";
          let previewInput = "";
          
          if (nextAgent === 'Router') {
              previewSystemPrompt = workflow.routerPrompt;
              previewInput = currentHistory;
          } else if (nextAgent !== 'FINISH') {
              const agentDef = this.workflowService.getAgent(nextAgent);
              previewSystemPrompt = agentDef?.systemPrompt || "";
              previewInput = currentInput;
          }

          this.emitPaused({
              agent: nextAgent,
              systemPrompt: previewSystemPrompt,
              userHistory: previewInput,
              fileContext: formattedContext
          });

          await this.waitForResume();
          this.emitResumed();
      }

      /* 
         REMOVED FORCE FINISH: 
         Rely on Router to decide. If we force finish here, new user inputs are ignored 
         if the previous tasks remain in the 'completed' state.
      */

      loopCount++;

      // PRIORITY: If any task awaits review, force Reviewer (ONLY IN AGENTIC MODE)
      if (!isSoloMode && this.currentTasks.some(t => t.status === 'review_pending') && nextAgent === 'Router') {
          nextAgent = 'Reviewer';
      }

      if (nextAgent === 'FINISH') break;

      if (nextAgent === 'Router') {
        this.emitStatus('Router');
        this.currentTurnStats.agent = 'Router';
        const routerSystemPrompt = workflow.routerPrompt;

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

          // --- PAUSE CHECK AFTER ROUTER DECISION ---
          if (this.isPaused && nextAgent !== 'FINISH') {
               const agentDef = this.workflowService.getAgent(nextAgent);
               const previewSystemPrompt = agentDef?.systemPrompt || "";
               
               // For the next agent, the input is the FULL history + task context
               const previewInput = currentHistory + taskContext;

               this.emitPaused({
                  agent: nextAgent,
                  systemPrompt: previewSystemPrompt,
                  userHistory: previewInput,
                  fileContext: formattedContext
               });

               await this.waitForResume();
               this.emitResumed();
          }

          if (nextAgent === 'FINISH') {
              const incompleteTasks = this.currentTasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
              if (incompleteTasks.length > 0) {
                  // INTERCEPT: Tasks are not done, but Router wants to finish.
                  nextAgent = 'QA';
                  const verificationPrompt = `\n\n[SYSTEM INTERRUPT]: The Router signaled to FINISH, but the following tasks are still marked as incomplete in the system:\n${incompleteTasks.map(t => `- ${t.id}: ${t.description}`).join('\n')}\n\nReview the conversation history above.\n1. If these tasks were actually completed by the Coder/Agent, output "**[COMPLETED: Task ID]**" for each.\n2. If they were NOT completed, list what is missing and provide a brief plan to finish them.\n3. If they are invalid, mark them as "**[REJECTED: Task ID]**".`;
                  
                  // We append this to the current history context so the QA agent sees it as the immediate trigger
                  currentHistory += verificationPrompt;
                  
                  // Also inform the user via UI
                  const interceptMsg = `\n\n### 🛡️ Verifying Task Completion...\n*Router wanted to finish, but ${incompleteTasks.length} tasks are pending. Asking QA to verify.*`;
                  finalContent += interceptMsg;
                  this.emitContent(finalContent);

              } else {
                  break;
              }
          }

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

        const agentDef = this.workflowService.getAgent(nextAgent);
        
        // Fallback or Error if agent not found
        if (!agentDef) {
             const errorMsg = `\n[System Error: Agent '${nextAgent}' not found in workflow definition.]\n`;
             finalContent += errorMsg;
             this.emitContent(finalContent);
             break;
        }

        const agentSystemPrompt = agentDef.systemPrompt;

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
          const completedMatch = agentOutput.match(/\[COMPLETED:([^\]]+)\]/gi);
          const verifiedMatch = agentOutput.match(/\[VERIFIED:([^\]]+)\]/gi);
          const rejectedMatch = agentOutput.match(/\[REJECTED:([^\]]+)\]/gi);

          if (completedMatch) {
              completedMatch.forEach(tag => {
                  const contentMatch = tag.match(/\[COMPLETED:([^\]]+)\]/i);
                  if (contentMatch && contentMatch[1]) {
                      const ids = contentMatch[1].match(/\d+/g); // Extract all numbers
                      if (ids) {
                          ids.forEach(id => {
                              // Check strict ID match or "Task ID" match
                              const task = this.currentTasks.find(t => t.id === id || t.id === `Task ${id}` || t.id.endsWith(` ${id}`));
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
                  }
              });
          }

          if (verifiedMatch) {
              for (const tag of verifiedMatch) {
                  const contentMatch = tag.match(/\[VERIFIED:([^\]]+)\]/i);
                  if (contentMatch && contentMatch[1]) {
                      const ids = contentMatch[1].match(/\d+/g);
                      if (ids) {
                          for (const id of ids) {
                              const task = this.currentTasks.find(t => t.id === id || t.id === `Task ${id}` || t.id.endsWith(` ${id}`));
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
          }

          if (rejectedMatch) {
              rejectedMatch.forEach(tag => {
                  const contentMatch = tag.match(/\[REJECTED:([^\]]+)\]/i);
                  if (contentMatch && contentMatch[1]) {
                      const ids = contentMatch[1].match(/\d+/g);
                      if (ids) {
                          ids.forEach(id => {
                              const task = this.currentTasks.find(t => t.id === id || t.id === `Task ${id}` || t.id.endsWith(` ${id}`));
                              if (task) {
                                  task.status = 'in_progress';
                                  const msg = `\n\n❌ [System: Task ${task.id} REJECTED by Reviewer]`;
                                  finalContent += msg;
                                  this.emitDelta(msg);
                              }
                          });
                          this.emitPlan();
                      }
                  }
              });
          }

          if (nextAgent === 'Planner') {
            this.parseChecklist(agentOutput);
          }

          // Check for explicit [FINISH] token from Solo agent
          if (isSoloMode && agentOutput.includes('[FINISH]')) {
              nextAgent = 'FINISH';
              finalContent += "\n\n[System: Solo Agent indicated completion.]\n";
          } else {
             // If not finishing, determine next step
             if (isSoloMode) {
                 nextAgent = 'Solo';
                 // For Solo, we just append the output to history and let it run again
             } else {
                 nextAgent = 'Router';
             }
          }

          // --- SOLO MODE: FORCE STOP IF NO TOOLS USED (Plan Phase) ---
          const hasToolTags = /<(write|read|replace)[^>]*>/i.test(agentOutput); 
          if (isSoloMode && !hasToolTags && nextAgent !== 'FINISH') {
              // This was likely a planning turn. Stop to let user confirm.
              nextAgent = 'FINISH'; 
              finalContent += "\n\n[System: Solo Agent awaiting user confirmation.]\n";
          }

          currentHistory += `\n\n### ${nextAgent === 'FINISH' && isSoloMode ? 'Solo' : (isSoloMode ? 'Solo' : nextAgent)} Output:\n${agentOutput}`;
          if (isSoloMode) {
              currentInput = currentHistory; // Keep feeding full history
          }

          steps.push({ agent: isSoloMode ? 'Solo' : nextAgent, input: '...', output: agentOutput });
          this.emitSteps(steps);
          this.commitTurn();
          
          // If we just finished via Solo token, break loop
          if (nextAgent === 'FINISH') break;

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
    console.log("Orchestrator: Parsing checklist from Planner output...");
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

    console.log(`Orchestrator: Found ${newTasks.length} tasks.`);

    if (newTasks.length > 0) {
      // Merge with existing tasks to preserve status if ID exists
      if (this.currentTasks.length > 0) {
          const merged = newTasks.map(newTask => {
              // Match primarily on ID
              const existing = this.currentTasks.find(t => t.id === newTask.id);
              
              if (existing) {
                  // Only preserve status if the description is substantially the same.
                  // If the description changed, it's likely a new task with reused ID -> Reset to pending.
                  if (existing.description.trim() === newTask.description.trim()) {
                      return { ...newTask, status: existing.status };
                  } else {
                      const pendingStatus: ITask['status'] = 'pending';
                      return { ...newTask, status: pendingStatus };
                  }
              }
              
              // Fallback: If no ID match, check description match (unlikely but safe)
              const existingByDesc = this.currentTasks.find(t => t.description === newTask.description);
              if (existingByDesc) {
                   return { ...newTask, status: existingByDesc.status };
              }

              return newTask;
          });
          this.currentTasks = merged;
      } else {
          this.currentTasks = newTasks;
      }
      this.emitPlan();
    }
  }
}
