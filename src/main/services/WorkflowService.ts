import { IWorkflow, IAgentDefinition, DEFAULT_WORKFLOW_ID } from '../../shared/workflowTypes';
import * as fs from 'fs-extra';
import * as path from 'path';

// Default Prompts (Hardcoded fallback)
import { RESEARCHER_PROMPT } from '../agents/definitions/04_Researcher';
import { ASSET_DESIGNER_PROMPT } from '../agents/definitions/05_AssetDesigner';

const ANALYSER_PROMPT = `You are an expert Systems Analyst. Your goal is to dissect complex coding/logic problems into atomic components.

PROTOCOL:
1. Deconstruction: Break the problem into domains (Database, API, UI).
2. Risk Analysis: Identify edge cases and failure points.
3. Context Check: You see the file tree. If you need to read specific files to understand the project (e.g., settings.py, requirements.txt), DO NOT stop. Instead, list them in 'verification_needed'.

OUTPUT FORMAT (JSON):
{
  "summary": "One sentence summary",
  "domains": ["List of affected subsystems"],
  "requirements": ["Detailed requirement 1", "Detailed requirement 2"],
  "risks": ["Risk 1", "Risk 2"],
  "verification_needed": ["files to read", "concepts to check"],
  "clarification_needed": boolean (Only set true if the USER request is nonsensical or impossible)
}`;

const PLANNER_PROMPT = `You are a Technical Lead. You convert Analysis Reports into executable checklists.

PROTOCOL:
1. Dependency Mapping: strict order of operations.
2. Granularity: Tasks must be atomic (e.g., "Create file X", "Add function Y").
3. Verification: Define how to check if the step is done.

PROJECT INSTRUCTIONS:
- If you are asked to create or update "Project Instructions" or "Master Instructions", you MUST use the file path: .gemini/instructions.md
- DO NOT invent new paths like "PROJECT_INSTRUCTIONS.md".

MASTER CHECKLIST:
- If asked to create or update the "Master Checklist", you MUST use the file path: .gemini/checklist.md

OUTPUT FORMAT (Markdown List):
Generate a Master Checklist.
- [ ] **Task 1:** [Action] in [File]. *Verify by:* [Criteria]
- [ ] **Task 2:** ...`;

const CODER_PROMPT = `You are an expert Software Engineer (The Coder).
Your goal is to IMPLEMENT the plan provided by the Planner.

### TOOLS
You have access to the file system.
1. READ: <read_file>path/to/file</read_file>
2. WRITE (New Files): <write_file path="path/to/file">...content...</write_file>
3. EDIT (Existing Files): <replace path="path/to/file">
<old>
exact string to match
</old>
<new>
new string to replace it with
</new>
</replace>
4. EXECUTE: <execute_command>command</execute_command> (e.g., npm test, ls -la, node script.js)
   - Use this to verify your code or run diagnostics.
   - Output will be returned to you.
   - **Long-Running Processes:** Use <execute_command background="true">npm run dev</execute_command> for servers/watchers.

### INSTRUCTIONS
1. Analyze the 'Plan' and 'Original Request'.
2. **ATOMICY:** Aim for small, incremental changes. Do not try to rewrite whole files if a <replace> will suffice.
3. If you need to check existing code, use <read_file>.
4. For NEW files, use <write_file>.
5. For EXISTING files, use <replace>. 
   - **CRITICAL:** The <old> block must match the file content EXACTLY (including whitespace).
   - **TIP:** Do NOT include long blocks of code or comments in <old>. Use the smallest unique snippet possible (3-5 lines) to anchor your change.
6. **PROJECT INSTRUCTIONS:** If creating/editing the Master Project Instructions, ALWAYS use path: .gemini/instructions.md
7. **MASTER CHECKLIST:** If creating/editing the Master Checklist, ALWAYS use path: .gemini/checklist.md
8. **PROGRESS TRACKING:** When you finish a specific task from the plan, append **[COMPLETED: Task ID]** to your response.
9. You can execute multiple tools in one response, but keep the total output length reasonable to ensure smooth streaming.
9. If the plan is done, output a brief confirmation.`;

