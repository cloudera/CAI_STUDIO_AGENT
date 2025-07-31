'use client';

import React, { useEffect, useState } from 'react';
import { Button, Typography, Layout, Image } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation'; // Use Next.js router
import {
  useListWorkflowsQuery,
  useRemoveWorkflowMutation,
  useListWorkflowTemplatesQuery,
  useAddWorkflowMutation,
  useRemoveWorkflowTemplateMutation,
} from './workflowsApi';
import WorkflowList from '../components/workflows/WorkflowList';
import { useListDeployedWorkflowsQuery, useUndeployWorkflowMutation } from './deployedWorkflowsApi';
import { resetEditor, updatedEditorStep } from './editorSlice';
import { useAppDispatch } from '../lib/hooks/hooks';
import { Workflow, DeployedWorkflow, WorkflowTemplateMetadata } from '@/studio/proto/agent_studio';
import DeleteDeployedWorkflowModal from '../components/workflows/DeleteDeployedWorkflowModal';
import DeleteWorkflowModal from '../components/workflows/DeleteWorkflowModal';
import CommonBreadCrumb from '../components/CommonBreadCrumb';
import { useGlobalNotification } from '../components/Notifications';
import WorkflowGetStartModal from '../components/workflows/WorkflowGetStartModal';
import { clearedWorkflowApp } from './workflowAppSlice';

import ContentWithHealthCheck from '../components/ContentWithHealthCheck';

const { Text, Title, Paragraph } = Typography;

