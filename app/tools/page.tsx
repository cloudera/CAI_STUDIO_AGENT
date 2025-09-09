'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Layout from 'antd/lib/layout';
import { Button, Typography, Image, Tabs, Spin } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import ToolTemplateList from '../components/ToolTemplateList';
import {
  useListGlobalToolTemplatesQuery,
  useRemoveToolTemplateMutation,
  useAddToolTemplateMutation,
} from './toolTemplatesApi';
import CommonBreadCrumb from '../components/CommonBreadCrumb';
import { useRouter, useSearchParams } from 'next/navigation';
import CreateToolTemplateModal from '../components/CreateToolTemplateModal';
import { useGlobalNotification } from '../components/Notifications'; // Assuming global notification
import RegisterMCPTemplateModal from '../components/RegisterMCPTemplateModal';
import {
  useRemoveMcpTemplateMutation,
  useAddMcpTemplateMutation,
  useListGlobalMcpTemplatesQuery,
} from '../mcp/mcpTemplatesApi';
import MCPTemplateList from '../components/MCPTemplateList';
import i18n from '../utils/i18n';
import LargeCenterSpin from '../components/common/LargeCenterSpin';

const { Text } = Typography;
const { TabPane } = Tabs;

const ToolsTabContent = () => {
  const {
    data: tools,
    isLoading: isToolsLoading,
    isFetching: _isToolsFetching,
  } = useListGlobalToolTemplatesQuery({});
  const [removeToolTemplate] = useRemoveToolTemplateMutation();
  const [addToolTemplate] = useAddToolTemplateMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, _setSearchQuery] = useState('');
  const [creatingTool, setCreatingTool] = useState(false);

  const notificationApi = useGlobalNotification();
  const router = useRouter();

  const handleGenerateToolTemplate = async (toolName: string) => {
    if (creatingTool) {
      return;
    }
    try {
      setCreatingTool(true);
      notificationApi.info({
        message: 'Adding Tool Template',
        description: 'Creating tool template...',
        placement: 'topRight',
      });

      // Call the addToolTemplate mutation and wait for the response
      const response = await addToolTemplate({
        tool_template_name: toolName,
        tmp_tool_image_path: '',
        workflow_template_id: '',
      }).unwrap();

      // Extract tool_template_id from the response
      const tool_template_id = response;

      // Notify success and close the modal
      notificationApi.success({
        message: 'Tool Template Created',
        description: 'Tool template has been successfully created.',
        placement: 'topRight',
      });

      // Navigate to the edit page for the newly created tool template
      if (tool_template_id) {
        router.push(`/tools/view/${tool_template_id}?edit=true`);
      } else {
        throw new Error('Tool template ID is missing in the response.');
      }
      setIsModalOpen(false);
    } catch (error: any) {
      const errorMessage = error.data?.error || error.message || 'Failed to create tool template.';
      notificationApi.error({
        message: 'Error',
        description: errorMessage,
        placement: 'topRight',
      });
    } finally {
      setCreatingTool(false);
    }
  };

  const deleteExistingTemplate = async (templateId: string) => {
    try {
      notificationApi.info({
        message: 'Deleting Tool Template',
        description: 'Sending delete request to Studio...',
        placement: 'topRight',
      });

      await removeToolTemplate({ tool_template_id: templateId }).unwrap();

      notificationApi.success({
        message: 'Delete Successful',
        description: 'The tool template has been deleted from Studio.',
        placement: 'topRight',
      });
    } catch (error: any) {
      const errorMessage = error.data?.error || 'Failed to delete tool template.';
      notificationApi.error({
        message: 'Delete Failed',
        description: errorMessage,
        placement: 'topRight',
      });
    }
  };

  const editExistingTemplate = (templateId: string) => {
    router.push(`/tools/view/${templateId}?edit=true`);
  };

  const filteredTools = tools?.filter((tool) =>
    tool.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (isToolsLoading) {
    return <LargeCenterSpin message="Loading tools..." />;
  }

  return (
    <>
      <Layout className="bg-white flex flex-row items-center justify-between flex-grow-0 p-4">
        <div className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden bg-yellow-100 m-0">
          <Image src="/ic-brand-tools.svg" alt="Tool Template Icon" />
        </div>
        <Layout className="bg-transparent flex-1 ml-3 flex-col flex">
          <Text className="font-semibold text-lg">{i18n.t('tools.createTemplate')}</Text>
          <Text className="font-light">{i18n.t('tools.createTemplateDesc')}</Text>
        </Layout>
        <Button
          type="primary"
          className="ml-5 mr-4 mt-5 mb-5 flex items-center justify-center gap-2 flex-row-reverse"
          icon={<ArrowRightOutlined />}
          onClick={() => setIsModalOpen(true)}
          loading={creatingTool}
          disabled={creatingTool}
        >
          {i18n.t('tools.create')}
        </Button>
      </Layout>
      &nbsp;
      <ToolTemplateList
        tools={filteredTools || []}
        editExistingTemplate={editExistingTemplate}
        deleteExistingTemplate={deleteExistingTemplate}
      />
      <CreateToolTemplateModal
        isOpen={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onGenerate={handleGenerateToolTemplate}
        loading={creatingTool}
      />
    </>
  );
};

const MCPTabContent = () => {
  const [addMcpTemplate] = useAddMcpTemplateMutation();
  const [removeMcpTemplate] = useRemoveMcpTemplateMutation();
  const [shouldPoll, setShouldPoll] = useState(false);
  const [creatingMcp, setCreatingMcp] = useState(false);

  const {
    data: mcps,
    isLoading: isMcpsLoading,
    isFetching: _isMcpsFetching,
  } = useListGlobalMcpTemplatesQuery(
    {},
    {
      pollingInterval: shouldPoll ? 3000 : 0,
    },
  );

  useEffect(() => {
    const hasValidatingTemplates = mcps?.some((mcp) => mcp.status === 'VALIDATING') || false;
    setShouldPoll(hasValidatingTemplates);
  }, [mcps]);

  const [isModalOpen, setIsModalOpen] = useState(false);

  const notificationApi = useGlobalNotification();

  const handleRegisterMCP = async (
    mcpName: string,
    mcpType: string,
    mcpArgs: string,
    envNames: string[],
    iconPath: string,
  ) => {
    if (creatingMcp) {
      return;
    }
    try {
      setCreatingMcp(true);
      notificationApi.info({
        message: 'Adding MCP Template',
        description: 'Registering MCP template...',
        placement: 'topRight',
      });

      const mcpArgsArray = mcpArgs
        .trim()
        .split(' ')
        .filter((arg) => arg.trim() !== '')
        .map((arg) => arg.trim());

      // Call the addToolTemplate mutation and wait for the response
      await addMcpTemplate({
        name: mcpName,
        type: mcpType,
        args: mcpArgsArray,
        env_names: envNames,
        tmp_mcp_image_path: iconPath,
      }).unwrap();

      // Notify success and close the modal
      notificationApi.success({
        message: 'MCP Registered',
        description: 'MCP template has been successfully registered.',
        placement: 'topRight',
      });

      setIsModalOpen(false);
    } catch (error: any) {
      const errorMessage = error.data?.error || error.message || 'Failed to register MCP template.';
      notificationApi.error({
        message: 'Error',
        description: errorMessage,
        placement: 'topRight',
      });
    } finally {
      setCreatingMcp(false);
    }
  };

  const deleteExistingMCPTemplate = async (mcpTemplateId: string) => {
    try {
      notificationApi.info({
        message: 'Deleting MCP Template',
        description: 'Sending delete request to Studio...',
      });

      await removeMcpTemplate({ mcp_template_id: mcpTemplateId }).unwrap();

      notificationApi.success({
        message: 'Delete Successful',
        description: 'The MCP template has been deleted from Studio.',
      });
    } catch (error: any) {
      const errorMessage = error.data?.error || 'Failed to delete MCP template.';
      notificationApi.error({
        message: 'Delete Failed',
        description: errorMessage,
      });
    }
  };

  if (isMcpsLoading) {
    return <LargeCenterSpin message="Loading MCP servers..." />;
  }

  return (
    <>
      <Layout className="bg-white flex flex-row items-center justify-between flex-grow-0 p-4">
        <div className="w-[66px] h-[66px] rounded-full flex items-center justify-center overflow-hidden bg-[#cdd5ff] m-0">
          <Image src="/mcp-icon.svg" alt="MCP Icon" className="p-3" />
        </div>
        <Layout className="bg-transparent flex-1 ml-3 flex-col flex">
          <Text className="font-semibold text-lg">{i18n.t('tools.registerMCP')}</Text>
          <Text className="font-light">
            {i18n.t('tools.registerMCPDesc')}{' '}
            <a
              href="https://modelcontextprotocol.io/introduction"
              target="_blank"
              rel="noopener noreferrer"
            >
              here
            </a>
            .
          </Text>
        </Layout>
        <Button
          type="primary"
          className="ml-5 mr-4 mt-5 mb-5 flex items-center justify-center gap-2 flex-row-reverse"
          icon={<ArrowRightOutlined />}
          onClick={() => setIsModalOpen(true)}
          loading={creatingMcp}
          disabled={creatingMcp}
        >
          {i18n.t('tools.register')}
        </Button>
      </Layout>
      &nbsp;
      <MCPTemplateList
        mcpTemplates={mcps || []}
        deleteExistingTemplate={deleteExistingMCPTemplate}
      />
      <RegisterMCPTemplateModal
        isOpen={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onRegister={handleRegisterMCP}
        loading={creatingMcp}
      />
    </>
  );
};

const ToolsPageContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const section: 'tools' | 'mcp' | null = searchParams.get('section') as 'tools' | 'mcp' | null;

  // Redirect to default section if none provided
  useEffect(() => {
    if (!section) {
      router.replace('/tools?section=tools');
      return;
    }
  }, [section, router]);

  const handleTabChange = (activeKey: string) => {
    router.push(`/tools?section=${activeKey}`);
  };

  if (!section) {
    return null;
  }

  return (
    <Layout className="flex-1 p-4 pt-4 pb-[22px] flex flex-col">
      <CommonBreadCrumb items={[{ title: i18n.t('tools.title') }]} />
      <Tabs activeKey={section} className="mt-0" onChange={handleTabChange}>
        <TabPane tab={i18n.t('tools.tabTools')} key="tools">
          <ToolsTabContent />
        </TabPane>
        <TabPane tab={i18n.t('tools.tabMCP')} key="mcp">
          <MCPTabContent />
        </TabPane>
      </Tabs>
    </Layout>
  );
};

const ToolsPage = () => {
  return (
    <Suspense fallback={<Spin size="large" />}>
      <ToolsPageContent />
    </Suspense>
  );
};

export default ToolsPage;
