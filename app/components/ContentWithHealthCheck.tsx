'use client';

import React, { useEffect } from 'react';
import 'antd/dist/reset.css';
import { Content } from 'antd/lib/layout/layout';
import { useHealthCheckQuery } from '../lib/crossCuttingApi';
import LargeCenterSpin from './common/LargeCenterSpin';

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
    return <LargeCenterSpin message="Agent Studio is starting. Please wait..." />;
  }

  return <Content className="flex flex-col overflow-hidden flex-1 w-full">{children}</Content>;
};

export default ContentWithHealthCheck;
