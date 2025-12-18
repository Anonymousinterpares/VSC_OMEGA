# Project Design Document: AI-Integrated IDE ("The Hive")

**Version:** 1.0
**Status:** Architecture & Design Phase
**Author:** System Architect

---

## 1. Executive Summary
"The Hive" is a specialized Integrated Development Environment (IDE) built to function as a collaborative workspace for a human developer and a team of Autonomous AI Agents. Unlike standard IDEs with a chat sidebar, The Hive treats the AI agents as active collaborators with distinct roles (Analyst, Planner, Coder, QA), governed by a strict orchestration protocol. The core differentiator is its **Smart Context Management System**, allowing surgical control over what data the LLM sees (down to specific code fragments) and a transparent, editable context memory.

---

## 2. Core Philosophy & Goals
*   **Agentic Workflow:** Moving from "Chatbot" to "Employee." Agents do not just answer; they execute workflows.
*   **Surgical Context:** Users must never be forced to send entire files when only a function is relevant. Manual fragmentation is a first-class citizen.
*   **Transparency:** No "Black Box" logic. The User can see, edit, and rollback the prompt context and file changes at any step.
*   **Modularity:** The system is decoupled. One agent can be swapped, upgraded, or re-prompted without breaking the engine.
*   **Scalability Readiness:** While currently for personal use, the architecture separates the UI (Renderer) from the Logic (Main), facilitating future cloud or multi-user deployment.

---

## 3. Technology Stack

### Core Framework
*   **Runtime:** **Electron** (Cross-platform desktop application wrapper).
    *   *Reasoning:* Native access to Node.js filesystem APIs + Chrome rendering engine for the UI.
*   **Language:** **TypeScript** (Strict typing is essential for the complex JSON objects passed between agents).

### Frontend (Renderer Process)
*   **UI Library:** **React.js**.
*   **State Management:** **Zustand** (Lightweight, efficient for managing the "Rolling Context" state).
*   **Editor Component:** **Monaco Editor** (The core of VS Code).
    *   *Critical:* Must implement the `ITextModel` interface to handle line numbers and fragment extraction.
*   **Styling:** **Tailwind CSS** (Utility-first for rapid UI iteration).

### Backend (Main Process)
*   **Orchestration:** Node.js custom event loop.
*   **Search Engine:** `ripgrep` (via `vscode-ripgrep` binary) for blazing fast lexical search; simple Vector store (e.g., `LangChain` + local embeddings) for semantic search.
*   **LLM Integration:** OpenAI SDK / Anthropic SDK (Genericized into a Provider Interface).
*   **Persistence:** `lowdb` (JSON based) for local settings and agent history; File System for code.

---

## 4. Functional Specifications

### A. The GUI Layout
1.  **Left Panel (Explorer & Context):**
    *   **File Tree:** Standard directory view. Context menu options: "Add File to Context," "Exclude from Context."
    *   **Context Manager:** A visible list of currently active context items (Files, Fragments, Instructions). Items have an "X" to remove.
    *   **Search/Filter:** Buttons to filter file tree or search codebase.
2.  **Central Panel (Editor):**
    *   **Monaco Instance:** Full syntax highlighting.
    *   **Fragment Selection:** Highlighting text spawns a floating tooltip: "Add Fragment to Context."
    *   **Diff View:** When an Agent proposes code, the editor splits to show Current vs. Proposed.
3.  **Right/Bottom Panel (The Agent Loop):**
    *   **Chat Interface:** Bubbles with icons indicating which Agent is speaking.
    *   **Controls:** Input box, "Send," "Stop Generating," "Retry," "Copy Content."
    *   **Context Inspector:** A button `[Memory]` that opens a modal showing the exact JSON payload being sent to the LLM.

### B. Smart Context Management (The Engine)
*   **Fragment Metadata:** When a fragment is added, the system stores:
    ```typescript
    interface ContextFragment {
      id: string;
      filePath: string;
      startLine: number;
      endLine: number;
      content: string; // Captured at moment of selection
      type: 'fragment';
    }
    ```
*   **Rolling Context:** A sliding window of messages. The User can click "Edit Context" to manually delete old user/assistant pairs or inject new instructions mid-stream.
*   **Deduplication:** If `file.js` is added, and later `file.js` (lines 10-20) is added, the system warns or merges based on user preference settings.

### C. File & Version Control
*   **Shadow History:** Before an Agent writes to `main.py`, the system copies `main.py` to `.hive/history/main.py.{timestamp}`.
*   **Reversion:** The UI allows "Undo Last Agent Action" which restores the file from Shadow History.

### D. API Key Management
*   **Priority 1:** Look for `.env` in the project root.
*   **Priority 2:** Look for App Settings (Encrypted local storage).
*   **UI:** A "Settings" tab allows users to paste keys for OpenAI/Anthropic/DeepSeek. These are saved locally, not in the project repo.

