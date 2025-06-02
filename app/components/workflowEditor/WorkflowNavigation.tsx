import {
  resetEditor,
  selectEditorCurrentStep,
  selectEditorWorkflow,
  selectEditorWorkflowIsConversational,
  selectWorkflowConfiguration,
  selectWorkflowGenerationConfig,
  updatedEditorStep,
  updatedEditorWorkflowId,
} from '../../workflows/editorSlice';
import {
  Button,
  Descriptions,
  Layout,
  message,
  Modal,
  Checkbox,
  notification,
  Alert,
  Tooltip,
} from 'antd';
import { Typography } from 'antd';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  SaveOutlined,
  CloseOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  useAddWorkflowMutation,
  useDeployWorkflowMutation,
  useUpdateWorkflowMutation,
  useGetWorkflowMutation,
  useAddWorkflowTemplateMutation,
} from '../../workflows/workflowsApi';
import { createAddRequestFromEditor, createUpdateRequestFromEditor } from '../../lib/workflow';
import { useGlobalNotification } from '../Notifications';
import { useAppDispatch, useAppSelector } from '../../lib/hooks/hooks';
import { useListDeployedWorkflowsQuery } from '../../workflows/deployedWorkflowsApi';
import { useListTasksQuery } from '../../tasks/tasksApi';
import { useGetDefaultModelQuery } from '../../models/modelsApi';
import { clearedWorkflowApp } from '../../workflows/workflowAppSlice';
import { hasValidToolConfiguration } from './WorkflowEditorConfigureInputs';
import { useListToolInstancesQuery } from '../../tools/toolInstancesApi';
import { useListAgentsQuery } from '../../agents/agentApi';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

interface WorkflowNavigationProps {
  workflowId: string;
}

