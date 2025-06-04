import {
  ToolInstance,
  DeployedWorkflow,
  ToolTemplate,
  Workflow,
  AgentMetadata,
  CrewAITaskMetadata,
  McpInstance,
} from '@/studio/proto/agent_studio';

export interface OpsData {
  ops_display_url: string;
}

export interface WorkflowData {
  renderMode: 'studio' | 'workflow';
  studioAsMcpClient: boolean;
  deployedWorkflowId: string;
  deployedWorkflow: DeployedWorkflow;
  workflowModelUrl: string;
  workflow: Workflow;
  agents: AgentMetadata[];
  tasks: CrewAITaskMetadata[];
  toolTemplates: ToolTemplate[];
  toolInstances: ToolInstance[];
  mcpInstances: McpInstance[];
}

/**
 * Tool configuration for a specific tool in a specific workflow,
 * stored in the local storage.
 */
export interface WorkflowResourceConfiguration {
  // Key-value pair of parameter values where the
  // key is is the parameter name, and the value
  // is the parameter's value.
  parameters: Record<string, string>;
}

/**
 * Agent Studio exposed LLM generation config types for all LLM models
 * in a workflow. All other generation configs come from a default
 * generation config. Technically we could have centralized types here,
 * but this interface is still exposed to host *only* the UI-modifyable components.
 *
 */
export interface WorkflowGenerationConfig {
  max_new_tokens?: number;
  temperature?: number;
}

export interface WorkflowConfiguration {
  // Key-value pair of tool parameters where the key
  // is toolId, and the value is the tool configuration.
  toolConfigurations: Record<string, WorkflowResourceConfiguration>;

  // Key-value pair of MCP instance env names where the key
  // is the MCP instance id, and the value is the MCP instance
  // env key-value pairs.
  mcpInstanceConfigurations: Record<string, WorkflowResourceConfiguration>;

  // Shared generation config for all LLM calls in a workflow.
  generationConfig?: WorkflowGenerationConfig;
}

export interface ViewSettings {
  displayIntroPage?: boolean;
  showTour?: boolean;
}

export interface LocalStorageState {
  workflowConfigurations?: Record<string, WorkflowConfiguration>;
  viewSettings?: ViewSettings;
}