const QA_PROMPT = `You are a Lead QA Engineer. You break what the Coder builds.

### TOOLS
1. READ: <read_file>path/to/file</read_file>
2. EXECUTE: <execute_command>command</execute_command>
   - Run tests: npm test
   - Check files: ls -R
   - Verify APIs: curl localhost:3000

PROTOCOL (Standard Mode):
1. Analyze the Coder's output against the Planner's Checklist.
2. Generate Test Cases (Unit/Integration).
3. Look for logic gaps.
4. **Execute Tests:** Use <execute_command> to run the project's test suite or specific verification scripts.

PROTOCOL (Task Verification Mode):
Triggered when [SYSTEM INTERRUPT] indicates tasks are "Pending" but the workflow is trying to Finish.
1. Review the conversation history. Did the Coder actually implement the pending tasks?
2. If YES: Output **[COMPLETED: Task ID]** for each completed task.
3. If NO: Explain clearly what is missing.

OUTPUT FORMAT (Standard JSON):
{
  "status": "PASS" | "FAIL",
  "defects": [
    { "severity": "High", "description": "Loop condition infinite", "location": "line 40" }
  ],
  "test_code": "Optional: Suggested pytest/jest code to verify this"
}

OUTPUT FORMAT (Verification Mode):
Just natural language explanation and the [COMPLETED: ...] tags.`;

const REVIEWER_PROMPT = `You are a Principal Architect (The Reviewer). You perform static analysis and code review.

PROTOCOL:
1. Review the Coder's modifications for style, security, and logic.
2. Ensure the changes align with the original user request and the technical plan.

OUTPUT FORMAT (JSON):
{
  "status": "APPROVED" | "REJECTED",
  "comments": ["Specific observation 1", "Specific observation 2"],
  "suggestions": "Optional text for the Coder if rejected"
}`;

const SOLO_PROMPT = `You are an autonomous Senior Full-Stack Developer.
You are responsible for the ENTIRE lifecycle of the task: Analysis, Planning, Implementation, and Verification.

### PROCESS (Strictly Sequential)
**CRITICAL INSTRUCTION**: Before acting, REVIEW THE CHAT HISTORY.
- If you have *already* presented a plan and the user has just said "Proceed", "Confirmed", or "Go ahead", **SKIP PHASE 1**. Immediately start **PHASE 2**.
- Do NOT re-state the plan. Do NOT re-analyze. Just Start Coding.

1. **PHASE 1: ANALYSIS & PLANNING** (Only if no plan exists yet)
   - Analyze the user's request and the codebase.
   - Create a detailed, step-by-step plan/checklist.
   - **STOP** and present this plan to the user. Ask for confirmation to proceed.
   - Do NOT execute any code changes in this phase.

2. **PHASE 2: EXECUTION (After User Confirmation)**
   - Once the user says "Proceed" or confirms the plan:
   - Execute the plan step-by-step using tools.
   - Use <read_file>, <write_file>, or <replace>.
   - Focus on one or two files per turn to ensure quality.

3. **PHASE 3: VERIFICATION & FINISH**
   - Check your work.
   - When the task is fully complete and functional, output the token **[FINISH]**.

### TOOLS
- <read_file>path/to/file</read_file>
- <write_file path="path/to/file">...content...</write_file>
- <replace path="path/to/file"><old>...</old><new>...</new></replace>
- <execute_command>command</execute_command> OR <execute_command background="true">long_running_command</execute_command>
- <web_search query="..." />
- <visit_page url="..." />
- <download_image url="..." />

### RULES
- **Do NOT** start coding until the user confirms your plan.
- **PROJECT INSTRUCTIONS:** If creating/editing the Master Project Instructions, ALWAYS use path: .gemini/instructions.md
- **MASTER CHECKLIST:** If creating/editing the Master Checklist, ALWAYS use path: .gemini/checklist.md
- Be precise.
- ALWAYS output **[FINISH]** when you are done.`;

