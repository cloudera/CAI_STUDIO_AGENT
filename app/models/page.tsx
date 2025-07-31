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
    <Layout
      style={{
        background: 'transparent',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexGrow: 0,
        padding: '12px 0',
      }}
    >
      {/* Descriptive Text */}
      <Typography.Text style={{ fontWeight: 400, margin: 0 }}>
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
        style={{ margin: '0 0 0 16px' }}
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
      <Layout style={{ flex: 1, padding: '16px 24px 22px', flexDirection: 'column' }}>
        <CommonBreadCrumb items={[{ title: 'Language Models' }]} />
        <Title level={2} style={{ marginTop: '16px' }}>
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
