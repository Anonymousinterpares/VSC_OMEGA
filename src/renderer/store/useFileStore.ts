import { create } from 'zustand';
import { IFileNode } from '@/shared/types';
import { CHANNELS } from '@/shared/constants';

interface FileState {
  rootPath: string | null;
  fileTree: IFileNode[];
  selectedFile: string | null;
  
  openFolder: () => void;
  selectFile: (path: string) => void;
  setFileTree: (rootPath: string, tree: IFileNode[]) => void;
}

export const useFileStore = create<FileState>((set) => ({
  rootPath: null,
  fileTree: [],
  selectedFile: null,

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
  }
}));

// Listener for IPC events
if (window.electron) {
    window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.FOLDER_OPENED, (data: { rootPath: string, tree: IFileNode[] }) => {
        useFileStore.getState().setFileTree(data.rootPath, data.tree);
    });
}