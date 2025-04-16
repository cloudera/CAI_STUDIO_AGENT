'use client';

import React from 'react';
import { Layout, Menu, Typography, Popover } from 'antd';
import { useRouter, usePathname } from 'next/navigation';
import '../globals.css';
import FeedbackContent from './FeedbackContent';
import * as semver from 'semver';
import { useCheckStudioUpgradeStatusQuery } from '../lib/crossCuttingApi';

const { Text, Title } = Typography;
const { Header } = Layout;

const StudioTopNav: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { data: upgradeStatus } = useCheckStudioUpgradeStatusQuery();

  const isValidSemver = (version: string | undefined) => {
    return version && Boolean(semver.valid(version));
  };

  const menuItems = [
    { key: '/workflows', label: 'Agentic Workflows' },
    { key: '/tools', label: 'Tools Catalog' },
    { key: '/models', label: 'LLMs' },
    {
      key: '/feedback',
      label: (
        <Popover
          content={<FeedbackContent />}
          trigger="click"
          title={
            <div style={{ textAlign: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: 500, background: 'transparent' }}>
                Please Provide Feedback
              </Text>
            </div>
          }
        >
          Feedback
        </Popover>
      ),
    },
  ];

  const menuItemActions: Record<string, () => void> = {
    '/workflows': () => router.push('/workflows'),
    '/tools': () => router.push('/tools'),
    '/models': () => router.push('/models'),
    '/feedback': () => {},
  };

  const getSelectedKey = () => {
    // Sort by key length in descending order to prioritize longer matches
    const matchedItem = [...menuItems]
      .sort((a, b) => b.key.length - a.key.length)
      .find((item) => pathname.startsWith(item.key));

    return matchedItem ? matchedItem.key : '/';
  };

  return (
    <>
      {/* Header component with logo, text, and menu items */}
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          width: '100%',
          padding: '16px 24px',
          backgroundColor: '#132329',
        }}
      >
        {/* Flex layout of the image logo and the text logo */}
        <Layout
          style={{
            alignItems: 'top',
            justifyContent: 'flex-start',
            display: 'flex',
            height: '100%',
            flexDirection: 'row',
            backgroundColor: 'transparent',
            gap: 12,
            flexGrow: 1,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
            }}
          >
            <Title
              level={1}
              style={{
                fontSize: 20,
                color: 'white',
                fontWeight: 400,
                padding: 0,
                margin: 0,
                flexGrow: 0,
              }}
              className="font-sans"
            >
              Agent Studio
            </Title>
          </div>
          <div
            style={{
              display: 'flex',
              height: '100%',
              flexDirection: 'column',
              justifyContent: 'flex-end',
            }}
          >
            <Title
              level={4}
              style={{ padding: 0, margin: 0, fontWeight: 200, fontSize: 14, flexGrow: 0 }}
            >
              {isValidSemver(upgradeStatus?.local_version) && <i>{upgradeStatus?.local_version}</i>}
            </Title>
          </div>
        </Layout>

        {/* Navigation bar menu items */}
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[getSelectedKey()]} // Highlight the current route
          items={menuItems}
          onClick={(e) => menuItemActions[e.key]()} // Navigate using Next.js router
          style={{
            flex: 1,
            fontWeight: 'normal',
            padding: 0,
            justifyContent: 'flex-end',
            backgroundColor: '#132329',
          }}
        />
      </Header>
    </>
  );
};

export default StudioTopNav;
