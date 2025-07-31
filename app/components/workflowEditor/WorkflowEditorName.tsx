'use client';

import React, { useState } from 'react';
import { Button, Input, Tooltip } from 'antd';
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
import { useGetParentProjectDetailsQuery } from '@/app/lib/crossCuttingApi';
import { FolderOpenOutlined } from '@ant-design/icons';

const { Title } = Typography;

export interface WorkflowEditorNameProps {
  workflowId: string;
}

const WorkflowEditorName: React.FC<WorkflowEditorNameProps> = ({ workflowId }) => {
  const [preEditName, setPreEditName] = useState<string | undefined>('');
  const { data: workflow } = useGetWorkflowByIdQuery(workflowId);
  const { data: parentProjectDetails } = useGetParentProjectDetailsQuery({});
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

  const handleOpenWorkflowDirectory = () => {
    if (workflow?.directory) {
      const fileUrl = new URL(
        `files/${parentProjectDetails?.studio_subdirectory && parentProjectDetails?.studio_subdirectory.length > 0 ? parentProjectDetails?.studio_subdirectory + '/' : ''}${workflow.directory}/`,
        parentProjectDetails?.project_base,
      );
      window.open(fileUrl, '_blank');
    } else {
      notificationApi.error({
        message: 'Error Editing Workflow',
        description: 'Failed to edit workflow name. Please try again.',
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
            <Tooltip title="Go to Workflow Directory">
              <Button
                icon={<FolderOpenOutlined />}
                type="text"
                style={{ marginLeft: '8px' }}
                onClick={handleOpenWorkflowDirectory}
              />
            </Tooltip>
          </>
        )}
      </div>
    </>
  );
};

export default WorkflowEditorName;
