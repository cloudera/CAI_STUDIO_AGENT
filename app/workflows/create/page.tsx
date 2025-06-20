'use client';

// app/contact/page.tsx
import React, { Suspense, useEffect, useState } from 'react';
import { Button, Input, Layout, Spin } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import WorkflowEditorAgentView from '@/app/components/workflowEditor/WorkflowEditorAgentView';
import { Typography } from 'antd/lib';
import { useAppSelector, useAppDispatch } from '@/app/lib/hooks/hooks';
import {
  updatedEditorWorkflowFromExisting,
  selectEditorCurrentStep,
  selectEditorWorkflowId,
  selectEditorWorkflowName,
  updatedWorkflowConfiguration,
  updatedEditorWorkflowName,
  selectEditorWorkflow,
} from '../editorSlice';
import WorkflowApp from '@/app/components/workflowApp/WorkflowApp';
import WorkflowStepView from '@/app/components/workflowEditor/WorkflowStepView';
import WorkflowNavigation from '@/app/components/workflowEditor/WorkflowNavigation';
import { Workflow } from '@/studio/proto/agent_studio';
import { useGetWorkflowMutation, useUpdateWorkflowMutation } from '../workflowsApi';
import WorkflowEditorTaskView from '@/app/components/workflowEditor/WorkflowEditorTaskView';
import WorkflowOverview from '@/app/components/workflows/WorkflowOverview';
import CommonBreadCrumb from '@/app/components/CommonBreadCrumb';
import WorkflowEditorConfigureView from '@/app/components/workflowEditor/WorkflowEditorConfigureView';
import { clearedWorkflowApp } from '../workflowAppSlice';
import { readWorkflowConfigurationFromLocalStorage } from '@/app/lib/localStorage';
import { EditOutlined, SaveOutlined } from '@ant-design/icons';
import { useGlobalNotification } from '@/app/components/Notifications';
import { createUpdateRequestFromEditor } from '@/app/lib/workflow';
import WorkflowAppTest from '@/app/components/workflowApp/WorkflowAppTest';

const { Title } = Typography;

