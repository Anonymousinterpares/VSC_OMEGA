import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS } from '../shared/constants';

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel: string, data?: any) => ipcRenderer.send(channel, data),
    on: (channel: string, func: (...args: any[]) => void) => {
      const subscription = (_event: any, ...args: any[]) => func(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    },
    invoke: (channel: string, data?: any) => ipcRenderer.invoke(channel, data),
    removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
  },
  taskConfirmationDecision: (data: any) => ipcRenderer.invoke(CHANNELS.TO_MAIN.TASK_CONFIRMATION_DECISION, data),
  
  workflow: {
    get: () => ipcRenderer.invoke(CHANNELS.TO_MAIN.GET_WORKFLOW),
    save: (workflow: any) => ipcRenderer.invoke(CHANNELS.TO_MAIN.SAVE_WORKFLOW, workflow),
    reset: () => ipcRenderer.invoke(CHANNELS.TO_MAIN.RESET_WORKFLOW),
    undo: () => ipcRenderer.invoke(CHANNELS.TO_MAIN.UNDO_WORKFLOW),
    redo: () => ipcRenderer.invoke(CHANNELS.TO_MAIN.REDO_WORKFLOW),
  }
});
