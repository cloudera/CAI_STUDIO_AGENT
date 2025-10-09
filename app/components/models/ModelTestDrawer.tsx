'use client';

import React, { useEffect, useState } from 'react';
import { Drawer, Input, Tooltip, Button } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '@/app/lib/hooks/hooks';
import {
  selectIsTestDrawerOpen,
  selectModelTestId,
  selectModelTestMessage,
  setIsTestDrawerOpen,
  setModelTestResponse,
  selectModelTestResponse,
  setModelTestMessage,
} from '@/app/models/modelsSlice';
import { useGlobalNotification } from '@/app/components/Notifications';
import { useTestModelMutation } from '@/app/models/modelsApi';
import { DEFAULT_MODEL_TEST_MESSAGE } from '@/app/lib/constants';

interface ModelTestDrawerProps {}

const ModelTestDrawer: React.FC<ModelTestDrawerProps> = () => {
  const isOpen = useAppSelector(selectIsTestDrawerOpen);
  const modelId = useAppSelector(selectModelTestId);
  const testMessage = useAppSelector(selectModelTestMessage);
  const testResponse = useAppSelector(selectModelTestResponse);
  const [testModel] = useTestModelMutation();
  const [isTesting, setIsTesting] = useState(false);
  const dispatch = useAppDispatch();

  const notificationsApi = useGlobalNotification();

  const handleTestModel = async (message: string) => {
    if (!modelId) {
      return;
    }
    try {
      setIsTesting(true);
      const response = await testModel({
        model_id: modelId,
        completion_role: 'user',
        completion_content: message,
        temperature: 0.1,
        max_tokens: 50,
        timeout: 3,
      }).unwrap();

      if (response.startsWith('Model Test Failed')) {
        notificationsApi.error({
          message: 'Model Test Failed',
          description: response,
          placement: 'topRight',
        });
      }
      dispatch(setModelTestResponse(response));
    } catch (error: any) {
      const errorMessage = error.data?.error || error.message || 'Failed to test model.';
      notificationsApi.error({
        message: 'Model Test Error',
        description: errorMessage,
        placement: 'topRight',
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Reset the model test details both when the drawer is open and closed.
  useEffect(() => {
    dispatch(setModelTestMessage(DEFAULT_MODEL_TEST_MESSAGE));
    dispatch(setModelTestResponse(''));
  }, [isOpen]);

  const onClose = () => {
    dispatch(setIsTestDrawerOpen(false));
  };

  return (
    <Drawer
      title={
        <div className="flex justify-between items-center">
          <span>{'Test Model'}</span>
        </div>
      }
      open={isOpen}
      onClose={onClose}
      footer={null}
      width={600}
    >
      <div className="flex items-center pt-4 pb-2">
        Test Input
        <Tooltip title="Enter a sample input to test the model.">
          <QuestionCircleOutlined className="ml-2 cursor-pointer" />
        </Tooltip>
      </div>
      <Input.TextArea
        placeholder="Give a short prompt to test the model."
        value={testMessage}
        onChange={(e) => dispatch(setModelTestMessage(e.target.value))}
        className="h-36"
      />
      <Button
        type="primary"
        variant="outlined"
        onClick={() => handleTestModel(testMessage || '')}
        block
        className="mt-4"
        loading={isTesting}
        disabled={!testMessage}
      >
        Test Model
      </Button>
      <div className="flex items-center pt-4 pb-2">
        Test Output
        <Tooltip title="View the response from the model based on the test input.">
          <QuestionCircleOutlined className="ml-2 cursor-pointer" />
        </Tooltip>
      </div>
      <Input.TextArea
        value={testResponse || ''}
        readOnly
        className="h-36"
        placeholder="The model's response will appear here."
      />
    </Drawer>
  );
};

export default ModelTestDrawer;
