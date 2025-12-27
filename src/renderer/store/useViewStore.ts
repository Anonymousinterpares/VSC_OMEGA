import { create } from 'zustand';

type ViewType = 'editor' | 'workflow';

interface ViewState {
  activeView: ViewType;
  isSidebarCollapsed: boolean;
  setActiveView: (view: ViewType) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  activeView: 'editor',
  isSidebarCollapsed: false,
  setActiveView: (view) => set({ activeView: view }),
  setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
}));
