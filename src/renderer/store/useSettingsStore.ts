import { create } from 'zustand';
import { IAppSettings } from '@/shared/types';
import { CHANNELS } from '@/shared/constants';

interface SettingsState {
  settings: IAppSettings;
  isOpen: boolean;
  loadSettings: () => Promise<void>;
  saveSettings: (newSettings: Partial<IAppSettings>) => Promise<void>;
  toggleModal: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {
    geminiApiKey: '',
    selectedModel: 'gemini-3-flash-preview',
    agenticMode: 'agentic'
  },
  isOpen: false,

  loadSettings: async () => {
    if (window.electron) {
        const settings = await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.GET_SETTINGS);
        set({ settings });
    }
  },

  saveSettings: async (newSettings) => {
    if (window.electron) {
        const updated = await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.SAVE_SETTINGS, newSettings);
        set({ settings: updated });
    }
  },

  toggleModal: () => set((state) => ({ isOpen: !state.isOpen })),
}));