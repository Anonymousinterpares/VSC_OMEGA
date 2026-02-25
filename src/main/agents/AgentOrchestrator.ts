import { BrowserWindow } from 'electron';
import { LLMService } from '../services/LLMService';
import { ToolHandler } from './ToolHandler';
import { SettingsService } from '../services/SettingsService';
import { WebBrowserService } from '../services/WebBrowserService';
import { FileSystemService } from '../services/FileSystem';
import { ProposalManager } from '../services/ProposalManager';
import { WorkflowService } from '../services/WorkflowService';
import { ContextManager } from '../services/ContextManager';
import { LoopHandler } from '../services/LoopHandler';
import { ResponseParser } from './ResponseParser';
import { HistoryManager } from './HistoryManager';
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
  private loopHandler: LoopHandler;
  private parser: ResponseParser;
  private historyManager: HistoryManager;

  private mainWindow: BrowserWindow | null;
  private currentTasks: ITask[] = [];
  private abortController: AbortController | null = null;

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
    
    // Instantiate dependencies
    const browserService = new WebBrowserService(settingsService);
    this.tools = new ToolHandler(fileSystem, proposalManager, browserService, llm, mainWindow || undefined);
    
    this.contextManager = new ContextManager();
    this.loopHandler = new LoopHandler();
    this.parser = new ResponseParser();
    this.historyManager = new HistoryManager();
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

  public killActiveProcess() {
      this.tools.killActiveProcess();
  }

  public writeToProcess(data: string) {
      this.tools.writeToProcess(data);
  }

  public reset() {
      this.currentTasks = [];
      this.historyManager.resetStats();
      this.projectWorkingSet.clear();
      this.emitPlan();
      this.emitStats();
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
    this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.AGENT_TOKEN_UPDATE, this.historyManager.getStats());
  }

  private emitPlan() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.AGENT_PLAN_UPDATE, this.currentTasks);
    }
  }

  private updateStats(usage: any, agent: string) {
      this.historyManager.updateUsage(usage, agent);
      this.emitStats();
  }

  private commitTurn() {
      this.historyManager.commitTurn();
      this.emitStats();
  }

  public async compressHistory(messages: any[]): Promise<any[]> {
      return this.historyManager.compressHistory(messages, this.llm);
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
      this.historyManager.updateLiveOutput(delta.length);
      this.emitStats();
    }
  }

  private emitStatus(agent: string) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.AGENT_STATUS_UPDATE, { agent });
    }
  }

  private emitPhase(phase: any, details?: string) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.AGENT_PHASE_UPDATE, { 
        phase, 
        details, 
        timestamp: Date.now() 
      });
    }
  }

  async handleMessage(request: IOrchestratorRequest): Promise<IOrchestratorResponse> {
    const { message, context } = request;
    const settings = await this.settingsService.getSettings();
    const isSoloMode = settings.agenticMode === 'solo';
    const operationMode = settings.operationMode || 'standard';

    console.log(`[Orchestrator] Handling message. Mode: ${operationMode}, AutoApply: ${context?.autoApply ?? true}`);

    // 1. Configure Tool Security
    this.tools.setOperationMode(operationMode);

    this.emitPhase('PREPARING_CONTEXT', 'Reading files and building context...');

    const steps: { agent: string; input: string; output: string; reasoning?: string }[] = [];
    const autoApply = context?.autoApply ?? true;
    const autoMarkTasks = context?.autoMarkTasks ?? false;
    
    // Get Workflow Definition
    const workflow = this.workflowService.getCurrentWorkflow();

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // 2. Load Master Instructions
    const masterInstructions = await this.contextManager.loadInstructions(this.fileSystem.getProjectRoot());

    // Build context with persistent working set via ContextManager
    let formattedContext = this.contextManager.buildContextString(context?.activeContext, context?.fileTree, this.projectWorkingSet, masterInstructions);

    // PREPEND HISTORY: Format the previous messages so the agent sees the full conversation
    console.log(`[Orchestrator] Received history items: ${request.history?.length || 0}`);
    const historyText = this.historyManager.formatHistoryText(request.history || []);
    
    // 3. Mode-Specific Prompt Injection
    let modeSystemInject = "";
    if (operationMode === 'documentation') {
        modeSystemInject = "\n\n[SYSTEM NOTICE]: You are in DOCUMENTATION MODE. You may only read files and create/edit Markdown (.md) files. Do NOT attempt to modify code or run commands.";
    } else if (operationMode === 'analysis') {
        modeSystemInject = "\n\n[SYSTEM NOTICE]: You are in ANALYSIS MODE. You are a read-only analyst. You MUST NOT edit files or run commands. Your goal is to answer questions, analyze code, or produce plain text reports. Output your final answer as a clear, well-formatted plain text response. Do not produce JSON unless explicitly asked.";
    }

    let currentHistory = `${historyText}User Request: ${message}${modeSystemInject}`;
    let loopCount = 0;
    const MAX_LOOPS = 30;
    let finalContent = "";

    // In Solo mode, start with 'Solo'. In Agentic, start with 'Router'.
    // If in Analysis Mode, we also force 'Solo' (acting as Analyst) to bypass Router decision logic.
    let nextAgent = (isSoloMode || operationMode === 'analysis') ? 'Solo' : 'Router';
    let currentInput = message;

    while (loopCount < MAX_LOOPS) {
      if (signal.aborted) break;

      // Refresh Context with latest file structure and session changes
      const freshTree = await this.fileSystem.getFileTree();
      formattedContext = this.contextManager.buildContextString(context?.activeContext, freshTree, this.projectWorkingSet, masterInstructions);

      if (this.isPaused) {
          let previewSystemPrompt = "";
          let previewInput = "";
          
          if (nextAgent === 'Router') {
              previewSystemPrompt = workflow.routerPrompt;
              previewInput = currentHistory;
          } else if (nextAgent !== 'FINISH') {
              const agentDef = this.workflowService.getAgent(nextAgent);
              let effectiveSystemPrompt = agentDef?.systemPrompt || "";
              
              // Override Prompt for Analysis Mode
              if (operationMode === 'analysis') {
                   effectiveSystemPrompt = `You are an expert Systems Analyst and Reporter.
                   
GOAL: Analyze the provided code/context and answer the User's Request in detail.

CONSTRAINTS:
- You are in READ-ONLY mode.
- DO NOT write files or replace code.
- DO NOT run terminal commands (except for <search> or <list_directory>).
- Output PLAIN TEXT (Markdown) reports. DO NOT output JSON.

TOOLS AVAILABLE: <read_file>, <search>, <list_directory>, <web_search>.`;
              }
              
              previewSystemPrompt = effectiveSystemPrompt;
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

      loopCount++;

      // PRIORITY: If any task awaits review, force Reviewer (ONLY IN AGENTIC MODE)
      if (!isSoloMode && operationMode !== 'analysis' && this.currentTasks.some(t => t.status === 'review_pending') && nextAgent === 'Router') {
          nextAgent = 'Reviewer';
      }

      if (nextAgent === 'FINISH') break;

      if (nextAgent === 'Router') {
        this.emitStatus('Router');
        const routerSystemPrompt = workflow.routerPrompt;

        const taskContext = this.currentTasks.length > 0
          ? `\n### CURRENT PLAN STATUS:\n${this.currentTasks.map(t => `- [${t.status === 'completed' ? 'x' : ' '}] **${t.id}:** ${t.description}`).join('\n')}`
          : "";

        const routerInput = `${currentHistory}${taskContext}\n\n[SYSTEM]: Based on the history above, who should act next? (Analyser, Planner, Coder, QA, Reviewer, or FINISH). Return JSON.`;

        let routerResponse = "";
        try {
          const stream = this.llm.generateCompletionStream(
              routerSystemPrompt, 
              routerInput, 
              formattedContext, 
              signal, 
              (usage) => this.updateStats(usage, 'Router'),
              (phase, details) => this.emitPhase(phase, details)
          );
          for await (const chunk of stream) {
            if (signal.aborted) break;
            routerResponse += chunk;
          }

          if (signal.aborted) break;

          const decision = this.parser.parseJson(routerResponse);
          if (!decision) throw new Error("Invalid Router JSON");

          nextAgent = decision.next_agent;
          const reasoning = decision.reasoning;

          steps.push({ agent: 'Router', input: 'Deciding next step...', output: `Selected: ${nextAgent}`, reasoning });
          this.emitSteps(steps);
          this.commitTurn();

          // --- PAUSE CHECK AFTER ROUTER DECISION ---
          if (this.isPaused && nextAgent !== 'FINISH') {
               const agentDef = this.workflowService.getAgent(nextAgent);
               const previewSystemPrompt = agentDef?.systemPrompt || "";
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
                  
                  currentHistory += verificationPrompt;
                  
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
          console.error("Router Error:", e);
          finalContent += `\n[System Error: Router failed. Stopping.]\n`;
          this.emitContent(finalContent);
          break;
        }
      }

      if (nextAgent !== 'Router' && nextAgent !== 'FINISH') {
        if (signal.aborted) break;

        const agentDef = this.workflowService.getAgent(nextAgent);
        
        if (!agentDef) {
             const errorMsg = `\n[System Error: Agent '${nextAgent}' not found in workflow definition.]\n`;
             finalContent += errorMsg;
             this.emitContent(finalContent);
             break;
        }

        let agentSystemPrompt = agentDef.systemPrompt;
        
        if (operationMode === 'analysis') {
            agentSystemPrompt = `You are an expert Systems Analyst and Reporter. (Analysis Mode instructions...)`;
        }

        let agentOutput = "";

        try {
          const stream = this.llm.generateCompletionStream(
              agentSystemPrompt, 
              currentInput, 
              formattedContext, 
              signal, 
              (usage) => this.updateStats(usage, nextAgent),
              (phase, details) => this.emitPhase(phase, details)
          );

          let turnHeader = "";
          if (finalContent !== "") turnHeader = `\n\n--- Next Step: ${nextAgent} ---\n\n`;
          else turnHeader = `### ${nextAgent} is working...\n\n`;

          finalContent += turnHeader;
          this.emitContent(finalContent);

          let streamBuffer = "";
          
          for await (const chunk of stream) {
            if (signal.aborted) break;
            agentOutput += chunk;

            const loopResult = this.loopHandler.analyze(agentOutput);
            if (loopResult.isLooping) {
               agentOutput = agentOutput.slice(0, loopResult.trimIndex) + "\n\n[SYSTEM INTERVENTION: Loop detected.]";
               this.emitDelta("\n\n⚡ [SYSTEM: Loop detected - Interrupting...]\n");
               break; 
            }

            streamBuffer += chunk;
            this.emitDelta(chunk);

            // --- STREAMING TOOL EXECUTION ---
            const tags = this.parser.parseToolTags(streamBuffer);
            let toolExecuted = false;
            let result = null;
            let targetPath = "";

            if (tags.write) {
                const [fullMatch, path, content] = tags.write;
                this.emitPhase('EXECUTING_TOOL', `Writing file: ${path}`);
                result = await this.tools.executeWrite(path, content, autoApply);
                this.projectWorkingSet.set(path, content);
                targetPath = path;
                streamBuffer = streamBuffer.replace(fullMatch, ""); 
                toolExecuted = true;
            } else if (tags.patch) {
                const [fullMatch, path, patchContent] = tags.patch;
                this.emitPhase('EXECUTING_TOOL', `Patching file: ${path}`);
                result = await this.tools.executePatch(path, patchContent, autoApply);
                if (result) {
                   const fullContent = await this.fileSystem.handleReadFile(path);
                   this.projectWorkingSet.set(path, fullContent);
                }
                targetPath = path;
                streamBuffer = streamBuffer.replace(fullMatch, "");
                toolExecuted = true;
            } else if (tags.replace) {
                const [fullMatch, path, oldStr, newStr] = tags.replace;
                this.emitPhase('EXECUTING_TOOL', `Patching file: ${path}`);
                result = await this.tools.executeReplace(path, oldStr, newStr, autoApply);
                if (result) {
                   const fullContent = await this.fileSystem.handleReadFile(path);
                   this.projectWorkingSet.set(path, fullContent);
                }
                targetPath = path;
                streamBuffer = streamBuffer.replace(fullMatch, "");
                toolExecuted = true;
            } else if (tags.read) {
                const [fullMatch, path] = tags.read;
                this.emitPhase('EXECUTING_TOOL', `Reading file: ${path}`);
                result = await this.tools.executeRead(path);
                if (result) {
                   const fullContent = await this.fileSystem.handleReadFile(path);
                   this.projectWorkingSet.set(path, fullContent);
                }
                streamBuffer = streamBuffer.replace(fullMatch, "");
                toolExecuted = true;
            } else if (tags.execute) {
                const [fullMatch, bgAttr, commandContent] = tags.execute;
                result = await this.tools.executeCommand(commandContent.trim(), autoApply, bgAttr === 'true');
                streamBuffer = streamBuffer.replace(fullMatch, "");
                toolExecuted = true;
            } else if (tags.genImage) {
                const [fullMatch, prompt, ar] = tags.genImage;
                result = await this.tools.executeGenerateImage(prompt, ar);
                streamBuffer = streamBuffer.replace(fullMatch, "");
                toolExecuted = true;
            } else if (tags.resizeImage) {
                const [fullMatch, path, w, h, fmt] = tags.resizeImage;
                result = await this.tools.executeResizeImage(path, parseInt(w), parseInt(h), fmt);
                streamBuffer = streamBuffer.replace(fullMatch, "");
                toolExecuted = true;
            } else if (tags.saveAsset) {
                const [fullMatch, src, dest] = tags.saveAsset;
                result = await this.tools.executeSaveAsset(src, dest);
                streamBuffer = streamBuffer.replace(fullMatch, "");
                toolExecuted = true;
            }

            if (toolExecuted && result) {
                // Associate with current task if one is in_progress
                if (targetPath) {
                    const activeTask = this.currentTasks.find(t => t.status === 'in_progress');
                    if (activeTask) {
                        activeTask.lastModifiedFiles = activeTask.lastModifiedFiles || [];
                        if (!activeTask.lastModifiedFiles.includes(targetPath)) {
                            activeTask.lastModifiedFiles.push(targetPath);
                        }
                    }
                }

                const toolMsg = `\n\n[System Tool Output]:\n${result.userOutput}`;
                finalContent += toolMsg;
                this.emitDelta(toolMsg);
                currentHistory += `\n\n### ${nextAgent} Tool Execution:\n${result.llmOutput}`;
            }
          }

          finalContent += agentOutput;
          if (signal.aborted) break;
          
          // --- TASK STATUS PARSING (LEGACY + JSON UPDATES) ---
          const markers = this.parser.parseTaskMarkers(agentOutput);
          const structuredData = this.parser.parseJson(agentOutput);
          const taskUpdates: { id: string, status: ITask['status'] }[] = [];

          // 1. Prioritize Structured JSON Updates
          if (structuredData?.updates && Array.isArray(structuredData.updates)) {
              structuredData.updates.forEach((u: any) => {
                  if (u.id && u.status) taskUpdates.push({ id: u.id, status: u.status });
              });
          }

          // 2. Fallback to Legacy Text Markers
          if (markers.completed) {
              markers.completed.forEach(tag => {
                  this.parser.extractIdsFromTag(tag).forEach(id => taskUpdates.push({ id, status: 'completed' }));
              });
          }
          if (markers.verified) {
              markers.verified.forEach(tag => {
                  this.parser.extractIdsFromTag(tag).forEach(id => taskUpdates.push({ id, status: 'completed' }));
              });
          }

          // 3. Apply Updates with Normalized ID Matching
          if (taskUpdates.length > 0) {
              taskUpdates.forEach(update => {
                  const normalizedTargetId = this.parser.normalizeId(update.id);
                  const task = this.currentTasks.find(t => this.parser.normalizeId(t.id) === normalizedTargetId);
                  
                  if (task && task.status !== update.status) {
                      // Status logic
                      if (update.status === 'completed' && !autoMarkTasks) {
                          task.status = 'review_pending';
                      } else {
                          task.status = update.status;
                      }

                      const msg = `\n\n[System: Task ${task.id} set to ${task.status.toUpperCase()}]`;
                      finalContent += msg;
                      this.emitDelta(msg);
                  }
              });
              this.emitPlan();
          }

          if (nextAgent === 'Planner') {
            this.updateChecklist(this.parser.parseChecklist(agentOutput));
          }

          await this.handleAutoVerification(agentOutput);

          if (isSoloMode && agentOutput.includes('[FINISH]')) {
              nextAgent = 'FINISH';
          } else {
             nextAgent = isSoloMode ? 'Solo' : 'Router';
          }

          currentHistory += `\n\n### ${isSoloMode ? 'Solo' : nextAgent} Output:\n${agentOutput}`;
          currentInput = currentHistory;

          steps.push({ agent: isSoloMode ? 'Solo' : nextAgent, input: '...', output: agentOutput });
          this.emitSteps(steps);
          this.commitTurn();
          
          if (nextAgent === 'FINISH') break;

        } catch (err: any) {
          if (err.message === 'Aborted by user') break;
          console.error(`Error in ${nextAgent}:`, err);
          this.emitDelta(`\n[Error executing ${nextAgent}: ${err.message}]\n`);
          break;
        }
      }
    }
    this.abortController = null;
    return { content: finalContent, steps: [] };
  }

  private async handleAutoVerification(text: string) {
      const data = this.parser.parseJson(text);
      if (data?.verification_needed && Array.isArray(data.verification_needed)) {
          const filesToRead = data.verification_needed.filter((f: any) => typeof f === 'string' && f.includes('.'));
          if (filesToRead.length > 0) {
              this.emitDelta(`\n\n[System: Auto-loading ${filesToRead.length} files...]\n`);
              for (const file of filesToRead) {
                    const result = await this.tools.executeRead(file);
                    if (result) {
                        const content = await this.fileSystem.handleReadFile(file);
                        this.projectWorkingSet.set(file, content);
                    }
              }
          }
      }
  }

  private updateChecklist(newTasks: ITask[]) {
    if (newTasks.length > 0) {
      if (this.currentTasks.length > 0) {
          this.currentTasks = newTasks.map(newTask => {
              const existing = this.currentTasks.find(t => t.id === newTask.id || (t.description === newTask.description));
              return existing ? { ...newTask, status: existing.status } : newTask;
          });
      } else {
          this.currentTasks = newTasks;
      }
      this.emitPlan();
    }
  }
}
