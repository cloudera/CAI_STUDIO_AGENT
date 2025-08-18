'use client';

import React, { useEffect, Suspense } from 'react';
import { Layout, Typography, Button } from 'antd';
import { PlusCircleOutlined } from '@ant-design/icons';
import ModelList from '../components/models/ModelList';
import { useSearchParams } from 'next/navigation';
import CommonBreadCrumb from '../components/CommonBreadCrumb';
import ModelTestDrawer from '@/app/components/models/ModelTestDrawer';
import ModelRegisterDrawer from '@/app/components/models/ModelRegisterDrawer';
import { useAppDispatch } from '../lib/hooks/hooks';
import { resetModelRegisterDetails, setIsRegisterDrawerOpen } from './modelsSlice';

const { Title } = Typography;

const ModelsRegisterHeader: React.FC = () => {
  const dispatch = useAppDispatch();

  return (
    <Layout className="bg-transparent flex flex-row items-center justify-between flex-grow-0 p-3">
      {/* Descriptive Text */}
      <Typography.Text className="font-normal m-0">
        Register language models which will be used to build agents and workflows.
      </Typography.Text>

      {/* Register New Model Button */}
      <Button
        type="primary"
        icon={<PlusCircleOutlined />}
        onClick={() => {
          dispatch(setIsRegisterDrawerOpen(true));
          dispatch(resetModelRegisterDetails());
        }}
        className="ml-4"
      >
        Register New Model
      </Button>
    </Layout>
  );
};

/**
 * This is the main component for the Models page.
 */
const ModelsPageContent: React.FC = () => {
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();

  // If our URL specifies, open a new model registration.
  useEffect(() => {
    if (searchParams.get('promptNewModelRegistration') === 'true') {
      dispatch(setIsRegisterDrawerOpen(true));
      dispatch(resetModelRegisterDetails());
    }
  }, [searchParams]);

  return (
    <>
      <ModelTestDrawer />
      <ModelRegisterDrawer />
      <Layout className="flex-1 p-4 md:p-6 lg:p-6 flex flex-col">
        <CommonBreadCrumb items={[{ title: 'Language Models' }]} />
        <Title level={2} className="mt-4">
          Models
        </Title>
        <ModelsRegisterHeader />
        <ModelList />
      </Layout>
    </>
  );
};

// Main Component
const ModelsPage = () => {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ModelsPageContent />
    </Suspense>
  );
};

export default ModelsPage;