const WorkflowNavigation: React.FC<WorkflowNavigationProps> = ({ workflowId }) => {
  const currentStep = useAppSelector(selectEditorCurrentStep);
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [updateWorkflow] = useUpdateWorkflowMutation();
  const [addWorkflow] = useAddWorkflowMutation();
  const workflowState = useAppSelector(selectEditorWorkflow);
  const notificationApi = useGlobalNotification();
  const [deployWorkflow] = useDeployWorkflowMutation();
  const [isDeployModalVisible, setIsDeployModalVisible] = useState(false);
  const [saveWorkflowAsTemplate, setSaveWorkflowAsTemplate] = useState(false);
  const [
    bypassAuthenticationForDeployedApplication,
    setBypassAuthenticationForDeployedApplication,
  ] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const { data: deployedWorkflows = [] } = useListDeployedWorkflowsQuery({});
  const { data: tasks } = useListTasksQuery({ workflow_id: workflowId });
  const [getWorkflow] = useGetWorkflowMutation();
  const [workflow, setWorkflow] = useState<any>(null);
  const [hasAgents, setHasAgents] = useState<boolean>(false);
  const [hasTasks, setHasTasks] = useState<boolean>(false);
  const [hasUnassignedTasks, setHasUnassignedTasks] = useState<boolean>(false);
  const [addWorkflowTemplate] = useAddWorkflowTemplateMutation();
  const { data: defaultModel } = useGetDefaultModelQuery();
  const workflowGenerationConfig = useAppSelector(selectWorkflowGenerationConfig);
  const workflowConfiguration = useAppSelector(selectWorkflowConfiguration);

  const { data: agents } = useListAgentsQuery({ workflow_id: workflowId });
  const { data: toolInstances } = useListToolInstancesQuery({ workflow_id: workflowId });

  const isValid = useMemo(() => {
    const result = hasValidToolConfiguration(
      workflowState.workflowId || '',
      agents,
      toolInstances,
      workflowConfiguration,
    );
    console.log('Validation Debug:', {
      workflowId: workflowState.workflowId,
      agents,
      toolInstances,
      workflowConfiguration,
      isValid: result,
    });
    return result;
  }, [workflowState.workflowId, agents, toolInstances, workflowConfiguration]);

  const hasExistingDeployment = deployedWorkflows.some(
    (dw) => dw.workflow_id === workflowState.workflowId,
  );

  // Add this useEffect to fetch workflow details when workflowId changes
  useEffect(() => {
    const fetchWorkflowDetails = async () => {
      if (workflowState.workflowId) {
        try {
          const workflow = await getWorkflow({ workflow_id: workflowState.workflowId }).unwrap();
          setWorkflow(workflow);

          // Use optional chaining and nullish coalescing to handle undefined
          setHasAgents((workflow.crew_ai_workflow_metadata?.agent_id?.length ?? 0) > 0);
          setHasTasks((workflow.crew_ai_workflow_metadata?.task_id?.length ?? 0) > 0);

          const hasManagerAgent = workflow.crew_ai_workflow_metadata?.process === 'hierarchical';
          const hasDefaultManager =
            hasManagerAgent && !workflow.crew_ai_workflow_metadata?.manager_agent_id;

          const hasUnassignedTasks =
            !hasManagerAgent && !hasDefaultManager
              ? (workflow.crew_ai_workflow_metadata?.task_id?.some((taskId: string) => {
                  const task = tasks?.find((t) => t.task_id === taskId);
                  return task && !task.assigned_agent_id;
                }) ?? false)
              : false;

          setHasUnassignedTasks(hasUnassignedTasks);
        } catch (error) {
          console.error('Error fetching workflow details:', error);
        }
      }
    };

    fetchWorkflowDetails();
  }, [workflowState.workflowId, tasks]);

  const saveWorkflowDraft = async () => {
    if (workflowState.workflowId) {
      updateWorkflow(createUpdateRequestFromEditor(workflowState));
    } else {
      const workflowId = await addWorkflow(createAddRequestFromEditor(workflowState)).unwrap();
      dispatch(updatedEditorWorkflowId(workflowId));
    }
    notificationApi.info({
      message: 'Draft Saved.',
      description: 'Workflow saved as draft.',
      placement: 'topRight',
    });
  };

  const handleDeploy = async () => {
    setIsDeploying(true);
    try {
      const workflowId = workflowState.workflowId!;

      if (saveWorkflowAsTemplate) {
        const addedWorkflowTemplateId = await addWorkflowTemplate({
          workflow_id: workflowId,
          agent_template_ids: [],
          task_template_ids: [], // TODO: make optional so we don't need to pass
        }).unwrap();

        notificationApi.success({
          message: 'New Workflow Template Created!',
          description:
            'You can now use this new workflow template as a starting point for new workflows.',
          placement: 'topRight',
        });
      }

      await deployWorkflow({
        workflow_id: workflowState.workflowId!,
        env_variable_overrides: {},
        tool_user_parameters: workflowConfiguration?.toolConfigurations || {},
        mcp_instance_env_vars: Object.fromEntries(
          Object.entries(workflowConfiguration?.mcpInstanceConfigurations || {}).map(
            ([key, config]) => [key, { env_vars: config.parameters }],
          ),
        ),
        generation_config: JSON.stringify(workflowGenerationConfig),
        bypass_authentication: bypassAuthenticationForDeployedApplication,
      }).unwrap();

      notificationApi.success({
        message: 'Success',
        description:
          'Workflow is being deployed! Once the deployment is complete, you will be able to use the deployed workflow application.',
        placement: 'topRight',
      });
      dispatch(resetEditor());
      dispatch(clearedWorkflowApp());
      router.push('/workflows');
      setIsDeployModalVisible(false);
    } catch (error: any) {
      console.error('Deployment error:', error);
      notificationApi.error({
        message: 'Error',
        description: error.data?.error || 'Failed to deploy workflow.',
        placement: 'topRight',
      });
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <>
      <Layout
        style={{
          flexDirection: 'row',
          justifyContent: 'space-around',
          alignItems: 'center',
          background: 'transparent',
          flexGrow: 0,
          flexShrink: 0,
          height: '40px',
        }}
      >
        <Layout
          style={{
            flexDirection: 'row',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'flex-start',
          }}
        >
          <Button
            style={{
              background: 'transparent',
              border: 'none',
              boxShadow: 'none',
              flexGrow: 0,
              height: '40px',
              alignItems: 'bottom',
            }}
            onClick={() => {
              saveWorkflowDraft();
              dispatch(resetEditor());
              dispatch(clearedWorkflowApp());
              router.push('/workflows');
            }}
          >
            <CloseOutlined />
            Cancel
          </Button>
        </Layout>
        {currentStep === 'Agents' ? (
          <Layout
            style={{
              flexDirection: 'row',
              flex: 1,
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}
          >
            <Button
              type="primary"
              style={{ flexGrow: 0, height: '40px' }}
              onClick={() => {
                dispatch(updatedEditorStep('Tasks'));
                saveWorkflowDraft();
              }}
            >
              Save & Next <ArrowRightOutlined />
            </Button>
          </Layout>
        ) : currentStep === 'Tasks' ? (
          <Layout
            style={{
              flexDirection: 'row',
              flex: 1,
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 16,
            }}
          >
            <Button
              style={{ flexGrow: 0, height: '40px' }}
              onClick={() => dispatch(updatedEditorStep('Agents'))}
            >
              <ArrowLeftOutlined /> Add Agents
            </Button>
            <Button
              type="primary"
              style={{ flexGrow: 0, height: '40px' }}
              onClick={() => {
                dispatch(updatedEditorStep('Configure'));
                saveWorkflowDraft();
              }}
            >
              Save & Next <ArrowRightOutlined />
            </Button>
          </Layout>
        ) : currentStep === 'Configure' ? (
          <Layout
            style={{
              flexDirection: 'row',
              flex: 1,
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 16,
            }}
          >
            <Button
              style={{ flexGrow: 0, height: '40px' }}
              onClick={() => dispatch(updatedEditorStep('Tasks'))}
            >
              <ArrowLeftOutlined /> Add Tasks
            </Button>
            <Tooltip
              title={
                !isValid ? 'Please fill in all required tool parameters before proceeding' : ''
              }
            >
              <Button
                type="primary"
                style={{ flexGrow: 0, height: '40px' }}
                onClick={() => {
                  dispatch(clearedWorkflowApp());
                  dispatch(updatedEditorStep('Test'));
                }}
              >
                Save & Next <ArrowRightOutlined />
              </Button>
            </Tooltip>
          </Layout>
        ) : currentStep === 'Test' ? (
          <Layout
            style={{
              flexDirection: 'row',
              flex: 1,
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 16,
            }}
          >
            <Button
              style={{ flexGrow: 0, height: '40px' }}
              onClick={() => dispatch(updatedEditorStep('Configure'))}
            >
              <ArrowLeftOutlined /> Configure
            </Button>
            <Tooltip title={!isValid ? 'Required tool parameters are missing' : ''}>
              <Button
                type="primary"
                style={{ flexGrow: 0, height: '40px' }}
                onClick={() => {
                  dispatch(clearedWorkflowApp());
                  dispatch(updatedEditorStep('Deploy'));
                }}
              >
                Save & Next <ArrowRightOutlined />
              </Button>
            </Tooltip>
          </Layout>
        ) : currentStep === 'Deploy' ? (
          <Layout
            style={{
              flexDirection: 'row',
              flex: 1,
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 16,
            }}
          >
            <Button
              style={{ flexGrow: 0, height: '40px' }}
              onClick={() => {
                dispatch(clearedWorkflowApp());
                dispatch(updatedEditorStep('Test'));
              }}
            >
              <ArrowLeftOutlined /> Test
            </Button>
            <Button
              style={{ flexGrow: 0, height: '40px' }}
              onClick={async () => {
                try {
                  await addWorkflowTemplate({
                    workflow_id: workflowState.workflowId!,
                    agent_template_ids: [],
                    task_template_ids: [],
                  });
                  notificationApi.success({
                    message: 'New Workflow Template Created!',
                    description:
                      'You can now use this new workflow template as a starting point for new workflows.',
                    placement: 'topRight',
                  });
                  dispatch(resetEditor());
                  dispatch(clearedWorkflowApp());
                  router.push('/workflows');
                  setIsDeployModalVisible(false);
                } catch (error) {
                  console.error('Error saving workflow as template:', error);
                  notificationApi.error({
                    message: 'Error',
                    description: 'Failed to save workflow as template.',
                    placement: 'topRight',
                  });
                }
              }}
              disabled={!defaultModel || !hasAgents || !hasTasks || hasUnassignedTasks}
            >
              Save as Template
            </Button>
            <Tooltip title={!isValid ? 'Required tool parameters are missing' : ''}>
              <Button
                type="primary"
                style={{ flexGrow: 0, height: '40px' }}
                disabled={
                  !isValid ||
                  !defaultModel ||
                  hasExistingDeployment ||
                  !hasAgents ||
                  !hasTasks ||
                  hasUnassignedTasks
                }
                onClick={() => setIsDeployModalVisible(true)}
              >
                Deploy
              </Button>
            </Tooltip>
          </Layout>
        ) : (
          <div>Unknown Step</div>
        )}
      </Layout>
      <Modal
        title="Deploy Workflow"
        open={isDeployModalVisible}
        onCancel={() => {
          setIsDeployModalVisible(false);
          setSaveWorkflowAsTemplate(false);
          setBypassAuthenticationForDeployedApplication(false);
        }}
        centered
        wrapClassName="deploy-workflow-modal"
        footer={[
          <Button key="cancel" onClick={() => setIsDeployModalVisible(false)}>
            Cancel
          </Button>,
          <Button key="deploy" type="primary" loading={isDeploying} onClick={handleDeploy}>
            Deploy Workflow
          </Button>,
        ]}
      >
        <p>
          A workflow once deployed is not editable. You may optionally save this workflow as a
          reusable template for future use
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '10px' }}>
          <Checkbox
            checked={saveWorkflowAsTemplate}
            onChange={(e) => setSaveWorkflowAsTemplate(e.target.checked)}
          >
            Save as template
            <Tooltip
              title={
                'If checked, this workflow will be saved as a template that can be used ' +
                'as a starting point when creating new workflows.'
              }
            >
              <QuestionCircleOutlined style={{ color: '#666', marginLeft: '8px' }} />
            </Tooltip>
          </Checkbox>
        </div>
      </Modal>
    </>
  );
};

export default WorkflowNavigation;