const WorkflowsPageContent: React.FC = () => {
  const { data: workflows } = useListWorkflowsQuery({}, { refetchOnMountOrArgChange: true });
  const { data: deployedWorkflowInstances } = useListDeployedWorkflowsQuery(
    {},
    { pollingInterval: 10000 },
  );
  const { data: workflowTemplates } = useListWorkflowTemplatesQuery(
    {},
    { refetchOnMountOrArgChange: true },
  );
  const [removeWorkflow] = useRemoveWorkflowMutation();
  const [undeployWorkflow] = useUndeployWorkflowMutation();
  const [removeWorkflowTemplate] = useRemoveWorkflowTemplateMutation();
  const [isDeleteModalVisible, setDeleteModalVisible] = useState(false);
  const [isDeleteWorkflowModalVisible, setDeleteWorkflowModalVisible] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [selectedWorkflowTemplate, setSelectedWorkflowTemplate] =
    useState<WorkflowTemplateMetadata | null>(null);
  const [selectedDeployedWorkflow, setSelectedDeployedWorkflow] = useState<DeployedWorkflow | null>(
    null,
  );
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [addWorkflow] = useAddWorkflowMutation();
  const notificationApi = useGlobalNotification();
  const [isGetStartModalVisible, setGetStartModalVisible] = useState(false);

  const handleGetStarted = () => {
    setGetStartModalVisible(true);
  };

  const handleCreateWorkflow = async (name: string, templateId?: string) => {
    dispatch(resetEditor());
    dispatch(clearedWorkflowApp());
    try {
      const workflowId = await addWorkflow({
        name,
        workflow_template_id: templateId || undefined,
      }).unwrap();

      notificationApi.info({
        message: 'Draft Workflow Created',
        description: `New Draft workflow "${name}" has been created.`,
        placement: 'topRight',
      });

      setGetStartModalVisible(false);
      router.push(`/workflows/create?workflowId=${workflowId}`);
    } catch (error) {
      notificationApi.error({
        message: 'Error',
        description: 'Failed to create workflow.',
        placement: 'topRight',
      });
    }
  };

  const editExistingWorkflow = (workflowId: string) => {
    dispatch(resetEditor());
    dispatch(updatedEditorStep('Agents'));
    router.push(`/workflows/create?workflowId=${workflowId}`);
  };

  const testWorkflow = (workflowId: string) => {
    dispatch(resetEditor());
    dispatch(updatedEditorStep('Test'));
    router.push(`/workflows/create?workflowId=${workflowId}`);
  };

  const onDeleteWorkflow = (workflowId: string) => {
    const workflow = workflows?.find((w) => w.workflow_id === workflowId);
    if (workflow) {
      setSelectedWorkflow(workflow);
      setSelectedWorkflowTemplate(null);
      setDeleteWorkflowModalVisible(true);
    }
  };

  const onDeleteWorkflowTemplate = (workflowTemplateId: string) => {
    const workflowTemplate = workflowTemplates?.find((w) => w.id === workflowTemplateId);
    if (workflowTemplate) {
      setSelectedWorkflow(null);
      setSelectedWorkflowTemplate(workflowTemplate);
      setDeleteWorkflowModalVisible(true);
    }
  };

  const closeDeleteWorkflowModal = () => {
    setDeleteWorkflowModalVisible(false);
    setSelectedWorkflow(null);
    setSelectedWorkflowTemplate(null);
  };

  const handleDeleteWorkflowOrWorkflowTemplate = async () => {
    if (!selectedWorkflow && !selectedWorkflowTemplate) return;

    try {
      if (selectedWorkflow) {
        // Delete deployments first if they exist
        if (
          deployedWorkflowInstances?.some((dw) => dw.workflow_id === selectedWorkflow.workflow_id)
        ) {
          try {
            const deploymentsToDelete = deployedWorkflowInstances.filter(
              (dw) => dw.workflow_id === selectedWorkflow.workflow_id,
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

            await removeWorkflow({ workflow_id: selectedWorkflow.workflow_id }).unwrap();
            notificationApi.success({
              message: 'Success',
              description: 'Workflow and its deployments deleted successfully.',
              placement: 'topRight',
            });
            closeDeleteWorkflowModal();
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

          await removeWorkflow({ workflow_id: selectedWorkflow.workflow_id }).unwrap();
          notificationApi.success({
            message: 'Success',
            description: 'Workflow deleted successfully.',
            placement: 'topRight',
          });
          closeDeleteWorkflowModal();
        }
      } else if (selectedWorkflowTemplate) {
        await removeWorkflowTemplate({ id: selectedWorkflowTemplate.id }).unwrap();
        notificationApi.success({
          message: 'Success',
          description: 'Workflow template deleted successfully.',
          placement: 'topRight',
        });
        closeDeleteWorkflowModal();
      }
    } catch (error: any) {
      notificationApi.error({
        message: 'Error',
        description:
          error.data?.error ||
          `Failed to delete ${selectedWorkflowTemplate ? 'workflow template' : 'workflow'}.`,
        placement: 'topRight',
      });
    }
  };

  const onDeploy = (workflow: Workflow) => {
    dispatch(updatedEditorStep('Configure'));
    router.push(`/workflows/create?workflowId=${workflow.workflow_id}`);
  };

  const onDeleteDeployedWorkflow = (deployedWorkflow: DeployedWorkflow) => {
    setSelectedDeployedWorkflow(deployedWorkflow);
    setDeleteModalVisible(true);
  };

  const closeDeleteDeployedWorkflowModal = () => {
    setDeleteModalVisible(false);
    setSelectedDeployedWorkflow(null);
  };

  const handleDeleteDeployedWorkflow = async () => {
    if (!selectedDeployedWorkflow) return;

    try {
      await undeployWorkflow({
        deployed_workflow_id: selectedDeployedWorkflow.deployed_workflow_id,
      }).unwrap();
      closeDeleteDeployedWorkflowModal();
    } catch (error) {
      notificationApi.error({
        message: 'Error',
        description: 'Failed to delete deployed workflow.',
        placement: 'topRight',
      });
    }
  };

  return (
    <Layout
      style={{
        flex: 1,
        padding: '16px 24px 0px',
        flexDirection: 'column',
        background: 'transparent',
      }}
    >
      <CommonBreadCrumb items={[{ title: 'Agentic Workflows' }]} />
      <Layout>
        <Layout
          style={{
            background: '#fff',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexGrow: 0,
            padding: '16px',
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: '66px',
              height: '66px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              backgroundColor: '#fff4cd',
              margin: '0px',
            }}
          >
            <Image src="/ic-brand-algorithm.svg" alt="Workflow Catalog Icon" />
          </div>
          {/* Descriptive Text */}
          <Layout
            style={{
              background: 'transparent',
              flex: 1,
              marginLeft: '12px',
              flexDirection: 'column',
              display: 'flex',
            }}
          >
            <Text style={{ fontWeight: 600, fontSize: '18px' }}>Create Agentic Workflow</Text>
            <Text style={{ fontWeight: 350 }}>
              Orchestrate AI agents to collaborate on complex tasks, powered by custom tools and
              seamless workflow automation.
            </Text>
          </Layout>
          {/* Register New Workflow Button */}
          <Button
            type="primary"
            style={{
              marginLeft: '20px',
              marginRight: '16px',
              marginTop: '20px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              flexDirection: 'row-reverse',
            }}
            icon={<ArrowRightOutlined />}
            onClick={handleGetStarted}
          >
            Create
          </Button>
        </Layout>
        &nbsp;
        <WorkflowList
          workflows={workflows || []}
          deployedWorkflows={deployedWorkflowInstances || []}
          workflowTemplates={workflowTemplates || []}
          editWorkflow={editExistingWorkflow}
          deleteWorkflow={onDeleteWorkflow}
          deleteWorkflowTemplate={onDeleteWorkflowTemplate}
          testWorkflow={testWorkflow}
          onDeploy={onDeploy}
          onDeleteDeployedWorkflow={onDeleteDeployedWorkflow}
          onCreateWorkflow={handleCreateWorkflow}
          handleGetStarted={handleGetStarted}
        />
      </Layout>
      <DeleteDeployedWorkflowModal
        visible={isDeleteModalVisible}
        onCancel={closeDeleteDeployedWorkflowModal}
        onDelete={handleDeleteDeployedWorkflow}
      />
      <DeleteWorkflowModal
        resourceType={selectedWorkflowTemplate ? 'workflowTemplate' : 'workflow'}
        visible={isDeleteWorkflowModalVisible}
        onCancel={closeDeleteWorkflowModal}
        onDelete={handleDeleteWorkflowOrWorkflowTemplate}
        workflowId={selectedWorkflow?.workflow_id}
        workflowTemplateId={selectedWorkflowTemplate?.id}
      />
      <WorkflowGetStartModal
        visible={isGetStartModalVisible}
        onCancel={() => setGetStartModalVisible(false)}
        onCreateWorkflow={handleCreateWorkflow}
        workflowTemplates={workflowTemplates || []}
      />
    </Layout>
  );
};

// Explicitly run a health check on the workflows page. Technically we
// would need a health check on every page for maximum robustness, but given
// that the /workflows route is automatically pushed when opening the application,
// we should ensure this page is captured for health checks.
const WorkflowsPage: React.FC = () => {
  return (
    <>
      <ContentWithHealthCheck>
        <WorkflowsPageContent />
      </ContentWithHealthCheck>
    </>
  );
};

export default WorkflowsPage;
