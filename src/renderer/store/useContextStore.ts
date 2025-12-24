import { create } from 'zustand';

export interface ContextItem {
    id: string;
    type: 'file' | 'fragment';
    path: string;
    content: string;
    startLine?: number;
    endLine?: number;
}

interface ContextState {
    activeContext: ContextItem[];
    addContextItem: (item: ContextItem) => void;
    removeContextItem: (id: string) => void;
    clearContext: () => void;
    setContext: (items: ContextItem[]) => void;
}

export const useContextStore = create<ContextState>((set) => ({
    activeContext: [],
    addContextItem: (item) => set((state) => ({ 
        activeContext: [...state.activeContext, item] 
    })),
    removeContextItem: (id) => set((state) => ({ 
        activeContext: state.activeContext.filter(i => i.id !== id) 
    })),
    clearContext: () => set({ activeContext: [] }),
    setContext: (items) => set({ activeContext: items }),
}));
