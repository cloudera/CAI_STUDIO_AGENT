'use client';

import React, { useState } from 'react';
import Layout from 'antd/lib/layout';
import { Button, Typography, Input, Image } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import ToolTemplateList from '../components/ToolTemplateList';
import {
  useListGlobalToolTemplatesQuery,
  useRemoveToolTemplateMutation,
  useAddToolTemplateMutation,
} from './toolTemplatesApi';
import NoDefaultModelModal from '../components/NoDefaultModelModal';
import CommonBreadCrumb from '../components/CommonBreadCrumb';
import { useRouter } from 'next/navigation';
import CreateToolTemplateModal from '../components/CreateToolTemplateModal';
import { useGlobalNotification } from '../components/Notifications'; // Assuming global notification

const { Text } = Typography;

const ToolsPage = () => {
  const { data: tools } = useListGlobalToolTemplatesQuery({});
  const [removeToolTemplate] = useRemoveToolTemplateMutation();
  const [addToolTemplate] = useAddToolTemplateMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const notificationApi = useGlobalNotification();
  const router = useRouter();

  const handleGenerateToolTemplate = async (toolName: string) => {
    try {
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
      console.log(response);

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

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const filteredTools = tools?.filter((tool) =>
    tool.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <>
      <Layout style={{ flex: 1, padding: '16px 24px 22px', flexDirection: 'column' }}>
        <CommonBreadCrumb items={[{ title: 'Tools Catalog' }]} />
        <NoDefaultModelModal />
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
            <Image src="/ic-brand-tools.svg" alt="Tool Template Icon" />
          </div>
          <Layout
            style={{
              background: 'transparent',
              flex: 1,
              marginLeft: '12px',
              flexDirection: 'column',
              display: 'flex',
            }}
          >
            <Text style={{ fontWeight: 600, fontSize: '18px' }}>Create Tool Template</Text>
            <Text style={{ fontWeight: 350 }}>
              Build custom Python tools to enhance your AI agents capabilities and supercharge your
              workflows.
            </Text>
          </Layout>
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
            onClick={() => setIsModalOpen(true)}
          >
            Create
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
        />
      </Layout>
    </>
  );
};

export default ToolsPage;