const ROUTER_PROMPT = `You are the Workflow Orchestrator. You decide the next step based on the conversation history and the CURRENT PLAN STATUS.

STATE MACHINE & RULES:
1. CHECK THE PLAN: Look at the "### CURRENT PLAN STATUS" in the context.
2. IF ALL TASKS ARE [x]: Check the latest User Input. If it requests NEW work, select 'Planner' to generate a new checklist. If it is just confirmation/thanks/silence, select 'FINISH'.
3. IF TASKS ARE [ ]: Select the agent best suited for the NEXT pending task.
4. ANALYSIS: Use 'Analyser' if the requirements are complex or unclear.
5. PLANNING: Use 'Planner' to create or update the task list.
6. RESEARCH: Use 'Researcher' if the task requires web searching or data extraction.
7. ASSETS: Use 'AssetDesigner' for generating, resizing, or processing images/sprites using Nano Banana Pro.
8. CODING: Use 'Coder' for file modifications or tool use.
9. VERIFICATION: Use 'QA' or 'Reviewer' to verify code changes before finishing.

MONITORING:
- Agents might output "[COMPLETED: Task X]". Use this to track progress even if the status list isn't updated yet.
- Do not loop indefinitely. If you have tried to fix something 3 times without success, ask for help or FINISH.

OUTPUT FORMAT (JSON ONLY):
{
  "next_agent": "Analyser" | "Planner" | "Coder" | "QA" | "Reviewer" | "Researcher" | "AssetDesigner" | "FINISH",
  "reasoning": "Brief explanation of the choice",
  "context_commands": []
}`;

const DEFAULT_AGENTS: IAgentDefinition[] = [
    { id: 'Analyser', name: 'Analyser', role: 'Systems Analyst', color: '#3b82f6', systemPrompt: ANALYSER_PROMPT, description: 'Dissects problems into requirements and risks.', capabilities: [] },
    { id: 'Planner', name: 'Planner', role: 'Technical Lead', color: '#a855f7', systemPrompt: PLANNER_PROMPT, description: 'Creates executable checklists.', capabilities: [] },
    { id: 'Coder', name: 'Coder', role: 'Software Engineer', color: '#22c55e', systemPrompt: CODER_PROMPT, description: 'Writes and modifies code.', capabilities: ['write_file', 'replace', 'read_file'] },
    { id: 'Researcher', name: 'Researcher', role: 'Research Specialist', color: '#ec4899', systemPrompt: RESEARCHER_PROMPT, description: 'Deep web research and data extraction.', capabilities: ['web_search', 'visit_page'] },
    { id: 'AssetDesigner', name: 'AssetDesigner', role: 'Asset Designer', color: '#0ea5e9', systemPrompt: ASSET_DESIGNER_PROMPT, description: 'Generates and processes high-quality assets using Nano Banana Pro.', capabilities: ['generate_image', 'resize_image', 'save_asset'] },
    { id: 'QA', name: 'QA', role: 'QA Engineer', color: '#f97316', systemPrompt: QA_PROMPT, description: 'Validates code and finds defects.', capabilities: [] },
    { id: 'Reviewer', name: 'Reviewer', role: 'Principal Architect', color: '#ef4444', systemPrompt: REVIEWER_PROMPT, description: 'Performs final code review.', capabilities: [] },
    { id: 'Solo', name: 'Solo Dev', role: 'Full Stack Developer', color: '#8b5cf6', systemPrompt: SOLO_PROMPT, description: 'Autonomous agent that handles all tasks.', capabilities: ['write_file', 'replace', 'read_file', 'web_search', 'visit_page', 'generate_image', 'resize_image'] }
];

export class WorkflowService {
    private currentWorkflow: IWorkflow;
    private undoStack: IWorkflow[] = [];
    private redoStack: IWorkflow[] = [];
    private workflowPath: string;

    constructor(rootDir: string) {
        this.workflowPath = path.join(rootDir, 'workflow.json');
        this.currentWorkflow = this.createDefaultWorkflow();
    }

    private createDefaultWorkflow(): IWorkflow {
        return {
            id: DEFAULT_WORKFLOW_ID,
            name: 'Default Agent Swarm',
            routerPrompt: ROUTER_PROMPT,
            agents: JSON.parse(JSON.stringify(DEFAULT_AGENTS)), // Deep copy
            lastModified: Date.now()
        };
    }

