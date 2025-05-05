import React from 'react';
import { Alert, Layout, Typography } from 'antd';
import { InfoCircleOutlined, WarningOutlined, LoadingOutlined } from '@ant-design/icons';

const { Text } = Typography;

export const renderAlert = (
  message: string,
  description: string,
  type: 'info' | 'warning' | 'error' | 'loading'
) => {
  const icon =
    type === 'warning' ? (
      <WarningOutlined style={{ fontSize: 16, color: '#faad14' }} />
    ) : type === 'loading' ? (
      <LoadingOutlined style={{ fontSize: 16, color: '#1890ff' }} />
    ) : (
      <InfoCircleOutlined style={{ fontSize: 16, color: '#1890ff' }} />
    );

  const alertType = type === 'loading' ? 'info' : type;

  return (
    <Alert
      style={{
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        padding: 12,
      }}
      message={
        <Layout style={{ flexDirection: 'column', gap: 4, padding: 0, background: 'transparent' }}>
          <Layout
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              background: 'transparent',
            }}
          >
            {icon}
            <Text style={{ fontSize: 13, fontWeight: 600, background: 'transparent' }}>
              {message}
            </Text>
          </Layout>
          <Text style={{ fontSize: 13, fontWeight: 400, background: 'transparent' }}>
            {description}
          </Text>
        </Layout>
      }
      type={alertType}
      showIcon={false}
      closable={false}
    />
  );
}; 