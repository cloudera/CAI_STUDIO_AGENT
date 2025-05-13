import React, { useState, useEffect } from 'react';
import { Modal, Button, Alert, Layout, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useListDeployedWorkflowsQuery } from '@/app/workflows/deployedWorkflowsApi';
import { DeployedWorkflow } from '@/studio/proto/agent_studio';

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
  workflowTemplateId,
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
      title={`Delete Workflow${resourceType === 'workflowTemplate' ? ' Template' : ''}`}
      onCancel={onCancel}
      centered
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button key="delete" type="primary" danger onClick={handleDelete} loading={isDeleting}>
          Delete
        </Button>,
      ]}
    >
      {hasDeployments && (
        <Alert
          style={{
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            padding: 12,
            marginBottom: 12,
          }}
          message={
            <Layout
              style={{ flexDirection: 'column', gap: 4, padding: 0, background: 'transparent' }}
            >
              <Layout
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  background: 'transparent',
                }}
              >
                <InfoCircleOutlined style={{ fontSize: 16, color: '#faad14' }} />
                <Text style={{ fontSize: 13, fontWeight: 600, background: 'transparent' }}>
                  Warning: Deployed Workflow
                </Text>
              </Layout>
              <Text style={{ fontSize: 13, fontWeight: 400, background: 'transparent' }}>
                You have an existing deployment running for this workflow. Deleting this workflow
                will also delete its deployment.
              </Text>
            </Layout>
          }
          type="warning"
          showIcon={false}
          closable={false}
        />
      )}
      <p>
        Are you sure you want to delete this workflow
        {resourceType === 'workflowTemplate' ? ' template' : ''}?
      </p>
    </Modal>
  );
};

export default DeleteWorkflowModal;
