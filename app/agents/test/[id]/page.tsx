'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Layout, Input, Button, Alert, Avatar, Tag, Spin } from 'antd';
import { SendOutlined, UserOutlined, DownloadOutlined } from '@ant-design/icons';
import { jsPDF } from 'jspdf';
import { useParams } from 'next/navigation';
import { useTestAgentMutation, useGetAgentQuery } from '@/app/agents/agentApi';
import OpsIFrame from '@/app/components/OpsIFrame';
import CommonBreadCrumb from '@/app/components/CommonBreadCrumb';
import LargeCenterSpin from '@/app/components/common/LargeCenterSpin';
const { Content } = Layout;

// Removed unused MarkdownContent component

const TestAgentPage: React.FC = () => {
  const params = useParams();
  const agentId = Array.isArray(params?.id) ? params.id[0] : params?.id; // Ensure `agentId` is a string

  const [testAgent, { isLoading: testingAgent }] = useTestAgentMutation();
  const {
    data: agentData,
    isLoading: fetchingAgent,
    error: fetchAgentError,
  } = useGetAgentQuery({ agent_id: agentId || '' }, { skip: !agentId });
  const [agentName, setAgentName] = useState<string | null>(null);
  const [userInput, setUserInput] = useState<string>('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Set agent name based on fetched data
  useEffect(() => {
    if (agentData) {
      setAgentName(agentData.name || 'Unknown Agent');
    } else if (fetchAgentError) {
      setError('Failed to fetch agent details.');
      setAgentName('Unknown Agent');
    }
  }, [agentData, fetchAgentError]);

  const handleDownloadPdf = (content: string) => {
    const doc = new jsPDF();
    doc.text(content, 10, 10);
    doc.save('assistant-response.pdf');
  };

  const handleTestAgent = async () => {
    if (!userInput.trim()) {
      setError('Please enter a valid input.');
      return;
    }

    setError(null);

    const context = messages
      .slice(-6) // Use up to the last 6 messages as context
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    // Display user's message immediately
    setMessages((prev) => [...prev, { role: 'user', content: userInput }]);
    setUserInput('');

    try {
      const result = await testAgent({
        agent_id: agentId || '',
        user_input: userInput,
        context: context,
      }).unwrap();

      const agentResponse = result.response || 'No response from agent.';
      setMessages((prev) => [...prev, { role: 'assistant', content: agentResponse }]);
    } catch (e: any) {
      setError(e.message || 'Failed to test the agent.');
    }
  };

  if (fetchingAgent && !agentData) {
    return <LargeCenterSpin message="Loading agent..." />;
  }

  return (
    <Layout className="px-6 py-4 flex flex-col">
      <CommonBreadCrumb
        items={[{ title: 'Test Catalog', href: '/agents' }, { title: 'Test Agent' }]}
      />
      <Layout className="flex flex-row w-full h-screen">
        {/* Left Side - Chat */}
        <Content className="flex-1 p-6 flex flex-col border-r border-[#f0f0f0] bg-white">
          {!agentId ? (
            <Alert
              message="Error"
              description="No agent ID found in the route. Please access the page with a valid agent ID."
              type="error"
              showIcon
            />
          ) : (
            <>
              {error && (
                <Alert
                  message="Error"
                  description={error}
                  type="error"
                  showIcon
                  closable
                  onClose={() => setError(null)}
                  className="mb-4"
                />
              )}

              {/* Fixed Agent Name Tag */}
              <div className="sticky top-0 z-10 bg-white py-2 border-b border-[#f0f0f0]">
                {fetchingAgent ? (
                  <Spin />
                ) : (
                  <Tag color="#008cff" className="text-sm py-[5px] px-[10px]">
                    {`${agentName || 'Unknown Agent'}`}
                  </Tag>
                )}
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto my-4 relative">
                {messages.length === 0 && (
                  <div className="flex justify-center items-center h-full text-[#d9d9d9] text-2xl font-extralight">
                    Say Hello
                  </div>
                )}

                {messages.map((message, index) => (
                  <div key={index} className="flex items-start mb-3">
                    <Avatar
                      icon={
                        message.role === 'user' ? (
                          <UserOutlined className="text-[15px]" />
                        ) : (
                          <UserOutlined className="text-[15px]" />
                        )
                      }
                      size={25}
                      className={`${message.role === 'user' ? 'bg-[#87d068]' : 'bg-[#1890ff]'} mr-2 flex`}
                    />
                    {message.role === 'assistant' ? (
                      <Layout className="bg-white rounded-lg max-w-[95%] relative shadow-md px-1">
                        <Button
                          icon={<DownloadOutlined />}
                          size="small"
                          className="absolute top-2 right-2 z-[1]"
                          onClick={() => handleDownloadPdf(message.content)}
                        />
                        <div className="prose max-w-none m-4 text-sm">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      </Layout>
                    ) : (
                      <Layout className="bg-white max-w-[95%] relative">{message.content}</Layout>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Field */}
              <div className="flex items-center mt-auto">
                <Input
                  placeholder="Type your message"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onPressEnter={handleTestAgent}
                  className="flex-1 mr-2"
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={handleTestAgent}
                  loading={testingAgent}
                />
              </div>
            </>
          )}
        </Content>

        {/* Right Side - Ops Server */}
        <Content className="flex-1 flex items-center justify-center bg-[#fafafa] ml-[10px]">
          <div className="w-full h-full flex">
            <OpsIFrame />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default TestAgentPage;
