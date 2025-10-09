import React, { useState } from 'react';
import { Modal, Button, Alert, Layout, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useListDeployedWorkflowsQuery } from '@/app/workflows/deployedWorkflowsApi';
import i18n from '@/app/utils/i18n';

const { Text } = Typography;

interface DeleteWorkflowModalProps {
  resourceType: 'workflow' | 'workflowTemplate';
  visible: boolean;
  onCancel: () => void;
  onDelete: () => Promise<void>;
  workflowId?: string;
  workflowTemplateId?: string;
}

const DeleteWorkflowModal: React.FC<DeleteWorkflowModalProps> = ({
  resourceType,
  visible,
  onCancel,
  onDelete,
  workflowId,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const { data: deployedWorkflows = [] } = useListDeployedWorkflowsQuery({});

  const hasDeployments =
    resourceType === 'workflow' && workflowId
      ? deployedWorkflows?.some((dw) => dw.workflow_id === workflowId)
      : false;

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete();
      setIsDeleting(false);
      onCancel();
    } catch (error) {
      console.error('Error deleting workflow:', error);
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      open={visible}
      title={
        resourceType === 'workflowTemplate'
          ? i18n.t('workflow.deleteTemplate.title')
          : i18n.t('workflow.delete.title')
      }
      onCancel={onCancel}
      centered
      footer={[
        <Button key="cancel" onClick={onCancel}>
          {i18n.t('common.cancel')}
        </Button>,
        <Button key="delete" type="primary" danger onClick={handleDelete} loading={isDeleting}>
          {i18n.t('common.delete')}
        </Button>,
      ]}
    >
      {hasDeployments && (
        <Alert
          className="items-start justify-start p-3 mb-3"
          message={
            <Layout className="flex flex-col gap-1 p-0 bg-transparent">
              <Layout className="flex flex-row items-center gap-2 bg-transparent">
                <InfoCircleOutlined className="text-base text-yellow-500" />
                <Text className="text-sm font-semibold bg-transparent">
                  {i18n.t('workflow.delete.warningTitle')}
                </Text>
              </Layout>
              <Text className="text-sm font-normal bg-transparent">
                {i18n.t('workflow.delete.warningDesc')}
              </Text>
            </Layout>
          }
          type="warning"
          showIcon={false}
          closable={false}
        />
      )}
      <p>
        {resourceType === 'workflowTemplate'
          ? i18n.t('workflow.deleteTemplate.confirm')
          : i18n.t('workflow.delete.confirm')}
      </p>
    </Modal>
  );
};

export default DeleteWorkflowModal;
