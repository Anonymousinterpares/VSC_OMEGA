import { create } from 'zustand';
import { CHANNELS } from '@/shared/constants';

interface ChecklistState {
  checklistContent: string;
  selectedItems: string[];
  
  loadChecklist: () => Promise<void>;
  saveChecklist: (content: string) => Promise<void>;
  toggleSelection: (lineText: string) => void;
  clearSelection: () => void;
}

export const useChecklistStore = create<ChecklistState>((set, get) => ({
  checklistContent: "",
  selectedItems: [],

  loadChecklist: async () => {
    if (window.electron) {
        const content = await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.GET_CHECKLIST);
        set({ checklistContent: content || "" });
    }
  },

  saveChecklist: async (content: string) => {
    if (window.electron) {
        await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.SAVE_CHECKLIST, content);
        set({ checklistContent: content });
    }
  },

  toggleSelection: (lineText: string) => set((state) => {
      const exists = state.selectedItems.includes(lineText);
      if (exists) {
          return { selectedItems: state.selectedItems.filter(i => i !== lineText) };
      } else {
          return { selectedItems: [...state.selectedItems, lineText] };
      }
  }),

  clearSelection: () => set({ selectedItems: [] })
}));
