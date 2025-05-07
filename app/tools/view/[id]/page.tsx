'use client';

import React, { useEffect, useState } from 'react';
import { Button, Typography, Layout, Alert, Spin, Dropdown, Space, MenuProps, Modal } from 'antd';
import { useParams, useSearchParams } from 'next/navigation';
import ToolViewOrEdit from '@/app/components/ToolViewOrEdit';
import {
  useGetToolTemplateMutation,
  useRemoveToolTemplateMutation,
  useUpdateToolTemplateMutation,
} from '@/app/tools/toolTemplatesApi';
import CommonBreadCrumb from '@/app/components/CommonBreadCrumb';
import { useRouter } from 'next/navigation';
import { useGlobalNotification } from '@/app/components/Notifications'; // Assuming this exists
import { ToolTemplate } from '@/studio/proto/agent_studio';
import { useImageAssetsData } from '@/app/lib/hooks/useAssetData';
import { DeleteOutlined, DownOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';

const { Title } = Typography;

const DeleteToolModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  toolDetails: ToolTemplate | null;
  onDelete: () => Promise<void>;
}> = ({ isOpen, onClose, toolDetails, onDelete }) => {
  return (
    <Modal
      title={`Are you sure you'd like to delete ${toolDetails?.name}?`}
      open={isOpen}
      onCancel={onClose}
      okText="Delete"
      okButtonProps={{ danger: true }}
      cancelText="Cancel"
      onOk={onDelete}
    />
  );
};

const ToolViewPage: React.FC = () => {
  const params = useParams();
  const searchParams = useSearchParams();
  const toolId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const isEditMode = searchParams.get('edit') === 'true';

  const [getTool] = useGetToolTemplateMutation();
  const [updateTool] = useUpdateToolTemplateMutation();
  const [removeToolTemplate] = useRemoveToolTemplateMutation();
  const [toolDetails, setToolDetails] = useState<ToolTemplate | null>(null);
  const [toolName, setToolName] = useState<string>(toolDetails?.name || '');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const notificationApi = useGlobalNotification(); // Using global notification
  const [toolImageData, setToolImageData] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const { imageData } = useImageAssetsData(toolDetails ? [toolDetails.tool_image_uri] : []);

  useEffect(() => {
    if (toolDetails?.tool_image_uri && imageData?.[toolDetails.tool_image_uri]) {
      setToolImageData(imageData[toolDetails.tool_image_uri]);
    }
  }, [imageData, toolDetails]);

  const fetchToolDetails = async (showFullPageLoading: boolean) => {
    if (!toolId) return;
    setLoading(showFullPageLoading);
    setError(null);
    try {
      const response = await getTool({ tool_template_id: toolId }).unwrap();
      setToolDetails(response);
      setToolName(response.name || '');
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch tool details.';
      setError(errorMessage);

      notificationApi.error({
        message: 'Error',
        description: errorMessage,
        placement: 'topRight',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchToolDetails(true);
  }, [isEditMode, toolId, getTool, notificationApi]);

  const handleSave = async (updatedFields: Partial<any>) => {
    if (!toolId) {
      notificationApi.error({
        message: 'Error',
        description: 'Tool ID is not available.',
        placement: 'topRight',
      });
      return;
    }

    try {
      notificationApi.info({
        message: 'Updating Tool',
        description: 'Updating tool details...',
        placement: 'topRight',
      });

      await updateTool({
        tool_template_id: toolId,
        tool_template_name: updatedFields.tool_template_name || toolDetails?.name || '',
        tmp_tool_image_path: updatedFields.tmp_tool_image_path || '',
      }).unwrap();

      notificationApi.success({
        message: 'Tool Updated',
        description: 'Tool details have been successfully updated.',
        placement: 'topRight',
      });

      router.push('/tools'); // Redirect to /tools page
    } catch (err: any) {
      const errorMessage = err.data?.error || err.message || 'Failed to update the tool.';
      notificationApi.error({
        message: 'Error',
        description: errorMessage,
        placement: 'topRight',
      });
    }
  };

  const handleRefresh = () => fetchToolDetails(false);

  const handleDelete = async () => {
    try {
      await removeToolTemplate({ tool_template_id: toolId || '' }).unwrap();
      notificationApi.success({
        message: 'Success',
        description: 'Tool successfully deleted',
        placement: 'topRight',
      });
      setIsDeleteModalOpen(false);
      router.push('/tools');
    } catch (err: any) {
      notificationApi.error({
        message: 'Error',
        description: err.message || 'Failed to delete tool',
        placement: 'topRight',
      });
    }
  };

  if (!toolId) {
    return (
      <Alert
        message="Error"
        description="No valid Tool ID provided in the route."
        type="error"
        showIcon
      />
    );
  }

  if (loading) {
    return (
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
    );
  }

  if (error) {
    return (
      <Alert
        message="Error"
        description={error}
        type="error"
        showIcon
        style={{
          margin: '16px',
        }}
      />
    );
  }

  const actionMenuItems: MenuProps['items'] = [
    {
      key: 'view',
      label: (
        <Space>
          <EyeOutlined />
          View Tool
        </Space>
      ),
      disabled: !isEditMode,
    },
    {
      key: 'edit',
      label: (
        <Space>
          <EditOutlined />
          Edit Tool
        </Space>
      ),
      disabled: toolDetails?.pre_built || isEditMode,
    },
    {
      key: 'delete',
      label: (
        <Space>
          <DeleteOutlined />
          Delete Tool
        </Space>
      ),
      disabled: toolDetails?.pre_built,
    },
  ];

  const handleActionMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (!toolId) return;

    switch (key) {
      case 'view':
        router.push(`/tools/view/${toolId}`);
        break;
      case 'edit':
        router.push(`/tools/view/${toolId}?edit=true`);
        break;
      case 'delete':
        setIsDeleteModalOpen(true);
        break;
      default:
        break;
    }
  };

  return (
    <Layout style={{ flex: 1, padding: '16px 24px 22px', flexDirection: 'column' }}>
      <CommonBreadCrumb
        items={[
          { title: 'Tool Catalog', href: '/tools' },
          { title: isEditMode ? 'Edit Tool' : 'View Tool' },
        ]}
      />
      <Layout
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {toolImageData && (
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: '#f1f1f1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={toolImageData}
                alt={toolName}
                style={{
                  width: '24px',
                  height: '24px',
                  objectFit: 'cover',
                  borderRadius: '2px',
                }}
              />
            </div>
          )}
          <Title level={4} style={{ margin: 0 }}>
            {toolName || 'Unknown Tool'}
          </Title>
        </div>
        {/* Action Menu */}
        <Dropdown
          menu={{ items: actionMenuItems, onClick: handleActionMenuClick }}
          trigger={['click']}
          placement="bottomRight"
        >
          <Button
            style={{
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px', // Spacing between text and arrow
            }}
          >
            Actions <DownOutlined /> {/* Rotate the icon to face downwards */}
          </Button>
        </Dropdown>
      </Layout>
      <Layout style={{ marginTop: '20px' }}>
        <ToolViewOrEdit
          mode={isEditMode ? 'edit' : 'view'}
          toolDetails={toolDetails}
          onSave={handleSave}
          onRefresh={handleRefresh}
          setParentPageToolName={setToolName}
        />
      </Layout>
      <DeleteToolModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        toolDetails={toolDetails}
        onDelete={handleDelete}
      />
    </Layout>
  );
};

export default ToolViewPage;
