import { create } from 'zustand';

interface ExecutionState {
  status: 'IDLE' | 'RUNNING' | 'PAUSED';
  pausedContext: any | null; // { agent, systemPrompt, userHistory, fileContext }
  activeAgent: string | null; // Current agent running or about to run

  setStatus: (status: 'IDLE' | 'RUNNING' | 'PAUSED') => void;
  setPausedContext: (context: any) => void;
  setActiveAgent: (agent: string | null) => void;
}

export const useExecutionStore = create<ExecutionState>((set) => ({
  status: 'IDLE',
  pausedContext: null,
  activeAgent: null,

  setStatus: (status) => set({ status }),
  setPausedContext: (context) => set({ pausedContext: context }),
  setActiveAgent: (agent) => set({ activeAgent: agent }),
}));