const CreateWorkflowContent: React.FC = () => {
  // If we are editing an existing workflow, let's check. This is the
  // ONLY TIME that we should use our search param. After this, the workflowId
  // will be stored in Redux and that Redux workflowId should be used.
  //
  // TODO: add consistency to how we route in pages. Most of Agent Studio routes
  // with slug paths, not search params. We should consider migrating to path routing here as well.
  const searchParams = useSearchParams();
  const workflowId = useAppSelector(selectEditorWorkflowId);
  const workflowName = useAppSelector(selectEditorWorkflowName);
  const currentStep = useAppSelector(selectEditorCurrentStep);
  const dispatch = useAppDispatch();
  const [getWorkflow] = useGetWorkflowMutation();
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [updateWorkflow] = useUpdateWorkflowMutation();
  const notificationApi = useGlobalNotification();
  const workflowState = useAppSelector(selectEditorWorkflow);

  // Clear the existing workflow app upon first load. Note: the "Workflow App"
  // in the context of the workflow editor is just the Test page (for now, until
  // we get customizable frontend apps to be an option)
  useEffect(() => {
    dispatch(clearedWorkflowApp());
  }, []);

  // We are routed here via search params. If that's the case, populate the
  // initial workflow editor with all of the information that we need.
  useEffect(() => {
    // Initially populate the redux editor state with this workflow. Also
    // preset all workflow configurations, which are stored in local storage.
    const populateWorkflow = async (workflowId: string) => {
      // Update aspects about our workflow to redux.
      const workflow: Workflow = await getWorkflow({ workflow_id: workflowId }).unwrap();
      dispatch(updatedEditorWorkflowFromExisting(workflow));

      // Load workflow configuration from local storage.
      const workflowConfiguration = readWorkflowConfigurationFromLocalStorage(workflowId);

      // Initialize redux state with this configuration.
      dispatch(updatedWorkflowConfiguration(workflowConfiguration));

      // Send one update workflow request to ensure that the workflow is in a
      // valid state and trigger tool venv updates.
      await updateWorkflow({
        workflow_id: workflowId,
        name: workflow.name,
        description: workflow.description,
        is_conversational: workflow.is_conversational,
        crew_ai_workflow_metadata: workflow.crew_ai_workflow_metadata,
      }).unwrap();
    };

    const searchWorkflowId = searchParams.get('workflowId');
    if (searchWorkflowId && Boolean(searchWorkflowId?.trim())) {
      populateWorkflow(searchWorkflowId);
    }
  }, [searchParams.get('workflowId')]);

  const handleSaveWorkflowName = async () => {
    const currentWorkflowName = workflowName || '';
    if (!workflowId || !currentWorkflowName.trim()) {
      setIsEditing(false);
      return;
    }

    try {
      notificationApi.info({
        message: 'Updating Workflow',
        description: 'Saving workflow name changes...',
        placement: 'topRight',
      });

      const updatedWorkflowState = {
        ...workflowState,
        name: currentWorkflowName,
        workflowMetadata: {
          ...workflowState.workflowMetadata,
          name: currentWorkflowName,
        },
      };

      await updateWorkflow(createUpdateRequestFromEditor(updatedWorkflowState)).unwrap();

      notificationApi.success({
        message: 'Workflow Updated',
        description: 'Workflow name has been updated successfully.',
        placement: 'topRight',
      });

      setIsEditing(false);
    } catch (error) {
      notificationApi.error({
        message: 'Error Updating Workflow',
        description: 'Failed to update workflow name. Please try again.',
        placement: 'topRight',
      });
    }
  };

  if (!workflowId) {
    // TODO: gracefully handle not selecting a workflow
    return (
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}
      >
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Layout
      style={{
        flex: 1,
        padding: '16px 24px 22px',
        flexDirection: 'column',
      }}
    >
      <CommonBreadCrumb
        items={[
          { title: 'Agentic Workflows', href: '/workflows' },
          { title: workflowId ? 'Edit Workflow' : 'Create Workflow' },
        ]}
      />
      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        {isEditing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
            <Input
              size="large"
              value={workflowName}
              onChange={(e) => {
                dispatch(updatedEditorWorkflowName(e.target.value));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveWorkflowName();
                } else if (e.key === 'Escape') {
                  setIsEditing(false);
                }
              }}
              style={{ width: '50%' }}
              autoFocus
            />
            <Button
              icon={<SaveOutlined />}
              type="primary"
              onClick={(e) => {
                e.preventDefault();
                handleSaveWorkflowName();
              }}
            />
          </div>
        ) : (
          <>
            <Title level={5} style={{ paddingTop: 4, fontSize: '18px', fontWeight: 600 }}>
              {workflowId ? 'Workflow: ' + workflowName : 'Create Workflow'}
            </Title>
            <Button
              icon={<EditOutlined />}
              type="text"
              style={{ marginLeft: '8px' }}
              onClick={() => setIsEditing(true)}
            />
          </>
        )}
      </div>
      <div style={{ marginBottom: '8px' }} />
      <Layout
        style={{
          flex: 1,
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        <WorkflowStepView />
        {currentStep === 'Agents' ? (
          <WorkflowEditorAgentView workflowId={workflowId} />
        ) : currentStep === 'Tasks' ? (
          <WorkflowEditorTaskView workflowId={workflowId} />
        ) : currentStep === 'Configure' ? (
          <WorkflowEditorConfigureView workflowId={workflowId} />
        ) : currentStep === 'Test' ? (
          <WorkflowAppTest workflowId={workflowId} />
        ) : (
          <WorkflowOverview workflowId={workflowId} />
        )}
        <WorkflowNavigation workflowId={workflowId} />
      </Layout>
    </Layout>
  );
};

const CreateWorkflowPage: React.FC = () => {
  return (
    <Suspense
      fallback={
        <Layout style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Spin size="large" />
        </Layout>
      }
    >
      {/* Suspense now wraps the component that uses useSearchParams */}
      <CreateWorkflowContent />
    </Suspense>
  );
};

export default CreateWorkflowPage;
