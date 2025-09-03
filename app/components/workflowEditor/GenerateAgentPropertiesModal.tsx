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

  const generatePrompt = (description: string, _tools: ToolInstance[]) => {
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
    if (!userDescription.trim()) {
      return;
    }

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
          <div className="flex items-center gap-1 align-middle">
            <img
              src="/ai-assistant.svg"
              alt="AI Assistant"
              className="filter-invert-70 filter-sepia-80 filter-saturate-1000 filter-hue-rotate-360 w-5 h-5"
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
      <Space direction="vertical" className="w-full" size="large">
        {!hideInfoBox && (
          <Alert
            className="items-start justify-start p-3"
            message={
              <Layout className="flex flex-col gap-1 p-0 bg-transparent">
                <Layout className="flex flex-row items-center gap-2 bg-transparent">
                  <InfoCircleOutlined className="text-lg text-blue-500" />
                  <Text className="text-sm font-normal bg-transparent">{infoMessage}</Text>
                </Layout>
              </Layout>
            }
            type="info"
            showIcon={false}
            closable={false}
          />
        )}

        <div className="w-full flex gap-1 items-stretch">
          <div className="flex-1">
            <Input.TextArea
              placeholder="Describe the agent you want to create..."
              value={userDescription}
              onChange={(e) => setUserDescription(e.target.value)}
              autoSize={{ minRows: 3, maxRows: 5 }}
              className="w-full h-full"
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
            className="w-[clamp(36px,5%,50px)] bg-green-500 flex items-center justify-center p-1 h-auto relative"
            icon={
              isGenerating ? (
                <LoadingOutlined className="text-white text-2xl" />
              ) : (
                <PlayCircleOutlined className="text-white text-2xl" />
              )
            }
            onClick={handleGenerate}
            loading={isGenerating}
            disabled={!userDescription.trim()}
          />
        </div>

        <Space direction="vertical" className="w-full">
          {parsedSuggestions.role && (
            <Alert
              message={
                <Layout className="flex flex-col gap-3 p-0 bg-transparent">
                  <Layout className="flex flex-row items-center gap-2 bg-transparent pl-3 pt-3">
                    <CheckCircleOutlined className="text-xl text-green-500" />
                    <Text className="text-lg font-medium bg-transparent">Generated Properties</Text>
                  </Layout>
                  <Space direction="vertical" className="w-full p-3 gap-1">
                    <div>
                      <Text className="font-bold">Role: </Text>
                      <Text className="font-normal">{parsedSuggestions.role}</Text>
                    </div>
                    <div>
                      <Text className="font-bold">Goal: </Text>
                      <Text className="font-normal">{parsedSuggestions.goal}</Text>
                    </div>
                    <div>
                      <Text className="font-bold">Backstory: </Text>
                      <Text className="font-normal">{parsedSuggestions.backstory}</Text>
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
                <Layout className="flex flex-col gap-1 p-0 bg-transparent">
                  <Layout className="flex flex-row items-center gap-2 bg-transparent p-3">
                    <ExclamationCircleOutlined className="text-lg text-yellow-500" />
                    <Text className="text-sm font-light bg-transparent">
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
