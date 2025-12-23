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

export type AgentPhase = 
  | 'IDLE'
  | 'PREPARING_CONTEXT' 
  | 'WAITING_FOR_API' 
  | 'STREAMING' 
  | 'EXECUTING_TOOL' 
  | 'ANALYZING';

export interface IAgentStatus {
  phase: AgentPhase;
  details?: string; // e.g. "npm install" or "Waiting 4.2s..."
  timestamp: number;
}

export interface IFileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: IFileNode[]; // For folders
}

export interface ITask {
    id: string;
    description: string;
    status: 'pending' | 'in_progress' | 'review_pending' | 'completed' | 'rejected' | 'failed';
    assignedAgent?: string;
    verificationCmd?: string;
}

export interface IAppSettings {
  geminiApiKey: string;
  selectedModel: string;
  agenticMode: 'agentic' | 'solo';
}

export interface ISearchMatch {
    lineText: string;
    lineNumber: number; // 1-based
    matchIndex: number; // 0-based index in line
    matchLength: number;
}

export interface ISearchResult {
    filePath: string;
    matches: ISearchMatch[];
}

export interface ISearchOptions {
    query: string;
    matchCase: boolean;
    matchWholeWord: boolean;
    useRegex: boolean;
    includes: string; // semicolon delimited
    excludes: string; // semicolon delimited
}
