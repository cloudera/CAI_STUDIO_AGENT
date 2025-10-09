'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import CommonBreadCrumb from '@/app/components/CommonBreadCrumb';
import { Layout } from 'antd';
import WorkflowAppTest from '@/app/components/workflowApp/WorkflowAppTest';

const TestWorkflowPage: React.FC = () => {
  const params = useParams();
  const workflowId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  if (!workflowId) {
    return <div>Invalid workflow ID</div>;
  }

  return (
    <Layout className="p-4 md:px-6 flex flex-col">
      <CommonBreadCrumb
        items={[{ title: 'Agentic Workflows', href: '/workflows' }, { title: 'Test Workflow' }]}
      />
      <WorkflowAppTest workflowId={workflowId} />
    </Layout>
  );
};

export default TestWorkflowPage;
