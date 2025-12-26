import { create } from 'zustand';
import { AgentPhase } from '../../shared/types';

interface ExecutionState {
  status: 'IDLE' | 'RUNNING' | 'PAUSED';
  pausedContext: any | null; 
  activeAgent: string | null;
  agentPhase: AgentPhase;
  phaseDetails: string;

  setStatus: (status: 'IDLE' | 'RUNNING' | 'PAUSED') => void;
  setPausedContext: (context: any) => void;
  setActiveAgent: (agent: string | null) => void;
  setAgentPhase: (phase: AgentPhase, details?: string) => void;
}

export const useExecutionStore = create<ExecutionState>((set) => ({
  status: 'IDLE',
  pausedContext: null,
  activeAgent: null,
  agentPhase: 'IDLE',
  phaseDetails: '',

  setStatus: (status) => set({ status }),
  setPausedContext: (context) => set({ pausedContext: context }),
  setActiveAgent: (agent) => set({ activeAgent: agent }),
  setAgentPhase: (phase, details = '') => set({ agentPhase: phase, phaseDetails: details }),
}));
