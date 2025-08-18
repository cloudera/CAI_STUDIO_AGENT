'use client';

import React, { useState } from 'react';
import { Button, Typography, Layout, Alert, Image } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import AgentList from '../components/AgentList';
import { useListGlobalAgentTemplatesQuery, useRemoveAgentTemplateMutation } from './agentApi';
import CommonBreadCrumb from '../components/CommonBreadCrumb';
import { useGlobalNotification } from '../components/Notifications';

const { Text } = Typography;

const AgentsPage: React.FC = () => {
  const { data: agentTemplates, refetch } = useListGlobalAgentTemplatesQuery();
  const [removeAgentTemplate] = useRemoveAgentTemplateMutation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const notificationApi = useGlobalNotification();
  const router = useRouter();

  const handleGetStarted = () => {
    router.push('/agents/new');
  };

  const editExistingAgentTemplate = (templateId: string) => {
    router.push(`/agents/edit/${templateId}`);
  };

  const deleteExistingAgentTemplate = async (templateId: string) => {
    try {
      notificationApi.info({
        message: 'Deleting Agent Template',
        description: 'Deleting the agent template...',
        placement: 'topRight',
      });

      await removeAgentTemplate({ id: templateId }).unwrap();
      refetch();

      notificationApi.success({
        message: 'Agent Template Deleted',
        description: 'Agent template deleted successfully!',
        placement: 'topRight',
      });
    } catch (error: any) {
      const errorMessage = error?.data?.error || 'Failed to delete agent template.';
      setSubmitError(errorMessage);
      notificationApi.error({
        message: 'Error Deleting Agent Template',
        description: errorMessage,
        placement: 'topRight',
      });
    }
  };

  const testAgentTemplate = (templateId: string) => {
    router.push(`/agents/test/${templateId}`);
  };

  return (
    <Layout className="flex flex-1 flex-col pt-4 px-6 pb-[22px]">
      <CommonBreadCrumb items={[{ title: 'Agent Template Catalog' }]} />
      {submitError && (
        <Alert
          message="Error"
          description={submitError}
          type="error"
          showIcon
          closable
          onClose={() => setSubmitError(null)}
          className="mb-[10px]"
        />
      )}
      <Layout>
        <Layout className="bg-white flex flex-row items-center justify-between p-4 mb-2">
          {/* Icon */}
          <div className="w-[66px] h-[66px] rounded-full flex items-center justify-center overflow-hidden bg-[#e5ffe5] m-0">
            <Image src="/ic-brand-developer-engineer.svg" alt="Workflow Catalog Icon" />
          </div>
          {/* Descriptive Text */}
          <Layout className="bg-white flex-1 ml-3 flex flex-col">
            <Text className="font-semibold text-lg">Create Agent</Text>
            <Text className="font-normal">
              The Agent Template Catalog is your centralized hub for managing AI agent templates.
              Register new templates, edit existing ones, and organize them seamlessly. Build and
              optimize agent templates to enhance workflows with ease.
            </Text>
          </Layout>
          {/* Register New Model Button */}
          <Button
            className="ml-5 mr-4 my-5 flex items-center justify-center gap-2 flex-row-reverse"
            icon={<ArrowRightOutlined />}
            onClick={handleGetStarted}
          >
            Get Started
          </Button>
        </Layout>
        <AgentList
          agentTemplates={agentTemplates || []} // Pass `agentTemplates` correctly
          editExistingAgentTemplate={editExistingAgentTemplate}
          deleteExistingAgentTemplate={(templateId: string) => {
            deleteExistingAgentTemplate(templateId);
          }}
          testAgentTemplate={testAgentTemplate}
        />
      </Layout>
    </Layout>
  );
};

export default AgentsPage;
