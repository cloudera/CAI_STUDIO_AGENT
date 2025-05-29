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
                <Tooltip title="Choose the model provider, such as OpenAI, OpenAI Compatible, Azure OpenAI, Google Gemini, or Anthropic.">
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
            {changedModel?.model_type != 'AZURE_OPENAI' && (
              <Form.Item
                label={
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    Model Identifier
                    <Tooltip title="Enter the provider-specific model identifier (e.g., gpt-4o for OpenAI).">
                      <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
                    </Tooltip>
                  </div>
                }
                name="modelIdentifier"
                rules={[{ required: true, message: 'Model identifier is required.' }]}
                initialValue={drawerMode === 'edit' ? changedModel?.provider_model : undefined}
              >
                {changedModel?.model_type === 'OPENAI' ? (
                  <Select
                    placeholder="Select the model identifier"
                    onChange={(value) => {
                      setChangedModel(
                        changedModel ? { ...changedModel, provider_model: value } : null,
                      );
                    }}
                  >
                    <Option value="gpt-4.1">gpt-4.1</Option>
                    <Option value="gpt-4.1-mini">gpt-4.1-mini</Option>
                    <Option value="gpt-4.1-nano">gpt-4.1-nano</Option>
                    <Option value="gpt-4o">gpt-4o</Option>
                    <Option value="gpt-4o-mini">gpt-4o-mini</Option>
                    <Option value="gpt-4">gpt-4</Option>
                    <Option value="o4-mini">o4-mini</Option>
                    <Option value="o3-mini">o3-mini</Option>
                    <Option value="o1-mini">o1-mini</Option>
                  </Select>
                ) : changedModel?.model_type === 'OPENAI_COMPATIBLE' ||
                  changedModel?.model_type === 'AZURE_OPENAI' ? (
                  <Input
                    placeholder="Enter the model identifier at the provider"
                    onChange={(e) => {
                      setChangedModel(
                        changedModel ? { ...changedModel, provider_model: e.target.value } : null,
                      );
                    }}
                  />
                ) : changedModel?.model_type === 'GEMINI' ? (
                  <Select
                    placeholder="Select the model identifier"
                    onChange={(value) => {
                      setChangedModel(
                        changedModel ? { ...changedModel, provider_model: value } : null,
                      );
                    }}
                  >
                    <Option value="gemini-2.0-flash">gemini-2.0-flash</Option>
                    <Option value="gemini-2.5-flash-preview-05-20">
                      gemini-2.5-flash-preview-05-20
                    </Option>
                    <Option value="gemini-2.5-pro-preview-05-06">
                      gemini-2.5-pro-preview-05-06
                    </Option>
                  </Select>
                ) : changedModel?.model_type === 'ANTHROPIC' ? (
                  <Select
                    placeholder="Select the model identifier"
                    onChange={(value) => {
                      setChangedModel(
                        changedModel ? { ...changedModel, provider_model: value } : null,
                      );
                    }}
                  >
                    <Option value="claude-opus-4-0">claude-opus-4-0</Option>
                    <Option value="claude-sonnet-4-0">claude-sonnet-4-0</Option>
                    <Option value="claude-3-7-sonnet-latest">claude-3-7-sonnet-latest</Option>
                    <Option value="claude-3-5-sonnet-latest">claude-3-5-sonnet-latest</Option>
                    <Option value="claude-3-5-haiku-latest">claude-3-5-haiku-latest</Option>
                  </Select>
                ) : null}
              </Form.Item>
            )}

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
            {changedModel?.model_type === 'AZURE_OPENAI' && (
              <Form.Item
                label={
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    Azure Deployment Name
                    <Tooltip title="Enter the deployment name for the Azure model.">
                      <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
                    </Tooltip>
                  </div>
                }
                name="modelIdentifier"
                rules={[{ required: true, message: 'Azure deployment name is required.' }]}
                initialValue={drawerMode === 'edit' ? changedModel?.provider_model : undefined}
              >
                <Input
                  placeholder="Enter Azure deployment name"
                  onChange={(e) => {
                    setChangedModel(
                      changedModel ? { ...changedModel, provider_model: e.target.value } : null,
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
                  <Tooltip title="Provide the API key for accessing the model's service.">
                    <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
                  </Tooltip>
                </div>
              }
              name="apiKey"
              rules={[{ required: drawerMode === 'register', message: 'API key is required.' }]}
            >
              <Input.Password
                placeholder={
                  drawerMode === 'register' ? 'Enter API key' : 'Enter new API key (optional)'
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
