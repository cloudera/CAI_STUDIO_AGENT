'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Form, Input, Button, Space, Typography } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '@/app/lib/hooks/hooks';
import {
  selectModelRegisterExtraHeaders,
  setModelRegisterExtraHeaders,
} from '@/app/models/modelsSlice';

const { Text } = Typography;

interface ExtraHeadersComponentProps {}

const ExtraHeadersComponent: React.FC<ExtraHeadersComponentProps> = ({}) => {
  const dispatch = useAppDispatch();
  const extraHeaders = useAppSelector(selectModelRegisterExtraHeaders) || {};

  const updateHeader = (oldKey: string, field: 'key' | 'value', newValue: string) => {
    const newHeaders = { ...extraHeaders };

    if (field === 'key') {
      // Remove old key and add new key with same value
      const value = newHeaders[oldKey];
      delete newHeaders[oldKey];
      if (newValue.trim()) {
        newHeaders[newValue] = value;
      }
    } else {
      // Update value for existing key
      newHeaders[oldKey] = newValue;
    }

    dispatch(setModelRegisterExtraHeaders(newHeaders));
  };

  const addHeader = () => {
    const newHeaders = { ...extraHeaders, '': '' };
    dispatch(setModelRegisterExtraHeaders(newHeaders));
  };

  const removeHeader = (keyToRemove: string) => {
    const newHeaders = { ...extraHeaders };
    delete newHeaders[keyToRemove];
    dispatch(setModelRegisterExtraHeaders(newHeaders));
  };

  return (
    <div>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {Object.entries(extraHeaders).map(([key, value], index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input
              placeholder="Header key"
              value={key}
              onChange={(e) => updateHeader(key, 'key', e.target.value)}
              style={{ flex: 1 }}
            />
            <Input.Password
              placeholder="Header value"
              value={value}
              onChange={(e) => updateHeader(key, 'value', e.target.value)}
              style={{ flex: 1 }}
            />
            <MinusCircleOutlined
              onClick={() => removeHeader(key)}
              style={{ cursor: 'pointer', color: '#ff4d4f' }}
            />
          </div>
        ))}

        <Button type="dashed" onClick={addHeader} icon={<PlusOutlined />} style={{ width: '100%' }}>
          Add Header
        </Button>
      </Space>
    </div>
  );
};

export default ExtraHeadersComponent;
