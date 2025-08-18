'use client';

import React, { Suspense, useEffect } from 'react';
import { Layout, Spin } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import WorkflowEditor from '@/app/components/workflowEditor/WorkflowEditor';
import LargeCenterSpin from '@/app/components/common/LargeCenterSpin';

/**
 * Wrapper around the workflow editor to handle ingesting search
 * params. The workflow editor is expectant of a workflow ID, so this
 * component ensures that a workflow ID is present before continuing. this
 * /workflows/create page should always be routed to with an existing workflow ID,
 * such as /workflows/create?workflowId=<workflowId>. For new workflows, a new
 * workflow should be created first and then the page should be routed to.
 */
const WorkflowCreateContent: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  const workflowId = searchParams.get('workflowId');

  useEffect(() => {
    if (!workflowId) {
      router.push('/workflows');
    }
  }, [workflowId, router]);

  if (!workflowId) {
    return <LargeCenterSpin message="No workflow ID found. Redirecting to workflows page..." />;
  }

  return <WorkflowEditor workflowId={workflowId} />;
};

/**
 * Workflow editor page. This page expects a workflow ID to be present in the
 * search params. If no workflow ID is present, the page will redirect to the
 * /workflows page.
 *
 * @returns
 */
const CreateWorkflowPage: React.FC = () => {
  return (
    <Suspense
      fallback={
        <Layout className="flex-1 justify-center items-center">
          <Spin size="large" />
        </Layout>
      }
    >
      <WorkflowCreateContent />
    </Suspense>
  );
};

export default CreateWorkflowPage;
