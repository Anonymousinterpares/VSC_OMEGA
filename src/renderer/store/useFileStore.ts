import { create } from 'zustand';
import { IFileNode } from '@/shared/types';
import { CHANNELS } from '@/shared/constants';

export interface ITab {
    id: string; // filePath
    path: string;
    isPreview: boolean;
    isPinned: boolean;
    color?: string;
    order: number;
}

interface FileState {
  rootPath: string | null;
  fileTree: IFileNode[];
  
  // Tab Management
  tabs: ITab[];
  activeTabId: string | null;
  
  // Legacy selectedFile is now derived from activeTabId
  selectedFile: string | null; 
  
  unsavedFiles: Map<string, string>; // path -> content
  
  openFolder: () => void;
  setFileTree: (rootPath: string, tree: IFileNode[]) => void;
  setUnsavedFile: (path: string, content: string | null) => void;

  // Tab Actions
  openFile: (path: string, preview?: boolean) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  markTabPermanent: (id: string) => void;
  togglePinTab: (id: string) => void;
  setTabColor: (id: string, color: string) => void;
  reorderTabs: (sourceIndex: number, destIndex: number) => void;
}

export const useFileStore = create<FileState>((set, get) => ({
  rootPath: null,
  fileTree: [],
  tabs: [],
  activeTabId: null,
  selectedFile: null,
  unsavedFiles: new Map(),

  openFolder: () => {
    console.log("Store: openFolder action called");
    if (window.electron) {
        window.electron.ipcRenderer.send(CHANNELS.TO_MAIN.OPEN_FOLDER);
    } else {
        console.error("Store: window.electron is missing");
    }
  },

  setFileTree: (rootPath, tree) => {
    set({ rootPath, fileTree: tree });
  },

  setUnsavedFile: (path: string, content: string | null) => {
      set((state) => {
          const newUnsaved = new Map(state.unsavedFiles);
          if (content === null) {
              newUnsaved.delete(path);
          } else {
              newUnsaved.set(path, content);
          }
          return { unsavedFiles: newUnsaved };
      });
  },

  // --- TAB IMPLEMENTATION ---

  openFile: (path: string, preview = true) => {
      set((state) => {
          const existingTab = state.tabs.find(t => t.path === path);
          
          // 1. If tab exists, just activate it (and promote if needed)
          if (existingTab) {
              const updatedTabs = state.tabs.map(t => 
                  t.id === existingTab.id && !preview ? { ...t, isPreview: false } : t
              );
              return { 
                  tabs: updatedTabs, 
                  activeTabId: existingTab.id,
                  selectedFile: existingTab.path
              };
          }

          // 2. If new tab is a Preview, close other unpinned previews
          let newTabs = [...state.tabs];
          if (preview) {
              const existingPreviewIndex = newTabs.findIndex(t => t.isPreview && !t.isPinned);
              if (existingPreviewIndex !== -1) {
                  // Replace the existing preview
                  newTabs[existingPreviewIndex] = {
                      id: path,
                      path: path,
                      isPreview: true,
                      isPinned: false,
                      order: newTabs[existingPreviewIndex].order
                  };
                  return { 
                      tabs: newTabs, 
                      activeTabId: path,
                      selectedFile: path 
                  };
              }
          }

          // 3. Add new tab
          newTabs.push({
              id: path,
              path: path,
              isPreview: preview,
              isPinned: false,
              order: newTabs.length
          });

          return { 
              tabs: newTabs, 
              activeTabId: path, 
              selectedFile: path 
          };
      });
  },

  closeTab: (id: string) => {
      set((state) => {
          const tabIndex = state.tabs.findIndex(t => t.id === id);
          if (tabIndex === -1) return state;

          const newTabs = state.tabs.filter(t => t.id !== id);
          
          // Determine new active tab if we closed the active one
          let newActiveId = state.activeTabId;
          if (state.activeTabId === id) {
              // Try to go to the right, else left
              if (newTabs.length > 0) {
                  const newIndex = Math.min(tabIndex, newTabs.length - 1);
                  newActiveId = newTabs[newIndex].id;
              } else {
                  newActiveId = null;
              }
          }

          return { 
              tabs: newTabs, 
              activeTabId: newActiveId,
              selectedFile: newActiveId ? newTabs.find(t => t.id === newActiveId)?.path || null : null
          };
      });
  },

  setActiveTab: (id: string) => {
      set((state) => ({ 
          activeTabId: id,
          selectedFile: state.tabs.find(t => t.id === id)?.path || null
      }));
  },

  markTabPermanent: (id: string) => {
      set((state) => ({
          tabs: state.tabs.map(t => t.id === id ? { ...t, isPreview: false } : t)
      }));
  },

  togglePinTab: (id: string) => {
      set((state) => {
          const updatedTabs = state.tabs.map(t => t.id === id ? { ...t, isPinned: !t.isPinned } : t);
          // Sort logic: Pinned items move to start? 
          // Implementation: We keep array order but UI renders pinned first? 
          // Or we actually sort the array. Sorting array is cleaner for DnD.
          updatedTabs.sort((a, b) => {
              if (a.isPinned === b.isPinned) return 0; // Maintain relative order
              return a.isPinned ? -1 : 1;
          });
          return { tabs: updatedTabs };
      });
  },

  setTabColor: (id: string, color: string) => {
      set((state) => ({
          tabs: state.tabs.map(t => t.id === id ? { ...t, color } : t)
      }));
  },

  reorderTabs: (sourceIndex: number, destIndex: number) => {
      set((state) => {
          const newTabs = [...state.tabs];
          const [moved] = newTabs.splice(sourceIndex, 1);
          newTabs.splice(destIndex, 0, moved);
          return { tabs: newTabs };
      });
  }

}));

// Listener for IPC events
if (window.electron) {
    window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.FOLDER_OPENED, (data: { rootPath: string, tree: IFileNode[] }) => {
        console.log("Store: FOLDER_OPENED event received", data);
        useFileStore.getState().setFileTree(data.rootPath, data.tree);
    });

    window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.REFRESH_TREE, (data: { tree: IFileNode[] }) => {
        // Keep existing root path, just update tree
        const currentRoot = useFileStore.getState().rootPath;
        if (currentRoot) {
            useFileStore.getState().setFileTree(currentRoot, data.tree);
        }
    });
}
