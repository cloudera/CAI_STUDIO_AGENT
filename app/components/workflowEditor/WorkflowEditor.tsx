import React, { useEffect } from 'react';
import { Layout } from 'antd';
import WorkflowEditorAgentView from '@/app/components/workflowEditor/WorkflowEditorAgentView';
import { useAppSelector, useAppDispatch } from '@/app/lib/hooks/hooks';
import {
  updatedEditorWorkflowFromExisting,
  selectEditorCurrentStep,
  updatedWorkflowConfiguration,
} from '@/app/workflows/editorSlice';
import WorkflowStepView from '@/app/components/workflowEditor/WorkflowStepView';
import WorkflowNavigation from '@/app/components/workflowEditor/WorkflowNavigation';
import { Workflow } from '@/studio/proto/agent_studio';
import { useGetWorkflowMutation, useUpdateWorkflowMutation } from '@/app/workflows/workflowsApi';
import WorkflowEditorTaskView from '@/app/components/workflowEditor/WorkflowEditorTaskView';
import WorkflowOverview from '@/app/components/workflows/WorkflowOverview';
import CommonBreadCrumb from '@/app/components/CommonBreadCrumb';
import WorkflowEditorConfigureView from '@/app/components/workflowEditor/WorkflowEditorConfigureView';
import { clearedWorkflowApp } from '@/app/workflows/workflowAppSlice';
import { readWorkflowConfigurationFromLocalStorage } from '@/app/lib/localStorage';
import WorkflowAppTest from '@/app/components/workflowApp/WorkflowAppTest';
import LargeCenterSpin from '@/app/components/common/LargeCenterSpin';
import WorkflowEditorName from '@/app/components/workflowEditor/WorkflowEditorName';
import WorkflowAddToolModal from './WorkflowAddToolModal';

export interface WorkflowEditorProps {
  workflowId: string;
}

/**
 * Main workflow editor component. The editor is
 * active for any one workflow at a given time. For that reason,
 * the only requirement for a workflow editor to work is the workflow ID.
 * Everything else is handled by the redux store.
 */
const WorkflowEditor: React.FC<WorkflowEditorProps> = ({ workflowId }) => {
  const currentStep = useAppSelector(selectEditorCurrentStep);
  const dispatch = useAppDispatch();
  const [getWorkflow] = useGetWorkflowMutation();
  const [updateWorkflow] = useUpdateWorkflowMutation();

  // Clear the existing workflow app upon component mount. Note: the "Workflow App"
  // in the context of the workflow editor is just the Test page.
  useEffect(() => {
    dispatch(clearedWorkflowApp());
  }, []);

  // Populate the initial workflow editor with all of the information that we need.
  useEffect(() => {
    // Initially populate the redux editor state with this workflow. Also
    // preset all workflow configurations, which are stored in local storage.
    const populateWorkflowEditor = async (workflowId: string) => {
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

    // Only configure if we have a valid workflow ID.
    if (workflowId && Boolean(workflowId.trim())) {
      populateWorkflowEditor(workflowId);
    }
  }, [workflowId]);

  // If we don't have a workflow ID, we can't render the workflow editor.
  if (!workflowId) {
    return <LargeCenterSpin />;
  }

  /**
   * List of global modals to conditionally render based on redux store.
   * Eventually, all workflow editor modals should be moved to this component
   * and controlled via redux.
   */
  const GlobalModals: React.FC = () => {
    return (
      <>
        <WorkflowAddToolModal workflowId={workflowId} />
      </>
    );
  };

  return (
    <Layout className="flex-1 p-4 md:p-6 lg:p-6 flex flex-col">
      <GlobalModals />
      <CommonBreadCrumb
        items={[
          { title: 'Agentic Workflows', href: '/workflows' },
          { title: workflowId ? 'Edit Workflow' : 'Create Workflow' },
        ]}
      />
      <Layout className="flex-1 flex flex-col gap-6">
        <WorkflowEditorName workflowId={workflowId} />
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

export default WorkflowEditor;
