'use client';

import React, { useEffect } from 'react';
import 'antd/dist/reset.css';
import { Content } from 'antd/lib/layout/layout';
import { Spin, Typography } from 'antd';
import { useHealthCheckQuery } from '../lib/crossCuttingApi';

const { Text } = Typography;

type ContentWithHealthCheckProps = {
  children: React.ReactNode;
};

const ContentWithHealthCheck: React.FC<ContentWithHealthCheckProps> = ({ children }) => {
  const { data: isHealthy, refetch: refetchHeathStatus } = useHealthCheckQuery();

  // Poll health check every second until backend is healthy
  useEffect(() => {
    if (!isHealthy) {
      const intervalId = setInterval(() => {
        refetchHeathStatus();
      }, 5000);

      // Clean up interval when component unmounts or when isHealthy becomes true
      return () => clearInterval(intervalId);
    }
  }, [isHealthy, refetchHeathStatus]);

  if (!isHealthy) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          flexDirection: 'column',
        }}
      >
        <Spin size="large" />
        <Text>Agent Studio is starting. Please wait...</Text>
      </div>
    );
  }

  return (
    <Content
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flex: 1,
        width: '100%',
      }}
    >
      {children}
    </Content>
  );
};

export default ContentWithHealthCheck;
