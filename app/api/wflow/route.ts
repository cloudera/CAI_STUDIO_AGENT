import { NextRequest, NextResponse } from 'next/server';
import {
  ToolInstance,
  DeployedWorkflow,
  Workflow,
  CrewAITaskMetadata,
  AgentMetadata,
} from '@/studio/proto/agent_studio';
import fs from 'fs';
import https from 'https';
import axios from 'axios';

const httpsAgent = new https.Agent({
  ca: fs.readFileSync('/etc/ssl/certs/ca-certificates.crt'),
});

interface CMLModel {
  id: string;
  name: string;
  access_key: string;
}

interface ListModelsResponse {
  models: CMLModel[];
}

const fetchModelUrl = async (cml_model_id: string): Promise<string | null> => {
  const CDSW_APIV2_KEY = process.env.CDSW_APIV2_KEY;
  const CDSW_DOMAIN = process.env.CDSW_DOMAIN;
  const CDSW_PROJECT_ID = process.env.CDSW_PROJECT_ID;

  if (!CDSW_APIV2_KEY || !CDSW_DOMAIN || !CDSW_PROJECT_ID) {
    console.error('Environment variables are not set properly.');
    return null;
  }

  try {
    const response = await axios.get<ListModelsResponse>(`https://${CDSW_DOMAIN}/api/v2/models`, {
      params: {
        page_size: 1000,
      },
      headers: {
        authorization: `Bearer ${CDSW_APIV2_KEY}`,
      },
      httpsAgent: httpsAgent,
    });

    const model = response.data.models.find((model: CMLModel) => model.id === cml_model_id);

    if (!model) {
      console.error('Model is not found.');
      return null;
    }

    const outputURL = `https://modelservice.${CDSW_DOMAIN}/model?accessKey=${model.access_key}`;
    return outputURL;
  } catch (error) {
    console.error('Error fetching model URL:', error);
    return null;
  }
};

// Extract information about the rendermode and the
// workflow if a workflow app is initialized. This
// is determined by env vars that are passed in at
// application start.
export async function GET(request: NextRequest) {
  if (process.env.AGENT_STUDIO_RENDER_MODE === 'workflow') {
    const deployedModelId = process.env.AGENT_STUDIO_DEPLOYED_MODEL_ID;
    const modelUrl = await fetchModelUrl(deployedModelId as string);

    const getConfigurationResponse = await axios.post(
      `${modelUrl}`,
      {
        request: {
          action_type: 'get-configuration',
        },
      },
      {
        headers: { 'Content-Type': 'application/json' },
        httpsAgent: httpsAgent,
      },
    );
    const configuration = getConfigurationResponse.data?.response?.configuration;

    const toolInstances: ToolInstance[] = configuration.tool_instances.map((tool: any) => ({
      id: tool.id,
      name: tool.name,
      workflow_id: configuration.workflow.id,
      python_code: '', // These fields aren't in the config response
      python_requirements: '',
      source_folder_path: '',
      tool_metadata: '',
      is_valid: true,
      tool_image_uri: tool.tool_image_uri,
      tool_description: '',
    }));

    const agents: AgentMetadata[] = configuration.agents.map((agent: any) => ({
      id: agent.id,
      name: agent.name,
      llm_provider_model_id: agent.llm_provider_model_id || '',
      tools_id: agent.tool_instance_ids,
      crew_ai_agent_metadata: {
        role: agent.crew_ai_role,
        backstory: agent.crew_ai_backstory,
        goal: agent.crew_ai_goal,
        allow_delegation: agent.crew_ai_allow_delegation,
        verbose: agent.crew_ai_verbose,
        cache: agent.crew_ai_cache,
        temperature: agent.crew_ai_temperature,
        max_iter: agent.crew_ai_max_iter,
      },
      is_valid: true,
      workflow_id: configuration.workflow.id,
      agent_image_uri: agent.agent_image_uri || '',
    }));

    const extractPlaceholders = (description: string): string[] => {
      const matches = description.match(/{(.*?)}/g) || [];
      return [...new Set(matches.map((match) => match.slice(1, -1)))];
    };

    const tasks: CrewAITaskMetadata[] = configuration.tasks.map((task: any) => ({
      task_id: task.id,
      description: task.description,
      expected_output: task.expected_output,
      assigned_agent_id: task.assigned_agent_id,
      is_valid: true,
      inputs: extractPlaceholders(task.description),
      workflow_id: configuration.workflow.id,
    }));

    const workflow: Workflow = {
      workflow_id: configuration.workflow.id,
      name: configuration.workflow.name,
      crew_ai_workflow_metadata: {
        agent_id: configuration.workflow.agent_ids,
        task_id: configuration.workflow.task_ids,
        manager_agent_id: configuration.workflow.manager_agent_id || '',
        process: configuration.workflow.crew_ai_process,
      },
      is_valid: true,
      is_ready: true,
      is_conversational: configuration.workflow.is_conversational,
      is_draft: false,
    };

    const deployedWorkflow: DeployedWorkflow = {
      deployed_workflow_id: configuration.workflow.deployment_id,
      workflow_id: configuration.workflow.id,
      workflow_name: configuration.workflow.name,
      deployed_workflow_name: configuration.workflow.name,
      cml_deployed_model_id: deployedModelId as string,
      is_stale: false,
      application_url: '', // These fields aren't in the config response
      application_status: '',
      application_deep_link: '',
      model_deep_link: '',
    };

    return NextResponse.json({
      renderMode: process.env.AGENT_STUDIO_RENDER_MODE,
      deployedWorkflowId: process.env.AGENT_STUDIO_DEPLOYED_WORKFLOW_ID,
      deployedWorkflow: deployedWorkflow,
      workflowModelUrl: await fetchModelUrl(deployedWorkflow.cml_deployed_model_id),
      workflow: workflow,
      agents: agents,
      tasks: tasks,
      toolInstances: toolInstances,
    });
  } else {
    return NextResponse.json({
      renderMode: process.env.AGENT_STUDIO_RENDER_MODE,
    });
  }
}
