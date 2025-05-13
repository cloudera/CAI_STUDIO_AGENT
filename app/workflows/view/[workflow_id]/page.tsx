'use client';

import React, { useEffect, useState } from 'react';
import { Button, Typography, Layout, Alert, Spin, Dropdown, Space, MenuProps } from 'antd';
import {
  DownOutlined,
  EditOutlined,
  DeleteOutlined,
  ExperimentOutlined,
  PlayCircleOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { useParams, useRouter } from 'next/navigation';
import WorkflowOverview from '@/app/components/workflows/WorkflowOverview';
import {
  useGetWorkflowMutation,
  useRemoveWorkflowMutation,
  useDeployWorkflowMutation,
  useAddWorkflowTemplateMutation,
} from '@/app/workflows/workflowsApi';
import CommonBreadCrumb from '@/app/components/CommonBreadCrumb';
import { resetEditor, updatedEditorStep } from '@/app/workflows/editorSlice';
import { useAppDispatch } from '@/app/lib/hooks/hooks';
import DeleteWorkflowModal from '@/app/components/workflows/DeleteWorkflowModal';
import { useGlobalNotification } from '@/app/components/Notifications';
import { Workflow } from '@/studio/proto/agent_studio';
import {
  useListDeployedWorkflowsQuery,
  useUndeployWorkflowMutation,
} from '@/app/workflows/deployedWorkflowsApi';

const { Title } = Typography;

const WorkflowPage: React.FC = () => {
  const params = useParams(); // Gets dynamic route params
  const workflowId = Array.isArray(params?.workflow_id)
    ? params.workflow_id[0]
    : params?.workflow_id; // Ensure workflowId is a string

  const router = useRouter();
  const dispatch = useAppDispatch();
  const [getWorkflow] = useGetWorkflowMutation();
  const [removeWorkflow] = useRemoveWorkflowMutation();
  const [deployWorkflow] = useDeployWorkflowMutation();
  const notificationApi = useGlobalNotification();
  const [workflowName, setWorkflowName] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteWorkflowModalVisible, setDeleteWorkflowModalVisible] = useState(false);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const { data: deployedWorkflows } = useListDeployedWorkflowsQuery({});
  const [undeployWorkflow] = useUndeployWorkflowMutation();
  const [addWorkflowTemplate] = useAddWorkflowTemplateMutation();

  useEffect(() => {
    if (!workflowId) return;

    const fetchWorkflowName = async () => {
      setLoading(true);
      setError(null);
      try {
        const workflowData = await getWorkflow({ workflow_id: workflowId }).unwrap();
        setWorkflow(workflowData);
        setWorkflowName(workflowData.name);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch workflow name.');
      } finally {
        setLoading(false);
      }
    };

    fetchWorkflowName();
  }, [workflowId, getWorkflow]);

  const handleDeleteWorkflow = async () => {
    if (!workflow) return;

    try {
      console.log('Checking for deployments:', {
        deployedWorkflows,
        workflowId: workflow.workflow_id,
      });

      // Delete deployments first if they exist
      if (deployedWorkflows?.some((dw) => dw.workflow_id === workflow.workflow_id)) {
        console.log('Found deployments to delete');
        try {
          const deploymentsToDelete = deployedWorkflows.filter(
            (dw) => dw.workflow_id === workflow.workflow_id,
          );

          console.log('Deployments to delete:', deploymentsToDelete);

          // Delete deployments one by one
          for (const deployment of deploymentsToDelete) {
            await undeployWorkflow({
              deployed_workflow_id: deployment.deployed_workflow_id,
            }).unwrap();
          }

          console.log('Successfully deleted deployments');

          notificationApi.success({
            message: 'Success',
            description: 'Workflow deployments deleted successfully.',
            placement: 'topRight',
          });

          // Only proceed to delete workflow if deployments were successfully deleted
          console.log('Proceeding to delete workflow');
          await removeWorkflow({ workflow_id: workflow.workflow_id }).unwrap();
          notificationApi.success({
            message: 'Success',
            description: 'Workflow and its deployments deleted successfully.',
            placement: 'topRight',
          });
          router.push('/workflows');
          setDeleteWorkflowModalVisible(false);
        } catch (error: any) {
          console.error('Error deleting deployments:', error);
          notificationApi.error({
            message: 'Error',
            description: error.data?.error || 'Failed to delete workflow deployments.',
            placement: 'topRight',
          });
          return;
        }
      } else {
        // No deployments - just delete the workflow
        console.log('No deployments found for workflow');
        await removeWorkflow({ workflow_id: workflow.workflow_id }).unwrap();
        notificationApi.success({
          message: 'Success',
          description: 'Workflow deleted successfully.',
          placement: 'topRight',
        });
        router.push('/workflows');
        setDeleteWorkflowModalVisible(false);
      }
    } catch (error: any) {
      notificationApi.error({
        message: 'Error',
        description: error.data?.error || 'Failed to delete workflow.',
        placement: 'topRight',
      });
    }
  };

  const handleMenuClick: MenuProps['onClick'] = async ({ key }) => {
    if (!workflowId) return;

    switch (key) {
      case 'edit':
        dispatch(updatedEditorStep('Agents'));
        router.push(`/workflows/create?workflowId=${workflowId}`);
        break;
      case 'delete':
        setDeleteWorkflowModalVisible(true);
        break;
      case 'test':
        dispatch(updatedEditorStep('Test'));
        router.push(`/workflows/create?workflowId=${workflowId}`);
        break;
      case 'deploy':
        dispatch(updatedEditorStep('Configure'));
        router.push(`/workflows/create?workflowId=${workflowId}`);
        break;
      case 'clone':
        await addWorkflowTemplate({
          workflow_id: workflowId,
          agent_template_ids: [], // TODO: make optional
          task_template_ids: [], // TODO: make optional
        });
        notificationApi.success({
          message: 'Workflow Template Created',
          description: `Success! Workflow "${workflow?.name}" copied to a workflow template.`,
          placement: 'topRight',
        });
        router.push(`/workflows`);
        break;
      default:
        break;
    }
  };

  const isWorkflowDeployed = () => {
    if (!workflow || !deployedWorkflows) return false;
    return deployedWorkflows.some(
      (deployedWorkflow) => deployedWorkflow.workflow_id === workflow.workflow_id,
    );
  };

  const menuItems: MenuProps['items'] = isWorkflowDeployed()
    ? [
        {
          key: 'clone',
          label: (
            <Space>
              <CopyOutlined />
              Clone to Template
            </Space>
          ),
        },
        {
          key: 'delete',
          label: (
            <Space>
              <DeleteOutlined />
              Delete Workflow
            </Space>
          ),
        },
      ]
    : [
        {
          key: 'edit',
          label: (
            <Space>
              <EditOutlined />
              Edit Workflow
            </Space>
          ),
        },
        {
          key: 'test',
          label: (
            <Space>
              <ExperimentOutlined />
              Test Workflow
            </Space>
          ),
        },
        {
          key: 'deploy',
          label: (
            <Space>
              <PlayCircleOutlined />
              Deploy Workflow
            </Space>
          ),
        },
        {
          key: 'delete',
          label: (
            <Space>
              <DeleteOutlined />
              Delete Workflow
            </Space>
          ),
        },
        {
          key: 'clone',
          label: (
            <Space>
              <CopyOutlined />
              Clone to Template
            </Space>
          ),
        },
      ];

  if (!workflowId) {
    return (
      <Alert
        message="Error"
        description="No workflow ID provided in the route."
        type="error"
        showIcon
      />
    );
  }

  if (loading) {
    return (
      <Layout
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
        }}
      >
        <Spin size="large" />
      </Layout>
    );
  }

  if (error) {
    return (
      <Alert
        message="Error"
        description={error}
        type="error"
        showIcon
        style={{
          margin: '16px',
        }}
      />
    );
  }

  return (
    <Layout style={{ flex: 1, padding: '16px 24px 22px', flexDirection: 'column' }}>
      <CommonBreadCrumb
        items={[{ title: 'Agentic Workflows', href: '/workflows' }, { title: 'View Workflow' }]}
      />
      <Layout
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
          flexGrow: 0,
          flexShrink: 0,
        }}
      >
        {/* Workflow Name */}
        <Title level={4} style={{ margin: 0 }}>
          {workflowName || 'Unknown Workflow'}
        </Title>
        {/* Action Menu */}
        <Dropdown
          menu={{ items: menuItems, onClick: handleMenuClick }}
          trigger={['click']}
          placement="bottomRight"
        >
          <Button
            style={{
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px', // Spacing between text and arrow
            }}
          >
            Actions <DownOutlined /> {/* Rotate the icon to face downwards */}
          </Button>
        </Dropdown>
      </Layout>
      <Layout
        style={{
          marginTop: '10px',
        }}
      >
        <WorkflowOverview workflowId={workflowId} />
      </Layout>
      <DeleteWorkflowModal
        resourceType="workflow"
        visible={isDeleteWorkflowModalVisible}
        onCancel={() => setDeleteWorkflowModalVisible(false)}
        onDelete={handleDeleteWorkflow}
        workflowId={workflowId as string}
        workflowTemplateId={undefined}
      />
    </Layout>
  );
};

export default WorkflowPage;
