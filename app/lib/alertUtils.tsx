import React from 'react';
import { Alert, Layout, Typography } from 'antd';
import { InfoCircleOutlined, WarningOutlined, LoadingOutlined } from '@ant-design/icons';

const { Text } = Typography;

export const renderAlert = (
  message: string,
  description: string,
  type: 'info' | 'warning' | 'error' | 'loading',
) => {
  const icon =
    type === 'warning' ? (
      <WarningOutlined className="text-yellow-500 text-lg" />
    ) : type === 'loading' ? (
      <LoadingOutlined className="text-blue-500 text-lg" />
    ) : (
      <InfoCircleOutlined className="text-blue-500 text-lg" />
    );

  const alertType = type === 'loading' ? 'info' : type;

  return (
    <Alert
      className="items-start justify-start p-3"
      message={
        <Layout className="flex-col gap-1 p-0 bg-transparent">
          <Layout className="flex-row items-center gap-2 bg-transparent">
            {icon}
            <Text className="text-sm font-semibold bg-transparent">{message}</Text>
          </Layout>
          <Text className="text-sm font-normal bg-transparent">{description}</Text>
        </Layout>
      }
      type={alertType}
    />
  );
};
