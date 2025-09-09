'use client';

import React from 'react';
import { Layout, Menu, Typography, Popover } from 'antd';
import { useRouter, usePathname } from 'next/navigation';
import '../globals.css';
import FeedbackContent from './FeedbackContent';
import * as semver from 'semver';
import { useCheckStudioUpgradeStatusQuery } from '../lib/crossCuttingApi';
import i18n from '../utils/i18n';

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
    { key: '/workflows', label: i18n.t('nav.agenticWorkflows') },
    { key: '/tools', label: i18n.t('nav.toolsCatalog') },
    { key: '/models', label: i18n.t('nav.llms') },
    { key: '/ops', label: i18n.t('nav.ops') },
    {
      key: '/feedback',
      label: (
        <Popover
          content={<FeedbackContent />}
          trigger="click"
          title={
            <div className="text-center">
              <Text className="text-base font-medium bg-transparent">
                {i18n.t('feedback.title')}
              </Text>
            </div>
          }
        >
          {i18n.t('nav.feedback')}
        </Popover>
      ),
    },
  ];

  const menuItemActions: Record<string, () => void> = {
    '/workflows': () => router.push('/workflows'),
    '/tools': () => router.push('/tools?section=tools'),
    '/models': () => router.push('/models'),
    '/ops': () => router.push('/ops'),
    '/feedback': () => {},
  };

  const getSelectedKey = () => {
    // Special case for MCP View page
    if (pathname.startsWith('/mcp')) {
      return '/tools';
    }

    // Sort by key length in descending order to prioritize longer matches
    const matchedItem = [...menuItems]
      .sort((a, b) => b.key.length - a.key.length)
      .find((item) => pathname.startsWith(item.key));

    return matchedItem ? matchedItem.key : '/';
  };

  return (
    <>
      {/* Header component with logo, text, and menu items */}
      <Header className="flex items-center justify-between sticky w-full p-4 bg-[#132329]">
        {/* Flex layout of the image logo and the text logo */}
        <Layout className="items-start justify-start flex h-full flex-row bg-transparent gap-3 flex-grow">
          <div className="flex flex-col justify-end">
            <Title
              level={1}
              className="text-white font-normal p-0 m-0 flex-grow-0 font-sans text-lg"
            >
              Agent Studio
            </Title>
          </div>
          <div className="flex h-full flex-col justify-end">
            <Title level={4} className="p-0 m-0 font-light text-sm flex-grow-0">
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
          className="flex-1 font-normal p-0 justify-end bg-[#132329]"
        />
      </Header>
    </>
  );
};

export default StudioTopNav;
