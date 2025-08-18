'use client';

import React, { Suspense } from 'react';
import { Layout, Spin, Alert, Divider } from 'antd';
import { useGetWorkflowTemplateByIdQuery } from '@/app/workflows/workflowsApi';
import WorkflowTemplateDetails from './WorkflowTemplateDetails';
import ErrorBoundary from '../ErrorBoundary';
import WorkflowTemplateDiagramView from '../workflowApp/WorkflowTemplateDiagramView';

interface WorkflowTemplateOverviewProps {
  workflowTemplateId: string;
}

const WorkflowTemplateOverview: React.FC<WorkflowTemplateOverviewProps> = ({
  workflowTemplateId,
}) => {
  const {
    data: templateDetails,
    isLoading: loading,
    error,
  } = useGetWorkflowTemplateByIdQuery(workflowTemplateId);

  if (loading) {
    return (
      <ErrorBoundary fallback={<Alert message="Error loading template" type="error" />}>
        <Suspense fallback={<Spin size="large" />}>
          <Layout className="flex justify-center items-center h-screen">
            <Spin size="large" />
          </Layout>
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (error) {
    return (
      <ErrorBoundary fallback={<Alert message="Error loading template" type="error" />}>
        <Layout className="flex justify-center items-center h-screen">
          <Alert message="Error" description={JSON.stringify(error)} type="error" showIcon />
        </Layout>
      </ErrorBoundary>
    );
  }

  if (!templateDetails) {
    return (
      <ErrorBoundary fallback={<Alert message="Error loading template" type="error" />}>
        <Layout className="flex justify-center items-center h-screen">
          <Alert
            message="No Data"
            description="No template details available."
            type="info"
            showIcon
          />
        </Layout>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary fallback={<Alert message="Error loading template" type="error" />}>
      <Suspense fallback={<Spin size="large" />}>
        <Layout className="flex-1 flex flex-row bg-white rounded h-screen overflow-hidden">
          {/* Left Side: Template Details */}
          <Layout.Content className="bg-white overflow-y-auto overflow-x-hidden flex-auto w-2/5">
            <WorkflowTemplateDetails template={templateDetails} />
          </Layout.Content>

          <Divider type="vertical" className="h-full flex-grow-0 flex-shrink-0" />

          {/* Right Side: Workflow Diagram */}
          <Layout.Content className="bg-transparent flex-auto w-3/5 relative min-h-0">
            <WorkflowTemplateDiagramView template={templateDetails} />
          </Layout.Content>
        </Layout>
      </Suspense>
    </ErrorBoundary>
  );
};

export default WorkflowTemplateOverview;
