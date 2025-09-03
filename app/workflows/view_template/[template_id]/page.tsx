'use client';

import React, { useState } from 'react';
import { Button, Typography, Layout, Alert, Spin, Dropdown, Space, MenuProps } from 'antd';
import {
  DownOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useParams, useRouter } from 'next/navigation';
import WorkflowTemplateOverview from '@/app/components/workflows/WorkflowTemplateOverview';
import {
  useAddWorkflowMutation,
  useExportWorkflowTemplateMutation,
  useGetWorkflowTemplateByIdQuery,
} from '@/app/workflows/workflowsApi';
import CommonBreadCrumb from '@/app/components/CommonBreadCrumb';
import { resetEditor } from '@/app/workflows/editorSlice';
import { useAppDispatch } from '@/app/lib/hooks/hooks';
import DeleteWorkflowModal from '@/app/components/workflows/DeleteWorkflowModal';
import { useGlobalNotification } from '@/app/components/Notifications';
import { useRemoveWorkflowTemplateMutation } from '@/app/workflows/workflowsApi';
import { downloadAndSaveFile } from '@/app/lib/fileDownload';

const { Title } = Typography;

interface WorkflowTemplateContentProps {
  templateId: string;
}

const WorkflowTemplateContent: React.FC<WorkflowTemplateContentProps> = ({ templateId }) => {
  const { data: template, isLoading: loading } = useGetWorkflowTemplateByIdQuery(templateId);
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [removeWorkflowTemplate] = useRemoveWorkflowTemplateMutation();
  const notificationApi = useGlobalNotification();
  const [error, _setError] = useState<string | null>(null);
  const [isDeleteModalVisible, setDeleteModalVisible] = useState(false);
  const [addWorkflow] = useAddWorkflowMutation();
  const [exportWorkflowTemplate] = useExportWorkflowTemplateMutation();
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const templateName = template?.name;

  const handleDeleteTemplate = async () => {
    if (!template) {
      return;
    }

    try {
      await removeWorkflowTemplate({ id: template.id }).unwrap();
      notificationApi.success({
        message: 'Success',
        description: `Workflow template "${templateName}" deleted successfully.`,
        placement: 'topRight',
      });
      router.push('/workflows');
      setDeleteModalVisible(false);
    } catch (error: any) {
      notificationApi.error({
        message: 'Error',
        description: error.data?.error || 'Failed to delete workflow template.',
        placement: 'topRight',
      });
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      const tmp_file_path = await exportWorkflowTemplate({
        id: templateId as string,
      }).unwrap();
      await downloadAndSaveFile(tmp_file_path);
    } catch (error: any) {
      notificationApi.error({
        message: 'Error downloading template',
        description: error.message,
        placement: 'topRight',
      });
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleMenuClick: MenuProps['onClick'] = async ({ key }) => {
    if (!templateId) {
      return;
    }

    switch (key) {
      case 'create':
        try {
          const workflowId = await addWorkflow({
            workflow_template_id: templateId,
            name: `${templateName}`,
          }).unwrap();
          dispatch(resetEditor());
          router.push(`/workflows/create?workflowId=${workflowId}`);
          notificationApi.info({
            message: 'Draft Workflow Created',
            description: `Workflow template "${templateName}" copied to a new draft workflow.`,
            placement: 'topRight',
          });
        } catch (error: any) {
          notificationApi.error({
            message: 'Error',
            description: error.data?.error || 'Failed to create workflow from template.',
            placement: 'topRight',
          });
        }
        break;
      case 'download':
        await handleDownloadTemplate();
        break;
      case 'delete':
        setDeleteModalVisible(true);
        break;
    }
  };

  const menuItems: MenuProps['items'] = [
    {
      key: 'create',
      label: (
        <Space>
          <PlayCircleOutlined />
          Create Workflow from Template
        </Space>
      ),
    },
    {
      key: 'download',
      label: (
        <Space>
          <DownloadOutlined />
          {downloadingTemplate ? 'Downloading...' : 'Download Template'}
        </Space>
      ),
    },
    ...(!template?.pre_packaged
      ? [
          {
            key: 'delete',
            label: (
              <Space>
                <DeleteOutlined />
                Delete Template
              </Space>
            ),
          },
        ]
      : []),
  ];

  if (loading) {
    return (
      <Layout className="flex justify-center items-center h-screen">
        <Spin size="large" />
      </Layout>
    );
  }

  if (error) {
    return <Alert message="Error" description={error} type="error" showIcon className="m-4" />;
  }

  return (
    <>
      <Layout className="flex-1 p-4 md:p-6 lg:p-6 flex flex-col">
        <CommonBreadCrumb
          items={[{ title: 'Workflows', href: '/workflows' }, { title: 'View Template' }]}
        />
        <Layout className="flex flex-row items-center justify-between border-b border-gray-200 flex-grow-0 flex-shrink-0">
          <Title level={4} className="m-0">
            {template?.name || 'Unknown Template'}
          </Title>
          <Dropdown
            menu={{ items: menuItems, onClick: handleMenuClick }}
            trigger={['click']}
            placement="bottomRight"
          >
            <Button className="text-sm flex items-center gap-1">
              Actions <DownOutlined />
            </Button>
          </Dropdown>
        </Layout>
        <Layout className="mt-2.5">
          <WorkflowTemplateOverview workflowTemplateId={templateId as string} />
        </Layout>
        <DeleteWorkflowModal
          resourceType="workflowTemplate"
          visible={isDeleteModalVisible}
          onCancel={() => setDeleteModalVisible(false)}
          onDelete={handleDeleteTemplate}
          workflowId={undefined}
          workflowTemplateId={templateId as string}
        />
      </Layout>
    </>
  );
};

const WorkflowTemplatePage: React.FC = () => {
  const params = useParams();
  const templateId = Array.isArray(params?.template_id)
    ? params.template_id[0]
    : params?.template_id;

  if (!templateId) {
    return (
      <Alert
        message="Error"
        description="No template ID provided in the route."
        type="error"
        showIcon
      />
    );
  }

  return <WorkflowTemplateContent templateId={templateId} />;
};

export default WorkflowTemplatePage;
