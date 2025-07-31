import React, { useState, useEffect } from 'react';
import { Modal, Button, Layout, Typography, Input, Alert, Space } from 'antd';
import {
  LoadingOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { FormInstance } from 'antd';
import { Model, ToolInstance } from '@/studio/proto/agent_studio';
import { useAppSelector } from '../../lib/hooks/hooks';
import { useSelector } from 'react-redux';
import { useTestModelMutation } from '../../models/modelsApi';
import {
  selectEditorAgentViewAgent,
  selectEditorAgentViewCreateAgentState,
} from '../../workflows/editorSlice';
import { GENERATE_AGENT_BACKGROUND_PROMPT } from '@/app/lib/constants';

const { Text } = Typography;
const { TextArea } = Input;

interface GenerateAgentPropertiesModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  onCancel: () => void;
  form: FormInstance<{
    name: string;
    role: string;
    backstory: string;
    goal: string;
    llm_provider_model_id: string;
  }>;
  llmModel: Model;
  toolInstances: Record<string, ToolInstance>;
}

const GenerateAgentPropertiesModal: React.FC<GenerateAgentPropertiesModalProps> = ({
  open,
  setOpen,
  onCancel,
  form,
  llmModel,
  toolInstances,
}) => {
  const [userDescription, setUserDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [hideInfoBox, setHideInfoBox] = useState(false);
  const [parsedSuggestions, setParsedSuggestions] = useState<{
    role?: string;
    goal?: string;
    backstory?: string;
    error?: string;
  }>({});
  const selectedAgent = useAppSelector(selectEditorAgentViewAgent);
  const createAgentState = useSelector(selectEditorAgentViewCreateAgentState);
  const [testModel] = useTestModelMutation();

  const relevantToolInstances = Object.values(toolInstances).filter((toolInstance) => {
    if (selectedAgent) {
      return selectedAgent?.tools_id?.includes(toolInstance.id);
    } else {
      return createAgentState?.tools?.includes(toolInstance.id);
    }
  });

  useEffect(() => {
    if (!open) {
      setUserDescription('');
      setParsedSuggestions({});
      setIsGenerating(false);
      setHideInfoBox(false);
    } // reset on close
  }, [open]);

  const generatePrompt = (description: string, tools: ToolInstance[]) => {
    return GENERATE_AGENT_BACKGROUND_PROMPT(description);
  };

  const parseXMLResponse = (
    xmlString: string,
  ): { role?: string; goal?: string; backstory?: string; error?: string } => {
    try {
      // Extract content between XML tags using regex
      const roleMatch = xmlString.match(/<role>(.*?)<\/role>/);
      const goalMatch = xmlString.match(/<goal>(.*?)<\/goal>/);
      const backstoryMatch = xmlString.match(/<backstory>(.*?)<\/backstory>/);
      const role = roleMatch?.[1]?.trim();
      const goal = goalMatch?.[1]?.trim();
      const backstory = backstoryMatch?.[1]?.trim();

      if (role || goal || backstory) {
        return {
          role,
          goal,
          backstory,
        };
      }

      return { error: `No properties found in the response: ${xmlString}` };
    } catch (error: unknown) {
      console.error('Error parsing XML response:', error);
      if (error instanceof Error) {
        return { error: error.message };
      }
      return { error: 'Unknown error occurred while parsing XML' };
    }
  };

  const handleGenerate = async () => {
    if (!userDescription.trim()) return;

    setIsGenerating(true);
    setHideInfoBox(true);
    try {
      const response = await testModel({
        model_id: llmModel.model_id,
        completion_role: 'user',
        completion_content: generatePrompt(userDescription, relevantToolInstances),
        temperature: 0.1,
        max_tokens: 1000,
        timeout: 10,
      }).unwrap();

      setParsedSuggestions(parseXMLResponse(response));
    } catch (error) {
      console.error('Error generating suggestions:', error);
      setParsedSuggestions({ error: 'Error generating suggestions' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplySuggestions = () => {
    if (parsedSuggestions.role || parsedSuggestions.goal || parsedSuggestions.backstory) {
      const currentFormValues = form.getFieldsValue();
      form.setFieldsValue({
        name: parsedSuggestions.role || currentFormValues.name,
        role: parsedSuggestions.role,
        goal: parsedSuggestions.goal,
        backstory: parsedSuggestions.backstory,
      });
      setOpen(false);
    }
  };

  const infoMessage =
    'This feature uses the default LLM model to suggest agent properties. ' +
    'Please provide a succint descipription of your agent and the task it will be performing. ' +
    'It would look at the tools available with the agent along with your description to generate ' +
    'a set of properties that can be used to create an agent.';

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      width="50%"
      title={
        <Typography.Title level={5}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }}
          >
            <img
              src="/ai-assistant.svg"
              alt="AI Assistant"
              style={{
                filter: 'invert(70%) sepia(80%) saturate(1000%) hue-rotate(360deg)',
                width: '20px',
                height: '20px',
              }}
            />
            Generate Agent Properties using AI
          </div>
        </Typography.Title>
      }
      footer={[
        <Button key="cancel" type="default" onClick={onCancel}>
          Close
        </Button>,
        <Button
          key="apply"
          type="primary"
          disabled={
            (!parsedSuggestions.role && !parsedSuggestions.goal && !parsedSuggestions.backstory) ||
            isGenerating
          }
          onClick={handleApplySuggestions}
        >
          Apply Suggestions
        </Button>,
      ]}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {!hideInfoBox && (
          <Alert
            style={{
              alignItems: 'flex-start',
              justifyContent: 'flex-start',
              padding: 12,
            }}
            message={
              <Layout
                style={{ flexDirection: 'column', gap: 4, padding: 0, background: 'transparent' }}
              >
                <Layout
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    background: 'transparent',
                  }}
                >
                  <InfoCircleOutlined style={{ fontSize: 16, color: '#1890ff' }} />
                  <Text style={{ fontSize: 13, fontWeight: 400, background: 'transparent' }}>
                    {infoMessage}
                  </Text>
                </Layout>
              </Layout>
            }
            type="info"
            showIcon={false}
            closable={false}
          />
        )}

        <div style={{ width: '100%', display: 'flex', gap: '6px', alignItems: 'stretch' }}>
          <div style={{ flex: 1 }}>
            <Input.TextArea
              placeholder="Describe the agent you want to create..."
              value={userDescription}
              onChange={(e) => setUserDescription(e.target.value)}
              autoSize={{ minRows: 3, maxRows: 5 }}
              style={{ width: '100%', height: '100%' }}
              onKeyDown={(e) => {
                // trigger on generate on ctrl/cmd + enter
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  handleGenerate();
                }
              }}
            />
          </div>
          <Button
            type="primary"
            style={{
              width: 'clamp(36px, 5%, 50px)',
              backgroundColor: '#52c41a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              height: 'auto',
              position: 'relative',
            }}
            icon={
              isGenerating ? (
                <LoadingOutlined style={{ color: '#fff', fontSize: '150%' }} />
              ) : (
                <PlayCircleOutlined style={{ color: '#fff', fontSize: '150%' }} />
              )
            }
            onClick={handleGenerate}
            loading={isGenerating}
            disabled={!userDescription.trim()}
          />
        </div>

        <Space direction="vertical" style={{ width: '100%' }}>
          {parsedSuggestions.role && (
            <Alert
              message={
                <Layout
                  style={{
                    flexDirection: 'column',
                    gap: 12,
                    padding: 0,
                    background: 'transparent',
                  }}
                >
                  <Layout
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      background: 'transparent',
                      paddingLeft: '12px',
                      paddingTop: '12px',
                    }}
                  >
                    <CheckCircleOutlined style={{ fontSize: 20, color: '#52c41a' }} />
                    <Text style={{ fontSize: 16, fontWeight: 500, background: 'transparent' }}>
                      Generated Properties
                    </Text>
                  </Layout>
                  <Space
                    direction="vertical"
                    style={{ width: '100%', padding: '12px', gap: '6px' }}
                  >
                    <div>
                      <Text style={{ fontWeight: 'bold' }}>Role: </Text>
                      <Text style={{ fontWeight: 'normal' }}>{parsedSuggestions.role}</Text>
                    </div>
                    <div>
                      <Text style={{ fontWeight: 'bold' }}>Goal: </Text>
                      <Text style={{ fontWeight: 'normal' }}>{parsedSuggestions.goal}</Text>
                    </div>
                    <div>
                      <Text style={{ fontWeight: 'bold' }}>Backstory: </Text>
                      <Text style={{ fontWeight: 'normal' }}>{parsedSuggestions.backstory}</Text>
                    </div>
                  </Space>
                </Layout>
              }
              type="success"
              showIcon={false}
            />
          )}
          {parsedSuggestions.error && (
            <Alert
              message={
                <Layout
                  style={{ flexDirection: 'column', gap: 4, padding: 0, background: 'transparent' }}
                >
                  <Layout
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      background: 'transparent',
                      padding: '12px',
                    }}
                  >
                    <ExclamationCircleOutlined style={{ fontSize: 18, color: '#faad14' }} />
                    <Text style={{ fontSize: 13, fontWeight: 200, background: 'transparent' }}>
                      {parsedSuggestions.error}
                    </Text>
                  </Layout>
                </Layout>
              }
              type="error"
              showIcon={false}
            />
          )}
        </Space>
      </Space>
    </Modal>
  );
};

export default GenerateAgentPropertiesModal;
