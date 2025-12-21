import { create } from 'zustand';
import { IWorkflow, IAgentDefinition } from '../../shared/workflowTypes';

interface WorkflowState {
  workflow: IWorkflow | null;
  isLoading: boolean;
  selectedAgentId: string | null; // 'Router' or Agent ID
  
  fetchWorkflow: () => Promise<void>;
  saveWorkflow: (workflow: IWorkflow) => Promise<void>;
  resetWorkflow: () => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  selectAgent: (id: string | null) => void;
  updateLocalAgent: (id: string, updates: Partial<IAgentDefinition>) => void;
  updateRouterPrompt: (prompt: string) => void;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflow: null,
  isLoading: false,
  selectedAgentId: null,

  fetchWorkflow: async () => {
    set({ isLoading: true });
    const workflow = await window.electron.workflow.get();
    set({ workflow, isLoading: false });
  },

  saveWorkflow: async (workflow: IWorkflow) => {
    // Optimistic update
    set({ workflow }); 
    await window.electron.workflow.save(workflow);
  },

  resetWorkflow: async () => {
    set({ isLoading: true });
    const workflow = await window.electron.workflow.reset();
    set({ workflow, isLoading: false, selectedAgentId: null });
  },

  undo: async () => {
    const workflow = await window.electron.workflow.undo();
    if (workflow) set({ workflow });
  },

  redo: async () => {
    const workflow = await window.electron.workflow.redo();
    if (workflow) set({ workflow });
  },

  selectAgent: (id) => set({ selectedAgentId: id }),

  updateLocalAgent: (id, updates) => {
    const { workflow } = get();
    if (!workflow) return;

    const updatedAgents = workflow.agents.map(a => 
      a.id === id ? { ...a, ...updates } : a
    );

    set({ workflow: { ...workflow, agents: updatedAgents } });
  },

  updateRouterPrompt: (prompt) => {
      const { workflow } = get();
      if (!workflow) return;
      set({ workflow: { ...workflow, routerPrompt: prompt } });
  }
}));
