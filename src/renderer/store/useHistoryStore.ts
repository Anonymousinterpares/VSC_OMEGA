import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { IAgentMessage } from '@/shared/types';
import { ITask } from './useTaskStore';
import { ContextItem } from './useContextStore';

export interface SavedTask {
    id: string;
    name: string; // Derived from first user message or generated
    timestamp: number;
    messages: IAgentMessage[];
    tasks: ITask[];
    context: ContextItem[];
    tokenStats: any; // Using any for ITokenStats to avoid circular dep or duplication, but ideally importing
}

interface HistoryState {
    history: SavedTask[];
    restoreRequest: SavedTask | null; // Signal to components to load this state
    
    archiveTask: (task: SavedTask) => void;
    deleteTask: (id: string) => void;
    clearHistory: () => void;
    requestRestore: (task: SavedTask) => void;
    clearRestoreRequest: () => void;
}

export const useHistoryStore = create<HistoryState>()(
    persist(
        (set) => ({
            history: [],
            restoreRequest: null,

            archiveTask: (task) => set((state) => {
                // Remove existing if overwriting (optional, but good for "save current")
                // For now, we assume "New Task" archives the *finished* previous one.
                // We'll filter out very short/empty tasks to avoid clutter.
                if (task.messages.length <= 1) return state;

                return { history: [task, ...state.history].slice(0, 50) }; // Keep last 50
            }),

            deleteTask: (id) => set((state) => ({
                history: state.history.filter(t => t.id !== id)
            })),

            clearHistory: () => set({ history: [] }),

            requestRestore: (task) => set({ restoreRequest: task }),
            
            clearRestoreRequest: () => set({ restoreRequest: null })
        }),
        {
            name: 'task-history-storage', // unique name
        }
    )
);
