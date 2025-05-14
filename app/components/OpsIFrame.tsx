'use client';

import React, { useEffect, useRef, useState } from 'react';
import Content from 'antd/lib/layout';
import { Spin } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { useGetOpsDataQuery } from '../ops/opsApi';


const OpsIFrame: React.FC = () => {
  const { data: opsData, isLoading } = useGetOpsDataQuery();
  const [iframeUrl, setIFrameUrl] = useState(opsData?.ops_display_url);

  useEffect(() => {
    if (opsData) {
      setIFrameUrl(opsData.ops_display_url);
    }
  }, [opsData]);

  const loadingIndicator = <LoadingOutlined style={{ fontSize: 48 }} spin />;
  return (
    <Content
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        flex: 1,
        width: '100%',
      }}
    >
      {!isLoading ? (
        <div style={{ flex: 1, overflow: 'hidden', width: '100%' }}>
          <iframe
            src={`${iframeUrl}`}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="Embedded Content"
          />
        </div>
      ) : (
        <Spin indicator={loadingIndicator} />
      )}
    </Content>
  );
};

export default OpsIFrame;
