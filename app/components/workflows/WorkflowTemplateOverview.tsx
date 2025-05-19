'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { Layout, Spin, Alert, Divider } from 'antd';
import {
  useGetWorkflowTemplateByIdQuery,
  useGetWorkflowTemplateMutation,
} from '@/app/workflows/workflowsApi';
import WorkflowTemplateDetails from './WorkflowTemplateDetails';
import { useAppDispatch } from '../../lib/hooks/hooks';
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
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (error) {
    return (
      <ErrorBoundary fallback={<Alert message="Error loading template" type="error" />}>
        <Layout
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
          }}
        >
          <Alert message="Error" description={JSON.stringify(error)} type="error" showIcon />
        </Layout>
      </ErrorBoundary>
    );
  }

  if (!templateDetails) {
    return (
      <ErrorBoundary fallback={<Alert message="Error loading template" type="error" />}>
        <Layout
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
          }}
        >
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
        <Layout
          style={{
            flex: 1,
            flexDirection: 'row',
            backgroundColor: 'white',
            borderRadius: 4,
            height: '100vh',
            overflow: 'hidden',
          }}
        >
          {/* Left Side: Template Details */}
          <Layout.Content
            style={{
              background: '#fff',
              overflowY: 'auto',
              overflowX: 'hidden',
              flex: '1 1 40%',
            }}
          >
            <WorkflowTemplateDetails template={templateDetails} />
          </Layout.Content>

          <Divider type="vertical" style={{ height: '100%', flexGrow: 0, flexShrink: 0 }} />

          {/* Right Side: Workflow Diagram */}
          <Layout.Content
            style={{
              background: 'transparent',
              flex: '1 1 60%',
              position: 'relative',
              minHeight: 0,
            }}
          >
            <WorkflowTemplateDiagramView template={templateDetails} />
          </Layout.Content>
        </Layout>
      </Suspense>
    </ErrorBoundary>
  );
};

export default WorkflowTemplateOverview;