---

## 5. Proposed Modular File Structure

```text
root/
├── .env                  # Local secrets (not committed)
├── package.json
├── electron-builder.yml
├── src/
│   ├── shared/           # Types shared between Front/Back
│   │   ├── types.ts      # IContext, IAgentMessage, IFileFragment
│   │   ├── constants.ts  # Channel names for IPC
│   ├── main/             # Backend (Node.js)
│   │   ├── main.ts       # Entry point
│   │   ├── services/
│   │   │   ├── LLMService.ts       # Provider agnostic caller
│   │   │   ├── FileSystem.ts       # Read/Write/ShadowHistory
│   │   │   ├── SearchEngine.ts     # Ripgrep implementation
│   │   │   ├── ContextEngine.ts    # Merging fragments, pruning tokens
│   │   ├── agents/
│   │   │   ├── AgentOrchestrator.ts # Logic to route messages
│   │   │   ├── definitions/         # The System Prompts
│   │   │   │   ├── 01_Analyser.ts
│   │   │   │   ├── 02_Planner.ts
│   │   │   │   ├── 03_Coder.ts
│   │   │   │   ├── 04_QA.ts
│   │   │   │   ├── 05_Reviewer.ts
│   │   │   │   ├── 06_Documenter.ts
│   │   │   │   └── 07_Router.ts
│   ├── renderer/         # Frontend (React)
│   │   ├── App.tsx
│   │   ├── store/
│   │   │   ├── useContextStore.ts  # Zustand store for selected fragments
│   │   │   ├── useSettingsStore.ts
│   │   ├── components/
│   │   │   ├── Editor/
│   │   │   │   ├── MonacoWrapper.tsx
│   │   │   ├── Sidebar/
│   │   │   │   ├── FileTree.tsx
│   │   │   │   ├── ContextList.tsx
│   │   │   ├── Chat/
│   │   │   │   ├── ChatWindow.tsx
│   │   │   │   ├── AgentBubble.tsx
│   │   │   ├── Modals/
│   │   │   │   ├── ContextInspector.tsx
```

---

## 6. Detailed System Prompts (Refined)

These prompts are designed to be loaded from `src/main/agents/definitions/`. They include the **Critical Instructions** for tool use and context handling.

### Global Preamble (Prepend to all Agents)
> **SYSTEM INSTRUCTION:** You are part of an automated development chain.
> **CONTEXT AWARENESS:** You have access to a specific context provided in the message. Do not hallucinate files not listed in the context.
> **TOOL USAGE:** If you need to perform an action, use the XML tags defined in your role. Do not describe the action, perform it.

---

### 1. The Analyser (The Brain)
**Role:** Senior Systems Analyst
**System Prompt:**
```text
You are an expert Systems Analyst. Your goal is to dissect complex coding/logic problems into atomic components. You do not write code.

PROTOCOL:
1. Deconstruction: Break the problem into domains (Database, API, UI).
2. Risk Analysis: Identify edge cases and failure points.
3. Feasibility: Can this be done with the current context? If not, list missing info.

OUTPUT FORMAT (JSON):
{
  "summary": "One sentence summary",
  "domains": ["List of affected subsystems"],
  "requirements": ["Detailed requirement 1", "Detailed requirement 2"],
  "risks": ["Risk 1", "Risk 2"],
  "clarification_needed": boolean (true if user input is vague)
}
```

### 2. The Planner (The Architect)
**Role:** Technical Project Manager
**System Prompt:**
```text
You are a Technical Lead. You convert Analysis Reports into executable checklists.

PROTOCOL:
1. Dependency Mapping: strict order of operations.
2. Granularity: Tasks must be atomic (e.g., "Create file X", "Add function Y").
3. Verification: Define how to check if the step is done.

OUTPUT FORMAT (Markdown List):
Generate a Master Checklist.
- [ ] **Task 1:** [Action] in [File]. *Verify by:* [Criteria]
- [ ] **Task 2:** ...
```

### 3. The Coding Agent (The Builder)
**Role:** Senior Software Engineer
**System Prompt:**
```text
You are a Senior Software Engineer. You write production-grade code based on the Checklist.

TOOLS AVAILABLE:
1. <read_file>path/to/file</read_file>
2. <search query="search_term" type="file|content|symbol" />
3. <write_file path="path/to/file">...code...</write_file>
4. <write_fragment file="path/to/file" target_line="15">...code...</write_fragment>

SEARCH PROTOCOL:
- If you need to find where a function is defined, use <search>.
- If you need to read a file to understand context, use <read_file>.

CODING STANDARDS:
- Modular, DRY, Documented.
- No "TODOs".
- If editing a file, return the FULL file content unless using <write_fragment> for small insertions.

OUTPUT:
Interact via Tools. Do not write conversational filler.
```

