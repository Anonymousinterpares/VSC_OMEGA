export interface IContextFragment {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  type: 'fragment';
}

export interface IFileContext {
  id: string;
  filePath: string;
  content: string;
  type: 'file';
}

export type ContextItem = IContextFragment | IFileContext;

export interface IAgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  agentName?: string; // e.g., "Planner", "Coder"
  content: string;
  timestamp: number;
  steps?: { agent: string, input: string, output: string, reasoning?: string }[];
  isStreaming?: boolean;
}

export interface IAgentState {
  currentAgent: string;
  isThinking: boolean;
  history: IAgentMessage[];
}

export interface IFileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: IFileNode[]; // For folders
}

export interface IAppSettings {
  geminiApiKey: string;
  selectedModel: 'gemini-3-pro-preview' | 'gemini-3-flash-preview';
}
