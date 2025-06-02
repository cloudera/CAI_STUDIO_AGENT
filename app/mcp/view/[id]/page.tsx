'use client';
import React, { useState } from 'react';
import { Button, Typography, Layout, Alert, Dropdown, Space, MenuProps, Modal } from 'antd';
import { useParams } from 'next/navigation';
import CommonBreadCrumb from '@/app/components/CommonBreadCrumb';
import { useRouter } from 'next/navigation';
import { useGlobalNotification } from '@/app/components/Notifications';
import { MCPTemplate } from '@/studio/proto/agent_studio';
import { DeleteOutlined, DownOutlined } from '@ant-design/icons';
import { useRemoveMcpTemplateMutation, useGetMcpTemplateQuery } from '../../mcpTemplatesApi';
import McpTemplateView from '@/app/components/McpTemplateView';
import { useImageAssetsData } from '@/app/lib/hooks/useAssetData';
const { Title } = Typography;

const DeleteMcpTemplateModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  mcpTemplateDetails: MCPTemplate | undefined;
  onDelete: () => Promise<void>;
}> = ({ isOpen, onClose, mcpTemplateDetails, onDelete }) => {
  return (
    <Modal
      title={`Are you sure you'd like to delete ${mcpTemplateDetails?.name}?`}
      open={isOpen}
      onCancel={onClose}
      okText="Delete"
      okButtonProps={{ danger: true }}
      cancelText="Cancel"
      onOk={onDelete}
    />
  );
};

const McpTemplateViewPage: React.FC = () => {
  const router = useRouter();
  const notificationApi = useGlobalNotification();
  const params = useParams();
  const [removeMcpTemplate] = useRemoveMcpTemplateMutation();
  const mcpTemplateId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const { data: mcpTemplate, isLoading: isMcpTemplateLoading } = useGetMcpTemplateQuery({
    mcp_template_id: mcpTemplateId || '',
  });
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const { imageData: iconsData } = useImageAssetsData(mcpTemplate ? [mcpTemplate.image_uri] : []);

  if (!mcpTemplateId) {
    return (
      <Alert
        message="Error"
        description="No valid MCP Template ID provided in the route."
        type="error"
        showIcon
      />
    );
  }

  const handleDelete = async () => {
    try {
      await removeMcpTemplate({ mcp_template_id: mcpTemplateId }).unwrap();
      notificationApi.success({
        message: 'Success',
        description: 'MCP Template successfully deleted',
        placement: 'topRight',
      });
      setIsDeleteModalOpen(false);
      router.push('/tools');
    } catch (err: any) {
      notificationApi.error({
        message: 'Error',
        description: err.message || 'Failed to delete MCP Template',
        placement: 'topRight',
      });
    }
  };

  const actionMenuItems: MenuProps['items'] = [
    {
      key: 'delete',
      label: (
        <Space>
          <DeleteOutlined />
          Deregister MCP
        </Space>
      ),
    },
  ];
  const handleActionMenuClick: MenuProps['onClick'] = ({ key }) => {
    switch (key) {
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
        items={[{ title: 'Tool Catalog', href: '/tools' }, { title: 'View MCP' }]}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
              src={
                mcpTemplate?.image_uri
                  ? iconsData[mcpTemplate.image_uri] || '/mcp-icon.svg'
                  : '/mcp-icon.svg'
              }
              alt={mcpTemplate?.name}
              style={{
                width: '24px',
                height: '24px',
                objectFit: 'cover',
                borderRadius: '2px',
              }}
            />
          </div>
          <Title level={4} style={{ margin: 0 }}>
            {mcpTemplate?.name || 'Unknown MCP'}
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
              gap: '4px',
            }}
          >
            Actions <DownOutlined />
          </Button>
        </Dropdown>
      </div>
      <Layout style={{ marginTop: '20px' }}>
        <McpTemplateView mcpTemplateDetails={mcpTemplate} onRefresh={() => {}} />
      </Layout>
      <DeleteMcpTemplateModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        mcpTemplateDetails={mcpTemplate}
        onDelete={handleDelete}
      />
    </Layout>
  );
};

export default McpTemplateViewPage;
