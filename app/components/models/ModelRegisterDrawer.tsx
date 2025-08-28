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
  // Bedrock-specific selectors and actions
  selectModelRegisterAwsRegionName,
  selectModelRegisterAwsAccessKeyId,
  selectModelRegisterAwsSecretAccessKey,
  selectModelRegisterAwsSessionToken,
  setModelRegisterAwsRegionName,
  setModelRegisterAwsAccessKeyId,
  setModelRegisterAwsSecretAccessKey,
  setModelRegisterAwsSessionToken,
} from '@/app/models/modelsSlice';
import { MODEL_IDENTIFIER_OPTIONS, BEDROCK_REGIONS } from '@/app/lib/constants';
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
  // Bedrock-specific state
  const bedrockAwsRegionName = useAppSelector(selectModelRegisterAwsRegionName);
  const bedrockAwsAccessKeyId = useAppSelector(selectModelRegisterAwsAccessKeyId);
  const bedrockAwsSecretAccessKey = useAppSelector(selectModelRegisterAwsSecretAccessKey);
  const bedrockAwsSessionToken = useAppSelector(selectModelRegisterAwsSessionToken);

  const dispatch = useAppDispatch();

  const [drawerMode, setDrawerMode] = useState<'register' | 'edit'>('register');
  // Add notification API
  const notificationsApi = useGlobalNotification();

  // If editing an existing model, populate the fields with existing model
  // information whenever the model ID field changes.
  useEffect(() => {
    console.log('modelRegisterId', modelRegisterId);
    const populateModelDetails = async () => {
      if (modelRegisterId && Boolean(modelRegisterId.trim())) {
        setDrawerMode('edit');
        const model: Model = await getModel({ model_id: modelRegisterId }).unwrap();
        console.log('model', model);
        console.log('populateModelRegisterDetails');
        dispatch(populateModelRegisterDetails(model));
      } else {
        setDrawerMode('register');
        dispatch(resetModelRegisterDetails());
      }
    };

    populateModelDetails();
  }, [modelRegisterId]);

  const onSubmit = async (values: any) => {
    try {
      if (drawerMode === 'edit') {
        if (!modelRegisterId) throw new Error('Model ID not specified for updating model.');

        const updatePayload: any = {
          model_id: modelRegisterId,
          model_name: modelRegisterName || '',
          provider_model: modelRegisterProviderModel || '',
          api_base: modelRegisterApiBase || '',
          api_key: modelRegisterApiKey || '',
          extra_headers: JSON.stringify(modelRegisterExtraHeaders || {}),
        };
        if (modelRegisterType === 'BEDROCK') {
          updatePayload.api_base = '';
          updatePayload.api_key = '';
          updatePayload.aws_region_name = bedrockAwsRegionName || '';
          updatePayload.aws_access_key_id = bedrockAwsAccessKeyId || '';
          updatePayload.aws_secret_access_key = bedrockAwsSecretAccessKey || '';
          if (bedrockAwsSessionToken) updatePayload.aws_session_token = bedrockAwsSessionToken;
        }
        await updateModel(updatePayload);

        notificationsApi.success({
          message: 'Model Updated',
          description: `Model '${modelRegisterName}' updated successfully!`,
          placement: 'topRight',
        });

        dispatch(setIsRegisterDrawerOpen(false));

        // Trigger revalidation of the model
        asyncTestModelWithRetry(modelRegisterId, dispatch, testModel, updateModelStatus);
      } else {
        const isBedrock = modelRegisterType === 'BEDROCK';
        const missingCommon = !modelRegisterName || !modelRegisterType;
        const missingApiBase =
          ['OPENAI_COMPATIBLE', 'AZURE_OPENAI', 'CAII'].includes(modelRegisterType || '') &&
          !modelRegisterApiBase;
        const missingAzureCaiiProvider =
          ['AZURE_OPENAI', 'CAII'].includes(modelRegisterType || '') && !modelRegisterProviderModel;
        const missingBedrockCreds =
          isBedrock &&
          (!bedrockAwsRegionName || !bedrockAwsAccessKeyId || !bedrockAwsSecretAccessKey);
        const missingApiKeyForOthers = !isBedrock && !modelRegisterApiKey;
        if (
          missingCommon ||
          missingApiBase ||
          missingAzureCaiiProvider ||
          missingBedrockCreds ||
          missingApiKeyForOthers
        ) {
          throw new Error('Please fill in all required fields.');
        }

        try {
          const addPayload: any = {
            model_name: modelRegisterName,
            model_type: modelRegisterType,
            provider_model: modelRegisterProviderModel || '',
            api_base: modelRegisterApiBase || '',
            api_key: modelRegisterApiKey,
            extra_headers: JSON.stringify(modelRegisterExtraHeaders || {}),
          };
          if (isBedrock) {
            addPayload.api_base = '';
            addPayload.api_key = '';
            addPayload.aws_region_name = bedrockAwsRegionName || '';
            addPayload.aws_access_key_id = bedrockAwsAccessKeyId || '';
            addPayload.aws_secret_access_key = bedrockAwsSecretAccessKey || '';
            if (bedrockAwsSessionToken) addPayload.aws_session_token = bedrockAwsSessionToken;
          }
          const modelId = await addModel(addPayload).unwrap();

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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            paddingTop: '16px',
            paddingBottom: '8px',
          }}
        >
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
            <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
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
            style={{ width: '100%' }}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
      <div
        style={{ display: 'flex', alignItems: 'center', paddingTop: '16px', paddingBottom: '8px' }}
      >
        Model Provider
        <Tooltip title="Choose the model provider, such as OpenAI, OpenAI Compatible, Azure OpenAI, Google Gemini, Anthropic, AWS Bedrock, or Cloudera AI Inference.">
          <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
        </Tooltip>
      </div>
      <Select
        style={{ width: '100%' }}
        disabled={drawerMode === 'edit'}
        value={modelRegisterType}
        onChange={(value: string) => {
          if (drawerMode === 'register') {
            dispatch(setModelRegisterType(value));
          }
        }}
      >
        <Option value="CAII">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img
              src="/llm_providers/caii.svg"
              alt="Cloudera AI Inference"
              style={{ width: '16px', height: '16px' }}
            />
            Cloudera AI Inference
          </div>
        </Option>
        <Option value="OPENAI">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img
              src="/llm_providers/openai.svg"
              alt="OpenAI"
              style={{ width: '16px', height: '16px' }}
            />
            OpenAI
          </div>
        </Option>
        <Option value="OPENAI_COMPATIBLE">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img
              src="/llm_providers/generic-llm.svg"
              alt="OpenAI Compatible"
              style={{ width: '16px', height: '16px' }}
            />
            OpenAI Compatible
          </div>
        </Option>
        <Option value="AZURE_OPENAI">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img
              src="/llm_providers/azure-openai.svg"
              alt="Azure OpenAI"
              style={{ width: '16px', height: '16px' }}
            />
            Azure OpenAI
          </div>
        </Option>
        <Option value="GEMINI">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img
              src="/llm_providers/gemini.svg"
              alt="Google Gemini"
              style={{ width: '16px', height: '16px' }}
            />
            Google Gemini
          </div>
        </Option>
        <Option value="ANTHROPIC">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img
              src="/llm_providers/anthropic.svg"
              alt="Anthropic"
              style={{ width: '16px', height: '16px' }}
            />
            Anthropic
          </div>
        </Option>
        <Option value="BEDROCK">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img
              src="/llm_providers/bedrock.svg"
              alt="AWS Bedrock"
              style={{ width: '16px', height: '16px' }}
            />
            AWS Bedrock
          </div>
        </Option>
      </Select>

      {/* Model Alias */}
      <div
        style={{ display: 'flex', alignItems: 'center', paddingTop: '16px', paddingBottom: '8px' }}
      >
        Model Alias
        <Tooltip title="Enter a unique name for your model to be referenced across the studio.">
          <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              paddingTop: '16px',
              paddingBottom: '8px',
            }}
          >
            API Base
            <Tooltip title="Enter the base URL for the model's API.">
              <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              paddingTop: '16px',
              paddingBottom: '8px',
            }}
          >
            API Base
            <Tooltip title="Go to the Cloudera AI Model Endpoint details page to find the endpoint URL">
              <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
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

      {/* AWS Region for Bedrock */}
      {modelRegisterType === 'BEDROCK' && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              paddingTop: '16px',
              paddingBottom: '8px',
            }}
          >
            AWS Region
            <Tooltip title="Select the AWS region where your Bedrock models are available (e.g., us-east-1, us-west-2)">
              <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
            </Tooltip>
          </div>
          <Select
            style={{ width: '100%' }}
            placeholder="Select AWS region"
            value={bedrockAwsRegionName}
            onChange={(value) => dispatch(setModelRegisterAwsRegionName(value))}
            showSearch
            optionFilterProp="label"
          >
            {BEDROCK_REGIONS.map((r) => (
              <Option key={r.value} value={r.value} label={r.label}>
                {r.label}
              </Option>
            ))}
          </Select>
        </>
      )}

      {/* API Key or Access Key */}
      <div
        style={{ display: 'flex', alignItems: 'center', paddingTop: '16px', paddingBottom: '8px' }}
      >
        {modelRegisterType === 'BEDROCK' ? 'AWS Access Key ID' : 'API Key'}
        <Tooltip
          title={
            modelRegisterType === 'BEDROCK'
              ? 'Your AWS Access Key ID. You can also use IAM roles or environment variables for authentication.'
              : modelRegisterType === 'CAII'
                ? 'Generate a long-lived JWT token on the Knox Gateway Server in the Data Lake environment. Copy the CDP Token from the Cloudera AI Model Endpoint Code Sample page'
                : "Provide the API key for accessing the model's service."
          }
        >
          <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
        </Tooltip>
      </div>
      <Input.Password
        placeholder={
          modelRegisterType === 'BEDROCK'
            ? 'Enter AWS Access Key ID'
            : modelRegisterType === 'CAII'
              ? 'Enter JWT token'
              : drawerMode === 'register'
                ? 'Enter API key'
                : 'Enter new API key (optional)'
        }
        value={
          modelRegisterType === 'BEDROCK' ? bedrockAwsAccessKeyId || '' : modelRegisterApiKey || ''
        }
        onChange={(e) => {
          if (modelRegisterType === 'BEDROCK') {
            dispatch(setModelRegisterAwsAccessKeyId(e.target.value));
          } else {
            dispatch(setModelRegisterApiKey(e.target.value));
          }
        }}
      />

      {/* AWS Secret Access Key for Bedrock */}
      {modelRegisterType === 'BEDROCK' && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              paddingTop: '16px',
              paddingBottom: '8px',
            }}
          >
            AWS Secret Access Key
            <Tooltip title="Your AWS Secret Access Key (will be stored securely)">
              <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
            </Tooltip>
          </div>
          <Input.Password
            placeholder="Enter AWS Secret Access Key"
            value={bedrockAwsSecretAccessKey || ''}
            onChange={(e) => dispatch(setModelRegisterAwsSecretAccessKey(e.target.value))}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              paddingTop: '16px',
              paddingBottom: '8px',
            }}
          >
            AWS Session Token (optional)
            <Tooltip title="If using temporary credentials, provide the session token.">
              <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
            </Tooltip>
          </div>
          <Input.Password
            placeholder="Enter AWS Session Token (optional)"
            value={bedrockAwsSessionToken || ''}
            onChange={(e) => dispatch(setModelRegisterAwsSessionToken(e.target.value))}
          />
        </>
      )}

      {/* Set as default toggle (Only in case of new model registration) */}
      {drawerMode === 'register' && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              paddingTop: '16px',
              paddingBottom: '8px',
            }}
          >
            Default Model
            <Tooltip title="Set this model as the default model for the studio">
              <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
            </Tooltip>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Switch
              checked={setAsDefault || (models && models.length === 0)}
              onChange={(checked) => dispatch(setModelRegisterSetAsDefault(checked))}
              disabled={models && models.length === 0}
              style={{
                backgroundColor:
                  setAsDefault || (models && models.length === 0) ? '#52c41a' : undefined,
              }}
            />
            <span>Set as default</span>
            {models && models.length === 0 && (
              <Tooltip title="First model is automatically set as default">
                <QuestionCircleOutlined style={{ cursor: 'pointer' }} />
              </Tooltip>
            )}
          </div>
        </>
      )}

      <Collapse
        bordered={false}
        ghost
        style={{
          margin: -10,
          padding: 0,
          paddingTop: '16px',
          backgroundColor: 'transparent',
        }}
        items={[
          {
            key: '1',
            style: {
              margin: 0,
              padding: 0,
              backgroundColor: 'transparent',
            },
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
