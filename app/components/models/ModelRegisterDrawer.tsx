'use client';

import React, { useEffect, useState } from 'react';
import { Drawer, Input, Select, Tooltip, Button, Switch, Collapse } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { Model } from '@/studio/proto/agent_studio';
import ExtraHeadersComponent from './ExtraHeadersComponent';

import {
  useAddModelMutation,
  useGetModelMutation,
  useListModelsQuery,
  useUpdateModelMutation,
  useSetDefaultModelMutation,
  useTestModelMutation,
} from '@/app/models/modelsApi';
import { useGlobalNotification } from '@/app/components/Notifications';
import { useAppDispatch, useAppSelector } from '@/app/lib/hooks/hooks';
import {
  populateModelRegisterDetails,
  selectModelRegisterId,
  resetModelRegisterDetails,
  selectModelRegisterName,
  selectModelRegisterType,
  selectModelRegisterProviderModel,
  selectModelRegisterApiBase,
  selectModelRegisterApiKey,
  selectModelRegisterExtraHeaders,
  setIsRegisterDrawerOpen,
  selectModelRegisterSetAsDefault,
  selectIsRegisterDrawerOpen,
  setModelRegisterProviderModel,
  setModelRegisterType,
  setModelRegisterName,
  setModelRegisterApiBase,
  setModelRegisterApiKey,
  setModelRegisterSetAsDefault,
  updateModelStatus,
} from '@/app/models/modelsSlice';
import { MODEL_IDENTIFIER_OPTIONS } from '@/app/lib/constants';
import { asyncTestModelWithRetry } from '@/app/models/utils';

const { Option } = Select;

interface ModelRegisterDrawerProps {}

