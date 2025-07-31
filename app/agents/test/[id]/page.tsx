'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Layout, Typography, Input, Button, Alert, Avatar, Card, Tag, Spin } from 'antd';
import {
  HomeOutlined,
  SendOutlined,
  UserOutlined,
  RobotOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { jsPDF } from 'jspdf';
import { useParams } from 'next/navigation';
import { useTestAgentMutation, useGetAgentQuery } from '@/app/agents/agentApi';
import OpsIFrame from '@/app/components/OpsIFrame';
import CommonBreadCrumb from '@/app/components/CommonBreadCrumb';
const { Content } = Layout;

const MarkdownContent = ({ content }: { content: string }) => {
  return (
    <div
      style={{
        padding: '8px',
        backgroundColor: 'transparent',
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        lineHeight: '1.6',
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
};

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

  return (
    <Layout style={{ padding: '16px 24px', flexDirection: 'column' }}>
      <CommonBreadCrumb
        items={[{ title: 'Test Catalog', href: '/agents' }, { title: 'Test Agent' }]}
      />
      <Layout
        style={{
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          height: '100vh',
        }}
      >
        {/* Left Side - Chat */}
        <Content
          style={{
            flex: 1,
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid #f0f0f0',
            background: '#fff',
          }}
        >
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
                  style={{ marginBottom: '16px' }}
                />
              )}

              {/* Fixed Agent Name Tag */}
              <div
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 10,
                  backgroundColor: '#fff',
                  padding: '8px 0',
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                {fetchingAgent ? (
                  <Spin />
                ) : (
                  <Tag color="#008cff" style={{ fontSize: '14px', padding: '5px 10px' }}>
                    {`${agentName || 'Unknown Agent'}`}
                  </Tag>
                )}
              </div>

              {/* Chat Messages */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  marginTop: '16px',
                  marginBottom: '16px',
                  position: 'relative',
                }}
              >
                {messages.length === 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      height: '100%',
                      color: '#d9d9d9',
                      fontSize: '24px',
                      fontWeight: 'lighter',
                    }}
                  >
                    Say Hello
                  </div>
                )}

                {messages.map((message, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      marginBottom: '12px',
                    }}
                  >
                    <Avatar
                      icon={
                        message.role === 'user' ? (
                          <UserOutlined style={{ fontSize: '15px' }} />
                        ) : (
                          <UserOutlined style={{ fontSize: '15px' }} />
                        )
                      }
                      style={{
                        marginRight: '8px',
                        backgroundColor: message.role === 'user' ? '#87d068' : '#1890ff',
                        width: '25px', // Fixed width
                        height: '25px', // Fixed height
                        fontSize: '15px', // Adjust icon size
                        display: 'flex',
                      }}
                    />
                    {message.role === 'assistant' ? (
                      <Layout
                        style={{
                          background: '#fff',
                          borderRadius: '8px',
                          maxWidth: '95%',
                          position: 'relative',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                          padding: '0 4px',
                        }}
                      >
                        <Button
                          icon={<DownloadOutlined />}
                          size="small"
                          style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            zIndex: 1,
                          }}
                          onClick={() => handleDownloadPdf(message.content)}
                        />
                        <div
                          className="prose prose-lg max-w-none m-4"
                          style={{
                            fontSize: '14px',
                            padding: '0px',
                            fontFamily:
                              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                          }}
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      </Layout>
                    ) : (
                      <Layout
                        style={{
                          background: '#fff',
                          maxWidth: '95%',
                          position: 'relative',
                        }}
                      >
                        {message.content}
                      </Layout>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Field */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginTop: 'auto',
                }}
              >
                <Input
                  placeholder="Type your message"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onPressEnter={handleTestAgent}
                  style={{ flex: 1, marginRight: '8px' }}
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
        <Content
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fafafa',
            marginLeft: '10px',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
            }}
          >
            <OpsIFrame />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default TestAgentPage;
