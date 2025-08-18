'use client';

import React, { useEffect, useState } from 'react';
import 'antd/dist/reset.css';
import WorkflowAppDeployed from './components/workflowApp/WorkflowAppDeployed';
import { Layout } from 'antd';
import { useGetWorkflowDataQuery } from './workflows/workflowAppApi';
import { ViewSettings } from './lib/types';
import HomeView from './components/HomeView';
import { useRouter } from 'next/navigation';
import { readViewSettingsFromLocalStorage } from './lib/localStorage';
import ContentWithHealthCheck from './components/ContentWithHealthCheck';
import LargeCenterSpin from './components/common/LargeCenterSpin';

/**
 * Main entry point for the application. This page is responsible for:
 * - rendering the home page (starting page) if the user has not selected to skip the intro page
 * - rendering the workflow app if this is a deployed workflow
 *
 * If the home page has been opted out of, then the component will redirect
 * to the /workflows page.
 */
const HomePage: React.FC = () => {
  // Make a call to /api/wflow in the node server to get rendering information.
  // note that RTK will cache this and there is nothing invalidating this, so
  // it will only be called once.
  const { data: wflowData, isLoading } = useGetWorkflowDataQuery();
  const [viewSettings, setViewSettings] = useState<ViewSettings>();
  const router = useRouter();

  /**
   * If we haven't initialized local storage state yet, then we need to
   * set some initial values
   */
  useEffect(() => {
    setViewSettings(readViewSettingsFromLocalStorage());
  }, []);

  useEffect(() => {
    if (viewSettings?.displayIntroPage === false) {
      router.push('/workflows');
    }
  }, [viewSettings]);

  if (isLoading === true) {
    // Show a loading spinner while data is being fetched
    return <LargeCenterSpin message="Retrieving workflow and render mode..." />;
  }

  // Show loading if the render mode is not returning proper information.
  if (!wflowData || !wflowData?.renderMode) {
    return (
      <LargeCenterSpin message="Issue retrieving workflow and render mode (is the deployed model running?)" />
    );
  }

  // Render workflow app.
  if (wflowData.renderMode === 'workflow') {
    return (
      <Layout className="p-[36px] flex flex-col">
        <WorkflowAppDeployed workflowData={wflowData} />
      </Layout>
    );
  }

  if (!viewSettings) {
    // Show a loading spinner while local store data is being fetched
    return <LargeCenterSpin message="Retrieving view settings..." />;
  }

  // If we are not displaying the intro page for the user anymore, then
  // route to the /workflows page
  if (viewSettings.displayIntroPage === false) {
    // Show a loading spinner while we wait for workflows page.
    return <LargeCenterSpin message="Loading workflows..." />;
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
