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
  startTime: number | null;
  endTime: number | null;
  
  setTasks: (tasks: ITask[]) => void;
  updateTaskStatus: (id: string, status: ITask['status']) => void;
  setStrictMode: (enabled: boolean) => void;
  initiateMission: () => void;
  stopTimer: () => void; // Manually stop the timer (e.g. agent finished turn)
  resetTasks: () => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  strictMode: false,
  startTime: null,
  endTime: null,

  initiateMission: () => set((state) => ({ 
      startTime: state.startTime || Date.now(), // Preserve start time if continuing
      endTime: null 
  })),

  stopTimer: () => set((state) => ({
      endTime: state.endTime || Date.now()
  })),

  setTasks: (newTasks) => set((state) => {
    // Heuristic: If we have no tasks, or the first task is different (ID or description), it's a new mission.
    const isNewMission = state.tasks.length === 0 || 
        (newTasks.length > 0 && state.tasks.length > 0 && 
            (newTasks[0].id !== state.tasks[0].id || newTasks[0].description !== state.tasks[0].description));

    let newStartTime = state.startTime;
    let newEndTime = state.endTime;

    if (isNewMission) {
        newStartTime = newTasks.length > 0 ? Date.now() : null;
        newEndTime = null;
    } else if (state.startTime === null && newTasks.length > 0) {
        newStartTime = Date.now();
    }

    // Check completion
    const allCompleted = newTasks.length > 0 && newTasks.every(t => t.status === 'completed');
    if (allCompleted) {
        newEndTime = Date.now();
    } 
    // If not all completed, we DON'T automatically clear endTime here because we might want to keep it stopped 
    // until the next agent turn (initiateMission will clear it).

    return { 
        tasks: newTasks,
        startTime: newStartTime,
        endTime: newEndTime
    };
  }),
  
  updateTaskStatus: (id, status) => set((state) => {
    const newTasks = state.tasks.map((t) => (t.id === id ? { ...t, status } : t));
    
    const allCompleted = newTasks.length > 0 && newTasks.every(t => t.status === 'completed');
    let newEndTime = state.endTime;

    if (allCompleted) {
        newEndTime = Date.now();
    }
    
    return {
        tasks: newTasks,
        endTime: newEndTime
    };
  }),

  setStrictMode: (enabled) => set({ strictMode: enabled }),
  
  resetTasks: () => set({ tasks: [], startTime: null, endTime: null })
}));
