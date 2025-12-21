export interface IElectronAPI {
  ipcRenderer: {
    send: (channel: string, data?: any) => void;
    on: (channel: string, func: (...args: any[]) => void) => () => void;
    invoke: (channel: string, data?: any) => Promise<any>;
    removeAllListeners: (channel: string) => void;
  };
      taskConfirmationDecision: (data: { id: string; status: 'confirmed' | 'rejected'; comment?: string }) => Promise<{ success: boolean }>;
      
      // Workflow
      workflow: {
        get: () => Promise<any>;
        save: (workflow: any) => Promise<{ success: boolean }>;
        reset: () => Promise<any>;
        undo: () => Promise<any>;
        redo: () => Promise<any>;
      };
    };
  }
}
