import React, { useState } from 'react';
import { Modal, Button } from 'antd';

interface DeleteDeployedWorkflowModalProps {
  visible: boolean;
  onCancel: () => void;
  onDelete: () => Promise<void>;
}

const DeleteDeployedWorkflowModal: React.FC<DeleteDeployedWorkflowModalProps> = ({
  visible,
  onCancel,
  onDelete,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete();
      setIsDeleting(false);
      onCancel();
    } catch (error) {
      console.error('Error deleting deployed workflow:', error);
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      open={visible}
      title="Delete Deployed Workflow"
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button key="delete" type="primary" danger onClick={handleDelete} loading={isDeleting}>
          Delete
        </Button>,
      ]}
    >
      <p>Are you sure you want to delete this deployed workflow?</p>
    </Modal>
  );
};

export default DeleteDeployedWorkflowModal;
