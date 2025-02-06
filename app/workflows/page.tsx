'use client';

import React, { useState } from 'react';
import { Button, Typography, Layout, Image, Modal } from 'antd';
import { ArrowRightOutlined, SyncOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation'; // Use Next.js router
import {
  useGetWorkflowMutation,
  useListWorkflowsQuery,
  useRemoveWorkflowMutation,
  useDeployWorkflowMutation,
  useListWorkflowTemplatesQuery,
  useAddWorkflowMutation,
  useRemoveWorkflowTemplateMutation,
} from './workflowsApi';
import WorkflowList from '../components/WorkflowList';
import { useListDeployedWorkflowsQuery, useUndeployWorkflowMutation } from './deployedWorkflowsApi';
import { resetEditor, updatedEditorStep } from './editorSlice';
import { useAppDispatch } from '../lib/hooks/hooks';
import { Workflow, DeployedWorkflow, WorkflowTemplateMetadata } from '@/studio/proto/agent_studio';
import DeleteDeployedWorkflowModal from '../components/DeleteDeployedWorkflowModal';
import DeleteWorkflowModal from '../components/DeleteWorkflowModal';
import CommonBreadCrumb from '../components/CommonBreadCrumb';
import { useListAgentsQuery, useListGlobalAgentTemplatesQuery } from '../agents/agentApi';
import NoDefaultModelModal from '../components/NoDefaultModelModal';
import { useGlobalNotification } from '../components/Notifications';
import WorkflowGetStartModal from '../components/WorkflowGetStartModal';
import { clearedWorkflowApp } from './workflowAppSlice';
import { useCheckStudioUpgradeStatusQuery, useUpgradeStudioMutation } from '../lib/crossCuttingApi';

const { Text, Title } = Typography;

const UpgradeModal: React.FC = () => {
  const [upgradeStudio] = useUpgradeStudioMutation();
  const [isOpen, setIsOpen] = useState(true);
  const notificationsApi = useGlobalNotification();

  const handleUpgrade = async () => {
    upgradeStudio();
    notificationsApi.info({
      message: 'Upgrade In Progress',
      description:
        'Agent Studio is upgrading in the background. Agent Studio will restart once upgrades are complete. During the upgrade, you may experience downtime using the Studio. Once the application restarts, you can refresh this page to see the upgraded Studio.',
      placement: 'topRight',
    });
    setIsOpen(false);
  };

  return (
    <>
      <Modal
        open={isOpen}
        onCancel={() => setIsOpen(false)}
        onClose={() => setIsOpen(false)}
        onOk={handleUpgrade}
        footer={[
          <Button key="cancel" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>,
          <Button key="upgrade" type="primary" onClick={handleUpgrade}>
            Upgrade
          </Button>,
        ]}
      >
        <Layout
          style={{
            background: 'transparent',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          <Title level={4}>
            Upgrade Agent Studio <SyncOutlined style={{ marginLeft: 12 }} />
          </Title>
          Your version of Agent Studio is out of date. Upgrading Agent Studio will pull down the
          most recent version into your project, and restart the main Agent Studio application. Your
          existing workflows will not be lost. Do you wish to continue?
        </Layout>
      </Modal>
    </>
  );
};

const ContactPage: React.FC = () => {
  const { data: workflows, refetch: refetchWorkflows } = useListWorkflowsQuery({});
  const { data: deployedWorkflowInstances, refetch: refetchDeployedWorkflowInstances } =
    useListDeployedWorkflowsQuery({});
  const { data: workflowTemplates, refetch: refetchWorkflowTemplates } =
    useListWorkflowTemplatesQuery({});
  const { data: agentTemplates } = useListGlobalAgentTemplatesQuery();
  const { data: agents } = useListAgentsQuery({});
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
  const [getWorkflow] = useGetWorkflowMutation();
  const [addWorkflow] = useAddWorkflowMutation();
  const notificationApi = useGlobalNotification();
  const [isGetStartModalVisible, setGetStartModalVisible] = useState(false);
  const { data: upgradeStatus } = useCheckStudioUpgradeStatusQuery();

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
        console.log('Checking for deployments:', {
          deployedWorkflowInstances,
          selectedWorkflowId: selectedWorkflow.workflow_id,
        });

        // Delete deployments first if they exist
        if (
          deployedWorkflowInstances?.some((dw) => dw.workflow_id === selectedWorkflow.workflow_id)
        ) {
          console.log('Found deployments to delete');
          try {
            const deploymentsToDelete = deployedWorkflowInstances.filter(
              (dw) => dw.workflow_id === selectedWorkflow.workflow_id,
            );

            console.log('Deployments to delete:', deploymentsToDelete);

            // Delete deployments one by one
            for (const deployment of deploymentsToDelete) {
              await undeployWorkflow({
                deployed_workflow_id: deployment.deployed_workflow_id,
              }).unwrap();
            }

            console.log('Successfully deleted deployments');
            await refetchDeployedWorkflowInstances();

            notificationApi.success({
              message: 'Success',
              description: 'Workflow deployments deleted successfully.',
              placement: 'topRight',
            });

            // Only proceed to delete workflow if deployments were successfully deleted
            console.log('Proceeding to delete workflow');
            await removeWorkflow({ workflow_id: selectedWorkflow.workflow_id }).unwrap();
            notificationApi.success({
              message: 'Success',
              description: 'Workflow and its deployments deleted successfully.',
              placement: 'topRight',
            });
            refetchWorkflows();
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
          console.log('No deployments found for workflow');
          await removeWorkflow({ workflow_id: selectedWorkflow.workflow_id }).unwrap();
          notificationApi.success({
            message: 'Success',
            description: 'Workflow deleted successfully.',
            placement: 'topRight',
          });
          refetchWorkflows();
          closeDeleteWorkflowModal();
        }
      } else if (selectedWorkflowTemplate) {
        await removeWorkflowTemplate({ id: selectedWorkflowTemplate.id }).unwrap();
        notificationApi.success({
          message: 'Success',
          description: 'Workflow template deleted successfully.',
          placement: 'topRight',
        });
        refetchWorkflowTemplates();
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
      refetchDeployedWorkflowInstances();
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
        padding: '16px 24px 22px',
        flexDirection: 'column',
        background: 'transparent',
      }}
    >
      {upgradeStatus?.out_of_date && <UpgradeModal />}
      <CommonBreadCrumb items={[{ title: 'Agentic Workflows' }]} />
      <NoDefaultModelModal />
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
          agents={agents || []}
          workflowTemplates={workflowTemplates || []}
          agentTemplates={agentTemplates || []}
          editWorkflow={editExistingWorkflow}
          deleteWorkflow={onDeleteWorkflow}
          deleteWorkflowTemplate={onDeleteWorkflowTemplate}
          testWorkflow={testWorkflow}
          onDeploy={onDeploy}
          onDeleteDeployedWorkflow={onDeleteDeployedWorkflow}
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

export default ContactPage;
