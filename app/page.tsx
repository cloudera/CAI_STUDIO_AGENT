'use client';

import React, { useEffect, useState } from 'react';
import 'antd/dist/reset.css';
import WorkflowAppDeployed from './components/workflowApp/WorkflowAppDeployed';
import { Layout, Spin, Typography } from 'antd';
import { useGetWorkflowDataQuery } from './workflows/workflowAppApi';
import { LocalStorageState, ViewSettings } from './lib/types';
import HomeView from './components/HomeView';
import { useRouter } from 'next/navigation';
import { useAppDispatch } from './lib/hooks/hooks';
import { readLocalStorageState, readViewSettingsFromLocalStorage } from './lib/localStorage';
import ContentWithHealthCheck from './components/ContentWithHealthCheck';

const { Title, Text } = Typography;

const HomePage: React.FC = () => {
  // Make a call to /api/wflow in the node server to get rendering information.
  // note that RTK will cache this and there is nothing invalidating this, so
  // it will only be called once.
  const { data: wflowData, isLoading } = useGetWorkflowDataQuery();
  const [viewSettings, setViewSettings] = useState<ViewSettings>();
  const router = useRouter();
  const dispatch = useAppDispatch();

  /**
   * If we haven't initialized local storage state yet, then we need to
   * set some initial values
   */
  useEffect(() => {
    setViewSettings(readViewSettingsFromLocalStorage());
  }, []);

  if (isLoading === true) {
    // Show a loading spinner while data is being fetched
    return (
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}
      >
        <Spin size="large" />
      </div>
    );
  }

  // Show loading if the render mode is not returning proper information.
  if (!wflowData?.renderMode) {
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
        <Text>Retrieving workflow and render mode...</Text>
      </div>
    );
  }

  // Render workflow
  if (wflowData?.renderMode === 'workflow') {
    return (
      <Layout
        style={{
          padding: 36,
          flexDirection: 'column',
        }}
      >
        <Layout
          style={{
            background: 'transparent',
            padding: 0,
            marginBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexGrow: 0,
            flexShrink: 0,
          }}
        >
          <Title level={1} ellipsis style={{ flexGrow: 1 }}>
            {wflowData.workflow.name}
          </Title>
          <Layout
            style={{
              backgroundColor: '#132329',
              opacity: 0.7,
              borderRadius: 4,
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              flexGrow: 0,
              flexShrink: 0,
              padding: 12,
            }}
          >
            <Text className="font-sans" style={{ fontSize: 12, fontWeight: 200, color: 'white' }}>
              built with
            </Text>
            <Text className="font-sans" style={{ fontSize: 16, fontWeight: 200, color: 'white' }}>
              Cloudera <b>Agent Studio</b>
            </Text>
          </Layout>
        </Layout>
        <WorkflowAppDeployed workflowData={wflowData} />
      </Layout>
    );
  }

  if (!viewSettings) {
    // Show a loading spinner while local store data is being fetched
    return (
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}
      >
        <Spin size="large" />
      </div>
    );
  }

  // If we are not displaying the intro page for the user anymore, then
  // route to the /workflows page
  if (viewSettings.displayIntroPage === false) {
    // Show a loading spinner while we wait for workflows page.
    router.push('/workflows');
    return (
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}
      >
        <Spin size="large" />
      </div>
    );
  }

  // If we've made it this far, it's time to render the home page ("starting" page.)
  // NOTE: we don't need to wrap the workflow app around the health check becuase the health
  // check is only for the gRPC server, which the workflow app does not depend on.
  return (
    <>
      <ContentWithHealthCheck>
        <HomeView />
      </ContentWithHealthCheck>
    </>
  );
};

export default HomePage;
