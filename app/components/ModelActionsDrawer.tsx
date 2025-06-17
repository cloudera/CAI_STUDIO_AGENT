'use client';

import React, { useEffect, useState } from 'react';
import { Drawer, Form, Input, Select, Alert, Tooltip, Button, Switch } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { AddModelRequest, Model } from '@/studio/proto/agent_studio';

const { Option } = Select;

interface ModelActionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  drawerMode: 'register' | 'edit' | 'test';
  changedModel: AddModelRequest | null;
  setChangedModel: (model: AddModelRequest | null) => void;
  selectedModel: Model | null;
  submitError: string | null;
  submitSuccess: string | null;
  onSubmit: (values: any) => Promise<void>;
  onTest?: (message: string) => Promise<void>;
  testResponse?: string | null;
  models?: Model[];
  setModelAsDefault?: boolean;
  onSetModelAsDefaultChange?: (checked: boolean) => void;
}

const ModelActionsDrawer: React.FC<ModelActionsDrawerProps> = ({
  isOpen,
  onClose,
  drawerMode,
  changedModel,
  setChangedModel,
  selectedModel,
  submitError,
  submitSuccess,
  onSubmit,
  onTest,
  testResponse,
  models,
  setModelAsDefault,
  onSetModelAsDefaultChange,
}) => {
  const defaultTestMessage = 'Greet me in 5 different languages.';
  const [form] = Form.useForm();
  const [testMessage, setTestMessage] = useState<string>(defaultTestMessage);

  useEffect(() => {
    if (isOpen) {
      if (drawerMode === 'edit' && selectedModel) {
        form.setFieldsValue({
          modelProvider: selectedModel.model_type,
          modelAlias: selectedModel.model_name,
          modelIdentifier: selectedModel.provider_model,
          apiBase: selectedModel.api_base,
        });
        setChangedModel({
          model_name: selectedModel.model_name,
          model_type: selectedModel.model_type,
          provider_model: selectedModel.provider_model,
          api_base: selectedModel.api_base,
          api_key: '',
        });
      } else if (drawerMode === 'register') {
        form.resetFields();
        form.setFieldsValue({ modelProvider: 'OPENAI' });
        setChangedModel({
          model_name: '',
          model_type: 'OPENAI',
          provider_model: '',
          api_base: '',
          api_key: '',
        });
      } else {
        // test
        form.resetFields();
        setTestMessage(defaultTestMessage);
        form.setFieldsValue({
          testMessage: testMessage,
        });
      }
    } else {
      form.resetFields();
    }
  }, [isOpen, drawerMode, selectedModel, form, setChangedModel]);

  const handleTestModel = async () => {
    if (onTest) {
      await onTest(testMessage);
    }
  };

  const modelIdentifierOptions: Record<string, { value: string; label: string }[]> = {
    OPENAI: [
      { value: 'gpt-4.1', label: 'gpt-4.1' },
      { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
      { value: 'gpt-4.1-nano', label: 'gpt-4.1-nano' },
      { value: 'gpt-4o', label: 'gpt-4o' },
      { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      { value: 'gpt-4', label: 'gpt-4' },
      { value: 'o4-mini', label: 'o4-mini' },
      { value: 'o3-mini', label: 'o3-mini' },
      { value: 'o1-mini', label: 'o1-mini' },
    ],
    GEMINI: [
      { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash' },
      { value: 'gemini-2.5-flash-preview-05-20', label: 'gemini-2.5-flash-preview-05-20' },
      { value: 'gemini-2.5-pro-preview-05-06', label: 'gemini-2.5-pro-preview-05-06' },
    ],
    ANTHROPIC: [
      { value: 'claude-opus-4-0', label: 'claude-opus-4-0' },
      { value: 'claude-sonnet-4-0', label: 'claude-sonnet-4-0' },
      { value: 'claude-3-7-sonnet-latest', label: 'claude-3-7-sonnet-latest' },
      { value: 'claude-3-5-sonnet-latest', label: 'claude-3-5-sonnet-latest' },
      { value: 'claude-3-5-haiku-latest', label: 'claude-3-5-haiku-latest' },
    ],
  };

  const renderModelIdentifier = () => {
    const type = changedModel?.model_type;
    const commonProps = {
      label: (
        <div style={{ display: 'flex', alignItems: 'center' }}>
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
      ),
      name: 'modelIdentifier',
      rules: [
        {
          required: true,
          message:
            type === 'CAII'
              ? 'CAII model identifier is required.'
              : type === 'AZURE_OPENAI'
                ? 'Azure deployment name is required.'
                : 'Model identifier is required.',
        },
      ],
      initialValue: drawerMode === 'edit' ? changedModel?.provider_model : undefined,
    };

    if (type === 'CAII') {
      return (
        <Form.Item {...commonProps}>
          <Input
            placeholder="Enter the model ID"
            onChange={(e) =>
              setChangedModel(changedModel ? { ...changedModel, provider_model: e.target.value } : null)
            }
          />
        </Form.Item>
      );
    }

    if (type === 'AZURE_OPENAI') {
      return (
        <Form.Item {...commonProps}>
          <Input
            placeholder="Enter Azure deployment name"
            onChange={(e) =>
              setChangedModel(changedModel ? { ...changedModel, provider_model: e.target.value } : null)
            }
          />
        </Form.Item>
      );
    }

    if (type && modelIdentifierOptions[type]) {
      return (
        <Form.Item {...commonProps}>
          <Select
            placeholder="Select the model identifier"
            onChange={(value) =>
              setChangedModel(changedModel ? { ...changedModel, provider_model: value } : null)
            }
          >
            {modelIdentifierOptions[type].map((opt) => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Select>
        </Form.Item>
      );
    }

    if (type === 'OPENAI_COMPATIBLE') {
      return (
        <Form.Item {...commonProps}>
          <Input
            placeholder="Enter the model identifier at the provider"
            onChange={(e) =>
              setChangedModel(changedModel ? { ...changedModel, provider_model: e.target.value } : null)
            }
          />
        </Form.Item>
      );
    }

    return null;
  };

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            {drawerMode === 'edit'
              ? 'Edit Model'
              : drawerMode === 'test'
                ? 'Test Model'
                : 'Register Model'}
          </span>
          {(drawerMode === 'register' || drawerMode === 'edit') && (
            <Button type="primary" htmlType="submit" onClick={() => form.submit()}>
              {drawerMode === 'edit' ? 'Save Changes' : 'Save'}
            </Button>
          )}
        </div>
      }
      open={isOpen}
      onClose={onClose}
      footer={null}
      width={600}
    >
      {submitError && (
        <Alert
          message="Error"
          description={submitError}
          type="error"
          style={{ marginBottom: '16px' }}
        />
      )}
      {submitSuccess && (
        <Alert
          message="Success"
          description={submitSuccess}
          type="success"
          style={{ marginBottom: '16px' }}
        />
      )}
      {(drawerMode === 'register' || drawerMode === 'edit') && (
        <Form
          form={form}
          layout="vertical"
          onFinish={onSubmit}
          initialValues={drawerMode === 'register' ? { modelProvider: 'OPENAI' } : undefined} // Pre-select OPENAI for new registrations
        >
          {/* Model Provider */}
          <Form.Item
            label={
              <div style={{ display: 'flex', alignItems: 'center' }}>
                Model Provider
                <Tooltip title="Choose the model provider, such as OpenAI, OpenAI Compatible, Azure OpenAI, Google Gemini, Anthropic, or Cloudera AI Inference.">
                  <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
                </Tooltip>
              </div>
            }
            name="modelProvider"
            rules={[{ required: true, message: 'Model provider is required.' }]}
            initialValue={drawerMode === 'edit' ? selectedModel?.model_type : 'OPENAI'}
          >
            <Select
              disabled={drawerMode === 'edit'}
              onChange={(value: string) => {
                if (drawerMode === 'register') {
                  setChangedModel(changedModel ? { ...changedModel, model_type: value } : null);
                }
              }}
            >
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
            </Select>
          </Form.Item>

          {/* Model Alias */}
          <Form.Item
            label={
              <div style={{ display: 'flex', alignItems: 'center' }}>
                Model Alias
                <Tooltip title="Enter a unique name for your model to be referenced across the studio.">
                  <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
                </Tooltip>
              </div>
            }
            name="modelAlias"
            rules={[{ required: true, message: 'Model alias is required.' }]}
            initialValue={drawerMode === 'edit' ? changedModel?.model_name : undefined}
          >
            <Input
              onChange={(e) => {
                setChangedModel(
                  changedModel ? { ...changedModel, model_name: e.target.value } : null,
                );
              }}
            />
          </Form.Item>

          {/* Model Identifier */}
          <Form.Item shouldUpdate>
            {renderModelIdentifier()}

            {/* API Base */}
            {(changedModel?.model_type === 'OPENAI_COMPATIBLE' ||
              changedModel?.model_type === 'AZURE_OPENAI') && (
              <Form.Item
                label={
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    API Base
                    <Tooltip title="Enter the base URL for the model's API.">
                      <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
                    </Tooltip>
                  </div>
                }
                name="apiBase"
                rules={[{ required: true, message: 'API Base is required.' }]}
                initialValue={drawerMode === 'edit' ? changedModel?.api_base : undefined}
              >
                <Input
                  placeholder="Enter API base URL"
                  onChange={(e) => {
                    setChangedModel(
                      changedModel ? { ...changedModel, api_base: e.target.value } : null,
                    );
                  }}
                />
              </Form.Item>
            )}
            {/* CAII API Base */}
            {changedModel?.model_type === 'CAII' && (
              <Form.Item
                label={
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    API Base
                    <Tooltip title="Go to the Cloudera AI Model Endpoint details page to find the endpoint URL">
                      <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
                    </Tooltip>
                  </div>
                }
                name="apiBase"
                rules={[{ required: true, message: 'CAII API Base is required.' }]}
                initialValue={drawerMode === 'edit' ? changedModel?.api_base : undefined}
              >
                <Input
                  placeholder="Enter model endpoint URL"
                  onChange={(e) => {
                    setChangedModel(
                      changedModel ? { ...changedModel, api_base: e.target.value } : null,
                    );
                  }}
                />
              </Form.Item>
            )}

            {/* API Key */}
            <Form.Item
              label={
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  API Key
                  <Tooltip title={
                    changedModel?.model_type === 'CAII'
                      ? 'Generate a long-lived JWT token on the Knox Gateway Server in the Data Lake environment. Copy the CDP Token from the Cloudera AI Model Endpoint Code Sample page'
                      : 'Provide the API key for accessing the model\'s service.'
                  }>
                    <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
                  </Tooltip>
                </div>
              }
              name="apiKey"
              rules={[{ required: drawerMode === 'register', message: 'API key is required.' }]}
            >
              <Input.Password
                placeholder={
                  changedModel?.model_type === 'CAII'
                    ? 'Enter JWT token'
                    : drawerMode === 'register'
                      ? 'Enter API key'
                      : 'Enter new API key (optional)'
                }
                onChange={(e) => {
                  setChangedModel(
                    changedModel ? { ...changedModel, api_key: e.target.value } : null,
                  );
                }}
              />
            </Form.Item>

            {/* Set as default toggle (Only in case of new model registration) */}
            {drawerMode === 'register' && (
              <Form.Item
                label={
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    Default Model
                    <Tooltip title="Set this model as the default model for the studio">
                      <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
                    </Tooltip>
                  </div>
                }
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Switch
                    checked={setModelAsDefault || (models && models.length === 0)}
                    onChange={(checked) => onSetModelAsDefaultChange?.(checked)}
                    disabled={models && models.length === 0}
                    style={{
                      backgroundColor:
                        setModelAsDefault || (models && models.length === 0)
                          ? '#52c41a'
                          : undefined,
                    }}
                  />
                  <span>Set as default</span>
                  {models && models.length === 0 && (
                    <Tooltip title="First model is automatically set as default">
                      <QuestionCircleOutlined style={{ cursor: 'pointer' }} />
                    </Tooltip>
                  )}
                </div>
              </Form.Item>
            )}
          </Form.Item>
        </Form>
      )}

      {/* Test Model */}
      {drawerMode === 'test' && (
        <Form form={form} layout="vertical">
          <Form.Item
            label={
              <div style={{ display: 'flex', alignItems: 'center' }}>
                Test Input
                <Tooltip title="Enter a sample input to test the model.">
                  <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
                </Tooltip>
              </div>
            }
            name="testMessage"
            rules={[{ required: true, message: 'Test message is required.' }]}
          >
            <Input.TextArea
              placeholder="Give a short prompt to test the model."
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              style={{ height: 150 }}
            />
          </Form.Item>
          {/* Test Button */}
          <Button type="primary" variant="outlined" onClick={handleTestModel} block>
            Test Model
          </Button>
          &nbsp;
          {/* Test Output */}
          <Form.Item
            label={
              <div style={{ display: 'flex', alignItems: 'center' }}>
                Test Output
                <Tooltip title="View the response from the model based on the test input.">
                  <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
                </Tooltip>
              </div>
            }
          >
            <Input.TextArea
              value={testResponse || ''}
              readOnly
              style={{ height: 150 }}
              placeholder="The model's response will appear here."
            />
          </Form.Item>
        </Form>
      )}
    </Drawer>
  );
};

export default ModelActionsDrawer;
