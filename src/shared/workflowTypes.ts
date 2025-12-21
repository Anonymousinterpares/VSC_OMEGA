export interface IAgentDefinition {
  id: string; // e.g., "Coder"
  name: string; // e.g., "Coder"
  role: string; // e.g., "Software Engineer"
  color: string; // Hex color for UI
  systemPrompt: string;
  description: string; // For the Router or UI tooltips
  capabilities: string[]; // ["read_file", "write_file", "replace"]
}

export interface IWorkflow {
  id: string;
  name: string;
  routerPrompt: string; // The central brain's prompt
  agents: IAgentDefinition[];
  lastModified: number;
}

export const DEFAULT_WORKFLOW_ID = 'default-workflow';