const ModelRegisterDrawer: React.FC<ModelRegisterDrawerProps> = ({}) => {
  const { data: models } = useListModelsQuery({});

  const [getModel] = useGetModelMutation();
  const [updateModel] = useUpdateModelMutation();
  const [addModel] = useAddModelMutation();
  const [setDefaultModel] = useSetDefaultModelMutation();
  const [testModel] = useTestModelMutation();

  const isOpen = useAppSelector(selectIsRegisterDrawerOpen);
  const modelRegisterId = useAppSelector(selectModelRegisterId);
  const modelRegisterName = useAppSelector(selectModelRegisterName);
  const modelRegisterType = useAppSelector(selectModelRegisterType);
  const modelRegisterProviderModel = useAppSelector(selectModelRegisterProviderModel);
  const modelRegisterApiBase = useAppSelector(selectModelRegisterApiBase);
  const modelRegisterApiKey = useAppSelector(selectModelRegisterApiKey);
  const modelRegisterExtraHeaders = useAppSelector(selectModelRegisterExtraHeaders);
  const setAsDefault = useAppSelector(selectModelRegisterSetAsDefault);

  const dispatch = useAppDispatch();

  const [drawerMode, setDrawerMode] = useState<'register' | 'edit'>('register');
  // Add notification API
  const notificationsApi = useGlobalNotification();

  // If editing an existing model, populate the fields with existing model
  // information whenever the model ID field changes.
  useEffect(() => {
    const populateModelDetails = async () => {
      if (modelRegisterId && Boolean(modelRegisterId.trim())) {
        setDrawerMode('edit');
        const model: Model = await getModel({ model_id: modelRegisterId }).unwrap();
        dispatch(populateModelRegisterDetails(model));
      } else {
        setDrawerMode('register');
        dispatch(resetModelRegisterDetails());
      }
    };

    populateModelDetails();
  }, [modelRegisterId]);

  const onSubmit = async (_values: any) => {
    try {
      if (drawerMode === 'edit') {
        if (!modelRegisterId) {
          throw new Error('Model ID not specified for updating model.');
        }

        await updateModel({
          model_id: modelRegisterId,
          model_name: modelRegisterName || '',
          provider_model: modelRegisterProviderModel || '',
          api_base: modelRegisterApiBase || '',
          api_key: modelRegisterApiKey || '',
          extra_headers: JSON.stringify(modelRegisterExtraHeaders || {}),
        });

        notificationsApi.success({
          message: 'Model Updated',
          description: `Model '${modelRegisterName}' updated successfully!`,
          placement: 'topRight',
        });

        dispatch(setIsRegisterDrawerOpen(false));

        // Trigger revalidation of the model
        asyncTestModelWithRetry(modelRegisterId, dispatch, testModel, updateModelStatus);
      } else {
        if (
          !modelRegisterName ||
          !modelRegisterApiKey ||
          !modelRegisterType ||
          (['OPENAI_COMPATIBLE', 'AZURE_OPENAI', 'CAII'].includes(modelRegisterType || '') &&
            !modelRegisterApiBase) ||
          (['AZURE_OPENAI', 'CAII'].includes(modelRegisterType || '') &&
            !modelRegisterProviderModel)
        ) {
          throw new Error('Please fill in all required fields.');
        }

        try {
          const modelId = await addModel({
            model_name: modelRegisterName,
            model_type: modelRegisterType,
            provider_model: modelRegisterProviderModel || '',
            api_base: modelRegisterApiBase || '',
            api_key: modelRegisterApiKey,
            extra_headers: JSON.stringify(modelRegisterExtraHeaders || {}),
          }).unwrap();

          if (setAsDefault && modelId) {
            await setDefaultModel({ model_id: modelId });
          }

          notificationsApi.success({
            message: 'Model Created',
            description: `Model '${modelRegisterName}' created successfully!`,
            placement: 'topRight',
          });

          dispatch(setIsRegisterDrawerOpen(false));
          dispatch(resetModelRegisterDetails());
        } catch (error: any) {
          const errorMessage = error.data?.error || error.message;
          if (errorMessage.includes('failed to update governance for project')) {
            notificationsApi.error({
              message: 'Error Creating Model',
              description:
                'The system is currently experiencing high load. Please wait a few minutes and try again.',
              placement: 'topRight',
              duration: 10, // Show for longer since it's an important error
            });
          } else {
            notificationsApi.error({
              message: 'Error Creating Model',
              description: errorMessage || 'Failed to create model.',
              placement: 'topRight',
            });
          }
        }
      }
    } catch (error: any) {
      const errorMessage = error.data?.error || error.message || 'Failed to save model.';
      notificationsApi.error({
        message: drawerMode === 'edit' ? 'Error Updating Model' : 'Error Creating Model',
        description: errorMessage,
        placement: 'topRight',
      });
    }
  };

  const renderModelIdentifierInput = () => {
    const type = modelRegisterType;
    const modelIdentifierHeader = (
      <>
        <div className="flex items-center pt-4 pb-2">
          Model Identifier
          <Tooltip
            title={
              type === 'CAII'
                ? 'Go to Cloudera AI Model Endpoint details page for Model_ID'
                : type === 'AZURE_OPENAI'
                  ? 'Enter the deployment name for the Azure model.'
                  : 'Enter the provider-specific model identifier (e.g., gpt-4o for OpenAI).'
            }
          >
            <QuestionCircleOutlined className="ml-2 cursor-pointer" />
          </Tooltip>
        </div>
      </>
    );

    if (type === 'CAII') {
      return (
        <>
          {modelIdentifierHeader}
          <Input
            placeholder="Enter the model ID"
            value={modelRegisterProviderModel}
            onChange={(e) => dispatch(setModelRegisterProviderModel(e.target.value))}
          />
        </>
      );
    }

    if (type === 'AZURE_OPENAI') {
      return (
        <>
          {modelIdentifierHeader}
          <Input
            placeholder="Enter Azure deployment name"
            value={modelRegisterProviderModel}
            onChange={(e) => dispatch(setModelRegisterProviderModel(e.target.value))}
          />
        </>
      );
    }

    if (type === 'OPENAI_COMPATIBLE') {
      return (
        <>
          {modelIdentifierHeader}
          <Input
            placeholder="Enter the model identifier at the provider"
            value={modelRegisterProviderModel}
            onChange={(e) => dispatch(setModelRegisterProviderModel(e.target.value))}
          />
        </>
      );
    }

    if (type && MODEL_IDENTIFIER_OPTIONS[type]) {
      return (
        <>
          {modelIdentifierHeader}
          <Select
            className="w-full"
            placeholder="Select the model identifier"
            value={modelRegisterProviderModel}
            onChange={(value) => dispatch(setModelRegisterProviderModel(value))}
          >
            {MODEL_IDENTIFIER_OPTIONS[type].map((opt) => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Select>
        </>
      );
    }

    return null;
  };

  const onClose = () => {
    dispatch(setIsRegisterDrawerOpen(false));
    dispatch(resetModelRegisterDetails());
  };

  return (
    <Drawer
      title={
        <div className="flex justify-between items-center">
          <span>{drawerMode === 'edit' ? 'Edit Model' : 'Register Model'}</span>
          {(drawerMode === 'register' || drawerMode === 'edit') && (
            <Button type="primary" htmlType="submit" onClick={onSubmit}>
              {drawerMode === 'edit' ? 'Save Changes' : 'Register'}
            </Button>
          )}
        </div>
      }
      open={isOpen}
      onClose={onClose}
      footer={null}
      width={600}
    >
      <div className="flex items-center pt-4 pb-2">
        Model Provider
        <Tooltip title="Choose the model provider, such as OpenAI, OpenAI Compatible, Azure OpenAI, Google Gemini, Anthropic, or Cloudera AI Inference.">
          <QuestionCircleOutlined className="ml-2 cursor-pointer" />
        </Tooltip>
      </div>
      <Select
        className="w-full"
        disabled={drawerMode === 'edit'}
        value={modelRegisterType}
        onChange={(value: string) => {
          if (drawerMode === 'register') {
            dispatch(setModelRegisterType(value));
          }
        }}
      >
        <Option value="CAII">
          <div className="flex items-center gap-2">
            <img src="/llm_providers/caii.svg" alt="Cloudera AI Inference" className="w-4 h-4" />
            Cloudera AI Inference
          </div>
        </Option>
        <Option value="OPENAI">
          <div className="flex items-center gap-2">
            <img src="/llm_providers/openai.svg" alt="OpenAI" className="w-4 h-4" />
            OpenAI
          </div>
        </Option>
        <Option value="OPENAI_COMPATIBLE">
          <div className="flex items-center gap-2">
            <img src="/llm_providers/generic-llm.svg" alt="OpenAI Compatible" className="w-4 h-4" />
            OpenAI Compatible
          </div>
        </Option>
        <Option value="AZURE_OPENAI">
          <div className="flex items-center gap-2">
            <img src="/llm_providers/azure-openai.svg" alt="Azure OpenAI" className="w-4 h-4" />
            Azure OpenAI
          </div>
        </Option>
        <Option value="GEMINI">
          <div className="flex items-center gap-2">
            <img src="/llm_providers/gemini.svg" alt="Google Gemini" className="w-4 h-4" />
            Google Gemini
          </div>
        </Option>
        <Option value="ANTHROPIC">
          <div className="flex items-center gap-2">
            <img src="/llm_providers/anthropic.svg" alt="Anthropic" className="w-4 h-4" />
            Anthropic
          </div>
        </Option>
      </Select>

      {/* Model Alias */}
      <div className="flex items-center pt-4 pb-2">
        Model Alias
        <Tooltip title="Enter a unique name for your model to be referenced across the studio.">
          <QuestionCircleOutlined className="ml-2 cursor-pointer" />
        </Tooltip>
      </div>
      <Input
        value={modelRegisterName}
        onChange={(e) => {
          dispatch(setModelRegisterName(e.target.value));
        }}
      />

      {/* Model Identifier */}
      {renderModelIdentifierInput()}

      {/* API Base */}
      {(modelRegisterType === 'OPENAI_COMPATIBLE' || modelRegisterType === 'AZURE_OPENAI') && (
        <>
          <div className="flex items-center pt-4 pb-2">
            API Base
            <Tooltip title="Enter the base URL for the model's API.">
              <QuestionCircleOutlined className="ml-2 cursor-pointer" />
            </Tooltip>
          </div>
          <Input
            placeholder="Enter API base URL"
            value={modelRegisterApiBase}
            onChange={(e) => {
              dispatch(setModelRegisterApiBase(e.target.value));
            }}
          />
        </>
      )}
      {/* CAII API Base */}
      {modelRegisterType === 'CAII' && (
        <>
          <div className="flex items-center pt-4 pb-2">
            API Base
            <Tooltip title="Go to the Cloudera AI Model Endpoint details page to find the endpoint URL">
              <QuestionCircleOutlined className="ml-2 cursor-pointer" />
            </Tooltip>
          </div>
          <Input
            placeholder="Enter model endpoint URL"
            value={modelRegisterApiBase}
            onChange={(e) => {
              dispatch(setModelRegisterApiBase(e.target.value));
            }}
          />
        </>
      )}

      {/* API Key */}
      <div className="flex items-center pt-4 pb-2">
        API Key
        <Tooltip
          title={
            modelRegisterType === 'CAII'
              ? 'Generate a long-lived JWT token on the Knox Gateway Server in the Data Lake environment. Copy the CDP Token from the Cloudera AI Model Endpoint Code Sample page'
              : "Provide the API key for accessing the model's service."
          }
        >
          <QuestionCircleOutlined className="ml-2 cursor-pointer" />
        </Tooltip>
      </div>
      <Input.Password
        placeholder={
          modelRegisterType === 'CAII'
            ? 'Enter JWT token'
            : drawerMode === 'register'
              ? 'Enter API key'
              : 'Enter new API key (optional)'
        }
        value={modelRegisterApiKey}
        onChange={(e) => {
          dispatch(setModelRegisterApiKey(e.target.value));
        }}
      />

      {/* Set as default toggle (Only in case of new model registration) */}
      {drawerMode === 'register' && (
        <>
          <div className="flex items-center pt-4 pb-2">
            Default Model
            <Tooltip title="Set this model as the default model for the studio">
              <QuestionCircleOutlined className="ml-2 cursor-pointer" />
            </Tooltip>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={setAsDefault || (models && models.length === 0)}
              onChange={(checked) => dispatch(setModelRegisterSetAsDefault(checked))}
              disabled={models && models.length === 0}
              className={`${setAsDefault || (models && models.length === 0) ? 'bg-green-500' : ''}`}
            />
            <span>Set as default</span>
            {models && models.length === 0 && (
              <Tooltip title="First model is automatically set as default">
                <QuestionCircleOutlined className="cursor-pointer" />
              </Tooltip>
            )}
          </div>
        </>
      )}

      <Collapse
        bordered={false}
        ghost
        className="-m-2 p-0 pt-4 bg-transparent"
        items={[
          {
            key: '1',
            className: 'm-0 p-0 bg-transparent',
            label: (
              <>
                <h4>Advanced Options</h4>
              </>
            ),
            children: (
              <>
                <ExtraHeadersComponent />
              </>
            ),
          },
        ]}
      />
    </Drawer>
  );
};

export default ModelRegisterDrawer;
