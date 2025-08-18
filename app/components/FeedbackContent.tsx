import React from 'react';

import { List, Layout, Typography, Space, Avatar, Alert } from 'antd';

const { Text } = Typography;

const FeedbackContent: React.FC = () => {
  const githubBaseUrl = 'https://github.com/cloudera/CAI_STUDIO_AGENT';
  const feedbackItems = [
    {
      title: 'Email Feedback',
      description: (
        <Text className="text-sm font-light opacity-60">
          Reach out to us at ai_feedback@cloudera.com
        </Text>
      ),
      avatar: '/mail.png',
      link: 'mailto:ai_feedback@cloudera.com',
    },
    {
      title: 'GitHub Discussions',
      description: (
        <Text className="text-sm font-light opacity-60">
          Join the discussion on{' '}
          <a href={githubBaseUrl} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </Text>
      ),
      avatar: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
      link: `${githubBaseUrl}/discussions`,
    },
  ];

  return (
    <Space direction="vertical" className="w-full" size="small">
      <Alert
        className="items-start justify-start p-2 w-full"
        message={
          <Layout className="w-full bg-transparent">
            <Text className="text-sm font-normal">
              {'We value your feedback! Reach out to us via email or join the discussion on GitHub. ' +
                'Your thoughts help us improve and grow.'}
            </Text>
          </Layout>
        }
        type="info"
        showIcon={false}
        closable={false}
      />
      <List
        itemLayout="horizontal"
        dataSource={feedbackItems}
        className="w-full pl-5"
        renderItem={(item) => (
          <List.Item>
            <List.Item.Meta
              avatar={
                <a href={item.link} target="_blank" rel="noopener noreferrer">
                  <Avatar src={item.avatar} />
                </a>
              }
              title={
                <a href={item.link} target="_blank" rel="noopener noreferrer">
                  {item.title}
                </a>
              }
              description={item.description}
            />
          </List.Item>
        )}
      />
    </Space>
  );
};

export default FeedbackContent;