### 4. The QA/Testing Agent (The Gatekeeper)
**Role:** Lead QA Engineer
**System Prompt:**
```text
You are a Lead QA Engineer. You break what the Coder builds.

PROTOCOL:
1. Analyze the Coder's output against the Planner's Checklist.
2. Generate Test Cases (Unit/Integration).
3. Look for logic gaps.

OUTPUT FORMAT (JSON):
{
  "status": "PASS" | "FAIL",
  "defects": [
    { "severity": "High", "description": "Loop condition infinite", "location": "line 40" }
  ],
  "test_code": "Optional: Suggested pytest/jest code to verify this"
}
```

### 5. The Context/Router Agent (The Orchestrator)
**Role:** Workflow Manager
**System Prompt:**
```text
You are the Workflow Orchestrator. You decide the next step.

STATE MACHINE:
1. User Input -> Route to Analyser OR Coder (if trivial).
2. Analysis Done -> Route to Planner.
3. Plan Done -> Route to Coder (Item 1).
4. Code Done -> Route to Reviewer/QA.
5. Error -> Route to Coder (with error context).

CONTEXT MANAGEMENT COMMANDS:
- If a file is mentioned but not loaded, output: {"action": "load_file", "path": "..."}
- If context is full/irrelevant, output: {"action": "prune_context", "reason": "..."}

OUTPUT FORMAT (JSON):
{
  "next_agent": "AGENT_NAME",
  "reasoning": "Why we are going there",
  "context_commands": []
}
```

### 6. The Code Reviewer (The Critic)
**Role:** Principal Architect
**System Prompt:**
```text
You are a Principal Architect. You perform static analysis on the Coder's work.

CHECKLIST:
- Style compliance (PEP8/ESLint standards).
- Security vulnerabilities.
- Readability.

OUTPUT:
- If perfect: "APPROVE"
- If flaws found: Return list of specific changes required.
```

### 7. The Documenting Agent (The Scribe)
**Role:** Technical Writer
**System Prompt:**
```text
You are a Technical Writer. You maintain the "Truth Source".

PROTOCOL:
1. When a new folder/module is created, generate a README.md.
2. If code changes, update existing documentation.
3. Keep descriptions high-level (Architecture/Usage), not line-by-line.

OUTPUT:
Use <write_file> to create/update Markdown files.
```

---

## 7. Implementation Details & Considerations

### A. Context Construction Logic (Backend)
When the Router decides to send a message to an Agent, the `ContextEngine` builds the prompt string dynamically:
1.  **System Prompt:** Loads text from `agents/definitions/`.
2.  **Variable Injection:** Replaces placeholders.
3.  **Active Context Layer:**
    *   Iterates through `ActiveContext` array.
    *   If item is `File`: Reads latest disk content -> formats as `### FILE: path/to/file \n [content]`.
    *   If item is `Fragment`: Formats as `### FRAGMENT: path/to/file (Lines 10-20) \n [content]`.
4.  **Chat History:** Appends the sliding window of conversation.

### B. The "Smart Search" Implementation
To fulfill the requirement of effective search:
1.  **Index Phase:** On project load, `ripgrep` scans filenames.
2.  **Tool Execution:** When Agent requests `<search query="Auth" type="symbol" />`:
    *   System runs `grep` or uses a Tree-sitter query to find function definitions matching "Auth".
    *   Returns a list of matches: `Found in auth.ts (Line 50), login.tsx (Line 12)`.
    *   Agent then decides to `<read_file>` specific results.

### C. Frontend "Editing Mode" for Context
*   **The Problem:** Rolling context gets messy.
*   **The Solution:** The "Context Inspector" Modal.
    *   Displays the chat history as editable text areas.
    *   User can delete a specific "Assistant Response" that was hallucinated, so it doesn't poison future prompts.
    *   User can edit the "User Message" to clarify a past instruction.
    *   Upon "Save," the Zustand store updates, and the next API call uses this sanitized history.

### D. Success Criteria
1.  **Accuracy:** The Coder Agent modifies the correct file and line numbers 95% of the time using the Anchor/Search method.
2.  **State Recovery:** If the App crashes, it reloads the chat history and active context from `lowdb` seamlessly.
3.  **Modularity:** Adding a new Agent (e.g., "Security Auditor") requires only adding a file to `definitions/` and one line in `AgentOrchestrator.ts`.
4.  **Responsiveness:** UI never freezes while LLM is generating (handled by Async/IPC architecture).

This document serves as the Master Plan. You can now proceed to scaffolding the folders and initializing the Electron app.