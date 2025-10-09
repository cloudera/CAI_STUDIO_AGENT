'use client';

import React from 'react';
import { Modal, Form, Input, Button } from 'antd';

interface CloneWorkflowModalProps {
  visible: boolean;
  onCancel: () => void;
  onClone: (newWorkflowName: string) => Promise<void>;
  originalWorkflowName: string;
  loading?: boolean;
}

const CloneWorkflowModal: React.FC<CloneWorkflowModalProps> = ({
  visible,
  onCancel,
  onClone,
  originalWorkflowName,
  loading = false,
}) => {
  const [form] = Form.useForm();

  const handleDuplicate = async () => {
    try {
      const values = await form.validateFields();
      await onClone(values.workflowName);
      form.resetFields();
    } catch (error) {
      console.error('Form validation failed:', error);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  // Set initial value when modal opens
  React.useEffect(() => {
    if (visible && originalWorkflowName) {
      form.setFieldsValue({
        workflowName: `Clone of ${originalWorkflowName}`,
      });
    }
  }, [visible, originalWorkflowName, form]);

  return (
    <Modal
      title="Clone Workflow"
      open={visible}
      onCancel={handleCancel}
      centered
      width={520}
      footer={[
        <Button key="cancel" onClick={handleCancel} disabled={loading}>
          Cancel
        </Button>,
        <Button
          key="clone"
          type="primary"
          onClick={handleDuplicate}
          loading={loading}
          disabled={loading}
        >
          Duplicate
        </Button>,
      ]}
    >
      <div className="py-4">
        <p className="text-gray-600 mb-6 text-base">
          You are making a copy of <span className="font-bold italic">{originalWorkflowName}</span>
        </p>

        <Form form={form} layout="vertical">
          <Form.Item
            name="workflowName"
            label={<span className="text-base font-medium">Enter a new workflow name:</span>}
            className="mb-0"
            rules={[
              { required: true, message: 'Please enter a workflow name' },
              { min: 1, message: 'Workflow name cannot be empty' },
              { max: 100, message: 'Workflow name cannot exceed 100 characters' },
            ]}
          >
            <Input placeholder="Input" className="mt-2" size="large" />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  );
};

export default CloneWorkflowModal;
