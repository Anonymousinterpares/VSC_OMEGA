import { create } from 'zustand';
import { IFileNode } from '@/shared/types';
import { CHANNELS } from '@/shared/constants';

interface FileState {
  rootPath: string | null;
  fileTree: IFileNode[];
  selectedFile: string | null;
  unsavedFiles: Map<string, string>; // path -> content
  
  openFolder: () => void;
  selectFile: (path: string) => void;
  setFileTree: (rootPath: string, tree: IFileNode[]) => void;
  setUnsavedFile: (path: string, content: string | null) => void;
}

export const useFileStore = create<FileState>((set) => ({
  rootPath: null,
  fileTree: [],
  selectedFile: null,
  unsavedFiles: new Map(),

  openFolder: () => {
    if (window.electron) {
        window.electron.ipcRenderer.send(CHANNELS.TO_MAIN.OPEN_FOLDER);
    }
  },

  selectFile: (path: string) => {
    set({ selectedFile: path });
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
  }
}));

// Listener for IPC events
if (window.electron) {
    window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.FOLDER_OPENED, (data: { rootPath: string, tree: IFileNode[] }) => {
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