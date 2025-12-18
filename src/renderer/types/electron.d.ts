export interface IElectronAPI {
  ipcRenderer: {
    send: (channel: string, data?: any) => void;
    on: (channel: string, func: (...args: any[]) => void) => () => void;
    invoke: (channel: string, data?: any) => Promise<any>;
    removeAllListeners: (channel: string) => void;
  };
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}
