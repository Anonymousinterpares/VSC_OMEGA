import { create } from 'zustand';

export interface ITask {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'review_pending' | 'completed' | 'failed';
  assignedAgent?: string;
  verificationCmd?: string; // e.g., "npm test"
}

interface TaskState {
  tasks: ITask[];
  strictMode: boolean; // Require manual approval?
  
  setTasks: (tasks: ITask[]) => void;
  updateTaskStatus: (id: string, status: ITask['status']) => void;
  setStrictMode: (enabled: boolean) => void;
  resetTasks: () => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  strictMode: false,

  setTasks: (tasks) => set({ tasks }),
  
  updateTaskStatus: (id, status) => set((state) => ({
    tasks: state.tasks.map((t) => (t.id === id ? { ...t, status } : t))
  })),

  setStrictMode: (enabled) => set({ strictMode: enabled }),
  
  resetTasks: () => set({ tasks: [] })
}));
