'use client';

import React, { useEffect, useState } from 'react';
import { Button, Typography, Layout, Alert, Dropdown, Space, MenuProps } from 'antd';
import {
  DownOutlined,
  EditOutlined,
  DeleteOutlined,
  ExperimentOutlined,
  PlayCircleOutlined,
  CopyOutlined,
  DiffOutlined,
} from '@ant-design/icons';
import { useParams, useRouter } from 'next/navigation';
import WorkflowOverview from '@/app/components/workflows/WorkflowOverview';
import {
  useGetWorkflowMutation,
  useRemoveWorkflowMutation,
  useAddWorkflowTemplateMutation,
  useCloneWorkflowMutation,
} from '@/app/workflows/workflowsApi';
import CommonBreadCrumb from '@/app/components/CommonBreadCrumb';
import { updatedEditorStep } from '@/app/workflows/editorSlice';
import { useAppDispatch } from '@/app/lib/hooks/hooks';
import DeleteWorkflowModal from '@/app/components/workflows/DeleteWorkflowModal';
import CloneWorkflowModal from '@/app/components/workflows/DuplicateWorkflowModal';
import { useGlobalNotification } from '@/app/components/Notifications';
import { Workflow } from '@/studio/proto/agent_studio';
import {
  useListDeployedWorkflowsQuery,
  useUndeployWorkflowMutation,
} from '@/app/workflows/deployedWorkflowsApi';
import LargeCenterSpin from '@/app/components/common/LargeCenterSpin';

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
  const [cloneWorkflow] = useCloneWorkflowMutation();
  const notificationApi = useGlobalNotification();
  const [workflowName, setWorkflowName] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteWorkflowModalVisible, setDeleteWorkflowModalVisible] = useState(false);
  const [isCloneWorkflowModalVisible, setCloneWorkflowModalVisible] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const { data: deployedWorkflows } = useListDeployedWorkflowsQuery({});
  const [undeployWorkflow] = useUndeployWorkflowMutation();
  const [addWorkflowTemplate] = useAddWorkflowTemplateMutation();

  useEffect(() => {
    if (!workflowId) {
      return;
    }

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
    if (!workflow) {
      return;
    }

    try {
      // Delete deployments first if they exist
      if (deployedWorkflows?.some((dw) => dw.workflow_id === workflow.workflow_id)) {
        try {
          const deploymentsToDelete = deployedWorkflows.filter(
            (dw) => dw.workflow_id === workflow.workflow_id,
          );

          // Delete deployments one by one
          for (const deployment of deploymentsToDelete) {
            await undeployWorkflow({
              deployed_workflow_id: deployment.deployed_workflow_id,
            }).unwrap();
          }

          notificationApi.success({
            message: 'Success',
            description: 'Workflow deployments deleted successfully.',
            placement: 'topRight',
          });

          // Only proceed to delete workflow if deployments were successfully deleted

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

  const handleCloneWorkflow = async (newWorkflowName: string) => {
    if (!workflowId) {
      return;
    }

    try {
      setIsCloning(true);
      const newWorkflowId = await cloneWorkflow({
        workflow_id: workflowId,
        name: newWorkflowName,
      }).unwrap();

      notificationApi.success({
        message: 'Success',
        description: `Workflow duplicated successfully as "${newWorkflowName}".`,
        placement: 'topRight',
      });

      // Redirect to the new workflow
      router.push(`/workflows/view/${newWorkflowId}`);
      setCloneWorkflowModalVisible(false);
    } catch (error: any) {
      notificationApi.error({
        message: 'Error',
        description: error.data?.error || 'Failed to clone workflow.',
        placement: 'topRight',
      });
    } finally {
      setIsCloning(false);
    }
  };

  const handleMenuClick: MenuProps['onClick'] = async ({ key }) => {
    if (!workflowId) {
      return;
    }

    switch (key) {
      case 'edit':
        dispatch(updatedEditorStep('Agents'));
        router.push(`/workflows/create?workflowId=${workflowId}`);
        break;
      case 'delete':
        setDeleteWorkflowModalVisible(true);
        break;
      case 'duplicate':
        setCloneWorkflowModalVisible(true);
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
    if (!workflow || !deployedWorkflows) {
      return false;
    }
    return deployedWorkflows.some(
      (deployedWorkflow) => deployedWorkflow.workflow_id === workflow.workflow_id,
    );
  };

  const menuItems: MenuProps['items'] = [
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
          {isWorkflowDeployed() ? 'Redeploy Workflow' : 'Deploy Workflow'}
        </Space>
      ),
    },
    {
      key: 'clone',
      label: (
        <Space>
          <DiffOutlined />
          Clone Workflow
        </Space>
      ),
    },
    {
      key: 'create-template',
      label: (
        <Space>
          <CopyOutlined />
          Create Template
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
    return <LargeCenterSpin message="Loading workflow..." />;
  }

  if (error) {
    return <Alert message="Error" description={error} type="error" showIcon className="m-4" />;
  }

  return (
    <Layout className="flex-1 p-4 md:p-6 lg:p-6 flex flex-col">
      <CommonBreadCrumb
        items={[{ title: 'Agentic Workflows', href: '/workflows' }, { title: 'View Workflow' }]}
      />
      <Layout className="flex flex-row items-center justify-between border-b border-gray-200 flex-grow-0 flex-shrink-0">
        {/* Workflow Name */}
        <Title level={4} className="m-0">
          {workflowName || 'Unknown Workflow'}
        </Title>
        {/* Action Menu */}
        <Dropdown
          menu={{ items: menuItems, onClick: handleMenuClick }}
          trigger={['click']}
          placement="bottomRight"
        >
          <Button className="text-sm flex items-center gap-1">
            Actions <DownOutlined /> {/* Rotate the icon to face downwards */}
          </Button>
        </Dropdown>
      </Layout>
      <Layout className="mt-2.5">
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
      <CloneWorkflowModal
        visible={isCloneWorkflowModalVisible}
        onCancel={() => setCloneWorkflowModalVisible(false)}
        onClone={handleCloneWorkflow}
        originalWorkflowName={workflowName || 'Unknown Workflow'}
        loading={isCloning}
      />
    </Layout>
  );
};

export default WorkflowPage;
