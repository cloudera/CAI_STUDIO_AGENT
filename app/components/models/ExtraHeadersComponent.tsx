'use client';

import React from 'react';
import { Input, Button, Space } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '@/app/lib/hooks/hooks';
import {
  selectModelRegisterExtraHeaders,
  setModelRegisterExtraHeaders,
} from '@/app/models/modelsSlice';

// removed unused Text

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
      <Space direction="vertical" size="small" className="w-full">
        {Object.entries(extraHeaders).map(([key, value], index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              placeholder="Header key"
              value={key}
              onChange={(e) => updateHeader(key, 'key', e.target.value)}
              className="flex-1"
            />
            <Input.Password
              placeholder="Header value"
              value={value}
              onChange={(e) => updateHeader(key, 'value', e.target.value)}
              className="flex-1"
            />
            <MinusCircleOutlined
              onClick={() => removeHeader(key)}
              className="cursor-pointer text-[#ff4d4f]"
            />
          </div>
        ))}

        <Button type="dashed" onClick={addHeader} icon={<PlusOutlined />} className="w-full">
          Add Header
        </Button>
      </Space>
    </div>
  );
};

export default ExtraHeadersComponent;
