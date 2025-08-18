'use client';

import React from 'react';
import { useGetWorkflowDataQuery } from '../workflows/workflowAppApi';
import StudioTopNav from './StudioTopNav';

// Removed unused Header

const TopNav: React.FC = () => {
  const { data: workflowData, isLoading } = useGetWorkflowDataQuery();

  if (isLoading) {
    return <></>;
  }

  // Check if we have a render mode
  if (!workflowData?.renderMode) {
    return <></>;
  }

  return workflowData?.renderMode === 'studio' ? <StudioTopNav /> : <></>;
};

export default TopNav;
