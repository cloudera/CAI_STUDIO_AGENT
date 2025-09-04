import React, { useState } from 'react';
import { Modal, Input } from 'antd';

interface CreateToolTemplateModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onGenerate: (toolName: string) => void;
  loading?: boolean;
}

const CreateToolTemplateModal: React.FC<CreateToolTemplateModalProps> = ({
  isOpen,
  onCancel,
  onGenerate,
  loading = false,
}) => {
  const [toolName, setToolName] = useState('');

  const handleGenerate = () => {
    if (toolName.trim() && !loading) {
      onGenerate(toolName.trim());
      setToolName('');
    }
  };

  return (
    <Modal
      title="Create Tool Template"
      open={isOpen}
      onCancel={onCancel}
      onOk={handleGenerate}
      okText="Generate"
      cancelText="Cancel"
      confirmLoading={loading}
    >
      <div className="mt-4">
        <Input
          placeholder="Enter Tool Name"
          value={toolName}
          onChange={(e) => setToolName(e.target.value)}
          onPressEnter={handleGenerate}
          className="mt-4 mb-4 p-2 rounded"
        />
      </div>
    </Modal>
  );
};

export default CreateToolTemplateModal;
