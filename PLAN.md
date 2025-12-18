  Plan for "The Hive" IDE

   * Type: Desktop Application (Electron)
   * Core Purpose: A collaborative IDE where specialized AI agents (Analyst, Planner, Coder, QA) work alongside the
     developer, featuring a "Smart Context" system to manage LLM inputs.
   * Tech Stack:
       * Runtime: Electron (TypeScript)
       * Frontend: React + Vite, Zustand (State), Monaco Editor, Tailwind CSS.
       * Backend: Node.js (Main Process), Lowdb (Persistence), Ripgrep (Search).

  Development Phases:

   1. Project Initialization: Setup package.json, install all dependencies (Electron, React, TypeScript, Vite, Tailwind,
      Monaco Editor), and configure the build system.
   2. Architectural Scaffolding: Create the file structure exactly as defined in the design doc (src/main, src/renderer,
      src/shared, agents/definitions).
   3. Main Process (Backend): Implement the Electron entry point, AgentOrchestrator stubs, and load the System Prompts
      from the design.
   4. Renderer (Frontend): Build the 3-panel UI:
       * Left: File Explorer & Context Manager.
       * Center: Monaco Editor instance.
       * Right: Chat Interface with Agent Bubbles.
   5. Integration: Connect the Frontend to the Backend via Electron IPC (Inter-Process Communication) to verify the
      "Agent Loop" logic.