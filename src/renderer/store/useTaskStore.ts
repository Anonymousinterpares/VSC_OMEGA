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
  resetTasks: () => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  strictMode: false,
  startTime: null,
  endTime: null,

  initiateMission: () => set({ startTime: Date.now(), endTime: null }),

  setTasks: (newTasks) => set((state) => {
    // Heuristic: If we have no tasks, or the first task is different (ID or description), it's a new mission.
    const isNewMission = state.tasks.length === 0 || 
        (newTasks.length > 0 && state.tasks.length > 0 && 
            (newTasks[0].id !== state.tasks[0].id || newTasks[0].description !== state.tasks[0].description));

    let newStartTime = state.startTime;
    let newEndTime = state.endTime;

    if (isNewMission) {
        // If the timer is NOT running (startTime null OR endTime set from prev mission), start it now.
        // If the timer IS running (startTime set AND endTime null), it means initiateMission was likely called 
        // by the user interaction starting this flow, so we preserve that earlier startTime.
        if (state.startTime === null || state.endTime !== null) {
            newStartTime = newTasks.length > 0 ? Date.now() : null;
        }
        newEndTime = null;
    } else if (state.startTime === null && newTasks.length > 0) {
        // Fallback: if we had tasks but no start time (shouldn't happen often), set it now
        newStartTime = Date.now();
    }

    // Check completion
    const allCompleted = newTasks.length > 0 && newTasks.every(t => t.status === 'completed');
    if (allCompleted && !newEndTime) {
        newEndTime = Date.now();
    } else if (!allCompleted && newEndTime) {
        // If we reopened a task or added a new one, clear the end time
        newEndTime = null;
    }

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

    if (allCompleted && !newEndTime) {
        newEndTime = Date.now();
    } else if (!allCompleted && newEndTime) {
        newEndTime = null;
    }

    return {
        tasks: newTasks,
        endTime: newEndTime
    };
  }),

  setStrictMode: (enabled) => set({ strictMode: enabled }),
  
  resetTasks: () => set({ tasks: [], startTime: null, endTime: null })
}));
