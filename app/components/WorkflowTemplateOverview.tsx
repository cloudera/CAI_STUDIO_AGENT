'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { Layout, Spin, Alert, Divider } from 'antd';
import { useGetWorkflowTemplateMutation } from '@/app/workflows/workflowsApi';
import WorkflowTemplateDetails from './WorkflowTemplateDetails';
import { useAppDispatch } from '../lib/hooks/hooks';
import ErrorBoundary from './ErrorBoundary';
import { useListAllToolTemplatesQuery } from '../tools/toolTemplatesApi';
import { useListTaskTemplatesQuery } from '../tasks/tasksApi';
import { useListAllAgentTemplatesQuery } from '../agents/agentApi';
import WorkflowTemplateDiagramView from './workflow/WorkflowTemplateDiagramView';

interface WorkflowTemplateOverviewProps {
  workflowTemplateId: string;
}

const WorkflowTemplateOverview: React.FC<WorkflowTemplateOverviewProps> = ({ workflowTemplateId }) => {
  const [getWorkflowTemplate] = useGetWorkflowTemplateMutation();
  const [templateDetails, setTemplateDetails] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const dispatch = useAppDispatch();

  useEffect(() => {
    const fetchTemplate = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await getWorkflowTemplate({ id: workflowTemplateId }).unwrap();
        setTemplateDetails(response);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch template details.');
      } finally {
        setLoading(false);
      }
    };

    workflowTemplateId && fetchTemplate();
  }, [workflowTemplateId, getWorkflowTemplate]);

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
          <Alert message="Error" description={error} type="error" showIcon />
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
