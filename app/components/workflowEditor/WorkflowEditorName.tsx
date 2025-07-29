import React, { useState } from 'react';
import { Button, Input } from 'antd';
import { Typography } from 'antd/lib';
import { useAppSelector, useAppDispatch } from '@/app/lib/hooks/hooks';
import {
  selectEditorWorkflowName,
  updatedEditorWorkflowName,
  selectEditorWorkflow,
} from '@/app/workflows/editorSlice';
import { useUpdateWorkflowMutation, useGetWorkflowByIdQuery } from '@/app/workflows/workflowsApi';
import { EditOutlined, SaveOutlined } from '@ant-design/icons';
import { useGlobalNotification } from '@/app/components/Notifications';
import { createUpdateRequestFromEditor } from '@/app/lib/workflow';
const { Title } = Typography;

export interface WorkflowEditorNameProps {
  workflowId: string;
}

const WorkflowEditorName: React.FC<WorkflowEditorNameProps> = ({ workflowId }) => {
  const [preEditName, setPreEditName] = useState<string | undefined>('');
  const workflowName = useAppSelector(selectEditorWorkflowName);
  const workflowState = useAppSelector(selectEditorWorkflow);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const notificationApi = useGlobalNotification();
  const [updateWorkflow] = useUpdateWorkflowMutation();
  const dispatch = useAppDispatch();

  const handleSaveWorkflowName = async () => {
    const currentWorkflowName = workflowName || '';
    if (!workflowId || !currentWorkflowName.trim()) {
      setIsEditing(false);
      return;
    }

    try {
      const updatedWorkflowState = {
        ...workflowState,
        name: currentWorkflowName,
        workflowMetadata: {
          ...workflowState.workflowMetadata,
          name: currentWorkflowName,
        },
      };

      await updateWorkflow(createUpdateRequestFromEditor(updatedWorkflowState)).unwrap();

      notificationApi.success({
        message: 'Workflow Updated',
        description: 'Workflow name has been updated successfully.',
        placement: 'topRight',
      });

      setIsEditing(false);
    } catch (error) {
      notificationApi.error({
        message: 'Error Updating Workflow',
        description: 'Failed to update workflow name. Please try again.',
        placement: 'topRight',
      });
    }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        {isEditing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
            <Input
              size="large"
              value={workflowName}
              onChange={(e) => {
                dispatch(updatedEditorWorkflowName(e.target.value));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveWorkflowName();
                } else if (e.key === 'Escape') {
                  dispatch(updatedEditorWorkflowName(preEditName));
                  setIsEditing(false);
                }
              }}
              style={{ width: '50%' }}
              autoFocus
            />
            <Button
              icon={<SaveOutlined />}
              type="primary"
              onClick={(e) => {
                e.preventDefault();
                handleSaveWorkflowName();
              }}
            />
          </div>
        ) : (
          <>
            <Title level={5} style={{ paddingTop: 4, fontSize: '18px', fontWeight: 600 }}>
              {workflowId ? workflowName : 'Create Workflow'}
            </Title>
            <Button
              icon={<EditOutlined />}
              type="text"
              style={{ marginLeft: '8px' }}
              onClick={() => {
                setIsEditing(true);
                setPreEditName(workflowName);
              }}
            />
          </>
        )}
      </div>
    </>
  );
};

export default WorkflowEditorName;