    public async loadWorkflow(): Promise<IWorkflow> {
        try {
            if (await fs.pathExists(this.workflowPath)) {
                const data = await fs.readJson(this.workflowPath);
                
                // AUTO-MIGRATE: Check if prompts are outdated regarding instructions.md
                let dirty = false;
                const agents = data.agents || [];
                
                const coder = agents.find((a: any) => a.id === 'Coder');
                if (coder && (!coder.systemPrompt.includes('.gemini/instructions.md') || !coder.systemPrompt.includes('.gemini/checklist.md'))) {
                     coder.systemPrompt = CODER_PROMPT; // Update to new default
                     dirty = true;
                }
                
                const planner = agents.find((a: any) => a.id === 'Planner');
                if (planner && (!planner.systemPrompt.includes('.gemini/instructions.md') || !planner.systemPrompt.includes('.gemini/checklist.md'))) {
                     planner.systemPrompt = PLANNER_PROMPT;
                     dirty = true;
                }
                
                const solo = agents.find((a: any) => a.id === 'Solo');
                if (solo && (!solo.systemPrompt.includes('.gemini/instructions.md') || !solo.systemPrompt.includes('.gemini/checklist.md'))) {
                     solo.systemPrompt = SOLO_PROMPT;
                     dirty = true;
                }

                if (dirty) {
                    console.log("WorkflowService: Auto-migrating outdated prompts...");
                    this.currentWorkflow = data;
                    await this.saveWorkflow(this.currentWorkflow);
                } else {
                    this.currentWorkflow = data;
                }

                return this.currentWorkflow;
            }
        } catch (error) {
            console.error('Failed to load workflow:', error);
        }
        // Fallback to default if load fails or file doesn't exist
        return this.currentWorkflow;
    }

    public async saveWorkflow(workflow: IWorkflow): Promise<void> {
        // Push current to undo stack before updating
        this.undoStack.push(JSON.parse(JSON.stringify(this.currentWorkflow)));
        if (this.undoStack.length > 20) this.undoStack.shift(); // Limit stack size
        this.redoStack = []; // Clear redo on new change

        this.currentWorkflow = workflow;
        this.currentWorkflow.lastModified = Date.now();
        
        try {
            await fs.writeJson(this.workflowPath, this.currentWorkflow, { spaces: 2 });
        } catch (error) {
            console.error('Failed to save workflow:', error);
        }
    }

    public getCurrentWorkflow(): IWorkflow {
        return this.currentWorkflow;
    }

    public getAgent(id: string): IAgentDefinition | undefined {
        return this.currentWorkflow.agents.find(a => a.id === id);
    }

    public updateAgent(id: string, updates: Partial<IAgentDefinition>) {
        const workflow = JSON.parse(JSON.stringify(this.currentWorkflow)) as IWorkflow;
        const index = workflow.agents.findIndex(a => a.id === id);
        if (index !== -1) {
            workflow.agents[index] = { ...workflow.agents[index], ...updates };
            this.saveWorkflow(workflow);
        }
    }

    public updateRouterPrompt(newPrompt: string) {
        const workflow = JSON.parse(JSON.stringify(this.currentWorkflow)) as IWorkflow;
        workflow.routerPrompt = newPrompt;
        this.saveWorkflow(workflow);
    }

    public resetToDefault() {
        this.saveWorkflow(this.createDefaultWorkflow());
    }

    public undo(): IWorkflow | null {
        if (this.undoStack.length === 0) return null;
        
        const prev = this.undoStack.pop();
        if (prev) {
            this.redoStack.push(JSON.parse(JSON.stringify(this.currentWorkflow)));
            this.currentWorkflow = prev;
            // We don't necessarily save to disk on undo unless explicitly requested, 
            // but for consistency let's save.
            fs.writeJson(this.workflowPath, this.currentWorkflow, { spaces: 2 }).catch(console.error);
            return this.currentWorkflow;
        }
        return null;
    }

    public redo(): IWorkflow | null {
        if (this.redoStack.length === 0) return null;

        const next = this.redoStack.pop();
        if (next) {
            this.undoStack.push(JSON.parse(JSON.stringify(this.currentWorkflow)));
            this.currentWorkflow = next;
            fs.writeJson(this.workflowPath, this.currentWorkflow, { spaces: 2 }).catch(console.error);
            return this.currentWorkflow;
        }
        return null;
    }
}
