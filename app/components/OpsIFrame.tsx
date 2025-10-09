'use client';

import React, { useEffect, useState } from 'react';
import Content from 'antd/lib/layout';
import { useGetOpsDataQuery } from '../ops/opsApi';
import LargeCenterSpin from './common/LargeCenterSpin';

const OpsIFrame: React.FC = () => {
  const { data: opsData, isLoading } = useGetOpsDataQuery();
  const [iframeUrl, setIFrameUrl] = useState(opsData?.ops_display_url);

  useEffect(() => {
    if (opsData) {
      setIFrameUrl(opsData.ops_display_url);
    }
  }, [opsData]);

  return (
    <Content className="flex flex-col justify-center items-center overflow-hidden flex-1 w-full">
      {!isLoading ? (
        <div className="flex-1 overflow-hidden w-full">
          <iframe
            src={`${iframeUrl}`}
            className="w-full h-full border-none"
            title="Embedded Content"
          />
        </div>
      ) : (
        <LargeCenterSpin message="Loading ops..." />
      )}
    </Content>
  );
};

export default OpsIFrame;
