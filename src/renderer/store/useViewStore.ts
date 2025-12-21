import { create } from 'zustand';

type ViewType = 'editor' | 'workflow';

interface ViewState {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  activeView: 'editor',
  setActiveView: (view) => set({ activeView: view }),
}));
