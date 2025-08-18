'use client';

import React from 'react';
import {
  readViewSettingsFromLocalStorage,
  writeViewSettingsToLocalStorage,
} from '../lib/localStorage';
import { Avatar, Button, Checkbox, Image, Input, Layout, Typography } from 'antd';
import '../globals.css';
import {
  CloudUploadOutlined,
  DeploymentUnitOutlined,
  FileDoneOutlined,
  SendOutlined,
  UsergroupAddOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { ViewSettings } from '../lib/types';

const { Title, Text, Paragraph } = Typography;

export interface HomeViewBannerCardProps {
  title: string;
  icon: React.ReactNode;
  content: string;
}

const HomeViewBannerCard: React.FC<HomeViewBannerCardProps> = ({ title, icon, content }) => {
  return (
    <>
      <Layout className="bg-transparent flex flex-row gap-2 p-0">
        <div className="flex-shrink-0">{icon}</div>
        <Layout className="flex-col bg-transparent gap-2">
          <Text className="h-6 text-lg font-normal">{title}</Text>
          <Text className="h-6 text-base font-normal">{content}</Text>
        </Layout>
      </Layout>
    </>
  );
};

const HomeViewBannerContent: React.FC = () => {
  const router = useRouter();

  const handleDontShowAgain = (dontShowAgain: boolean) => {
    const viewSettings: ViewSettings = readViewSettingsFromLocalStorage() || {};
    const updatedViewSettings: ViewSettings = {
      ...viewSettings,
      displayIntroPage: !dontShowAgain,
    };
    writeViewSettingsToLocalStorage(updatedViewSettings);
  };

  return (
    <Layout className="bg-transparent flex flex-col justify-center pl-16 pr-16 gap-6 max-w-[800px] flex-grow-0">
      <Title level={2} className="text-[#120046] text-6xl font-semibold pb-2 m-0 font-sans">
        Agent Studio
      </Title>
      <Paragraph className="text-sm font-normal p-0 m-0">
        A dedicated platform within the Cloudera AI ecosystem that empowers users to design, test,
        and deploy multi-agent workflows.
      </Paragraph>
      <HomeViewBannerCard
        title="Create Agent Workflows"
        icon={<Avatar icon={<DeploymentUnitOutlined />} className="bg-[#fff4cd] text-black" />}
        content="Start by creating a workflow assigning multiple agents, with configurations tailored to specific tasks and tools."
      />
      <HomeViewBannerCard
        title="Create Agents & Tools"
        icon={<Avatar icon={<UsergroupAddOutlined />} className="bg-[#edf7ff] text-black" />}
        content="Agents can be created as standalone entities, configured to work with tools, and reused across workflows."
      />
      <HomeViewBannerCard
        title="Assign Tasks"
        icon={<Avatar icon={<FileDoneOutlined />} className="bg-[#e5ffe5] text-black" />}
        content="Assign tasks to tell your agents what to do."
      />
      <HomeViewBannerCard
        title="Deploy Workflow"
        icon={<Avatar icon={<CloudUploadOutlined />} className="bg-[#f9eeff] text-black" />}
        content="Workflows can be deployed as standalone applications in Cloudera's AI Workbench, enabling other users to interact with and benefit from them for specific tasks."
      />
      <Layout className="flex-grow-0 flex flex-row items-center justify-start pt-8 gap-6">
        <Button
          type="primary"
          className="h-10 rounded bg-[#0074d2]"
          onClick={() => {
            router.push('/workflows');
          }}
        >
          Get Started
        </Button>
        <Checkbox onChange={(e) => handleDontShowAgain(e.target.checked)}>
          Don't show me this again
        </Checkbox>
      </Layout>
    </Layout>
  );
};

export interface HomeViewAgentToolTextCardProps {
  itemBackgroundColor: string;
  itemBorderColor: string;
  textColor: string;
  text: string;
  borderType: string;
}

const HomeViewAgentToolTextCard: React.FC<HomeViewAgentToolTextCardProps> = ({
  _itemBackgroundColor,
  _itemBorderColor,
  _textColor,
  text,
  _borderType,
}) => {
  return (
    <>
      <Text className="h-[22px] text-xs bg-[rgba(0,0,0,0.02)] text-[rgba(0,0,0,0.88)] p-[1px_8px] flex-shrink-0 rounded border-solid border-[1px] border-[#d9d9d9]">
        {text}
      </Text>
    </>
  );
};

export interface HomeViewAgentToolCardProps {
  borderColor: string;
  itemBackgroundColor: string;
  itemBorderColor: string;
  textColor: string;
}

const HomeViewDiagramAgentToolCard: React.FC<HomeViewAgentToolCardProps> = ({
  _borderColor,
  itemBackgroundColor,
  itemBorderColor,
  textColor,
}) => {
  return (
    <>
      <Layout className="flex flex-col justify-center items-center flex-grow-0 w-1/2 gap-2">
        <HomeViewAgentToolTextCard
          itemBorderColor={itemBorderColor}
          itemBackgroundColor={itemBackgroundColor}
          textColor={textColor}
          borderType="solid"
          text="Agent 1"
        />
        <Layout className="flex flex-row justify-center items-center flex-grow-0 flex-shrink-0 m-0 p-0 gap-2">
          <HomeViewAgentToolTextCard
            itemBorderColor={itemBorderColor}
            itemBackgroundColor={itemBackgroundColor}
            textColor={textColor}
            borderType="dashed"
            text="Tool 1"
          />
          <HomeViewAgentToolTextCard
            itemBorderColor={itemBorderColor}
            itemBackgroundColor={itemBackgroundColor}
            textColor={textColor}
            borderType="dashed"
            text="Tool 2"
          />
        </Layout>
      </Layout>
    </>
  );
};

const HomeViewDiagramContent: React.FC = () => {
  return (
    <>
      <Layout className="flex flex-col justify-center items-center flex-grow-0 w-1/2 gap-2">
        <Image
          src="/ic-brand-developer-engineer.svg"
          className="w-[80px] h-[80px] text-[#5284ff] flex-grow-0"
        />
        <Layout className="flex flex-row justify-center items-center flex-grow-0 flex-shrink-0 m-0 p-0 gap-2">
          <HomeViewDiagramAgentToolCard
            borderColor="#ff8400"
            itemBackgroundColor="#fff7e6"
            itemBorderColor="#ffd591"
            textColor="#fa8c16"
          />
          <HomeViewDiagramAgentToolCard
            borderColor="#4ccf4c"
            itemBackgroundColor="#f6ffed"
            itemBorderColor="#b7eb8f"
            textColor="#52c41a"
          />
          <HomeViewDiagramAgentToolCard
            borderColor="#c354ff"
            itemBackgroundColor="#f9f0ff"
            itemBorderColor="#d3adf7"
            textColor="#722ed1"
          />
        </Layout>
        <Layout className="flex flex-row justify-center items-center flex-grow-0 flex-shrink-0 m-0 p-0 gap-[72px]">
          <Image src="vec1.svg" />
          <Image src="vec2.svg" />
          <Image src="vec3.svg" />
        </Layout>
        <Layout className="flex flex-row gap-7 justify-center items-center flex-grow-0 m-0 p-0">
          <HomeViewAgentToolTextCard
            itemBorderColor="#d9d9d9"
            itemBackgroundColor="rgba(0, 0, 0, 0.02)"
            textColor="rgba(0, 0, 0, 0.88)"
            borderType="solid"
            text="Task 1"
          />
          <HomeViewAgentToolTextCard
            itemBorderColor="#d9d9d9"
            itemBackgroundColor="rgba(0, 0, 0, 0.02)"
            textColor="rgba(0, 0, 0, 0.88)"
            borderType="solid"
            text="Task 2"
          />
          <HomeViewAgentToolTextCard
            itemBorderColor="#d9d9d9"
            itemBackgroundColor="rgba(0, 0, 0, 0.02)"
            textColor="rgba(0, 0, 0, 0.88)"
            borderType="solid"
            text="Task 3"
          />
        </Layout>
        <Layout className="flex flex-row justify-center items-center flex-grow-0 m-0 p-0">
          <Image src="vec2.svg" />
        </Layout>
        <Button type="primary" className="rounded bg-[#1890ff]">
          Test
        </Button>
        <Layout className="flex flex-row justify-center items-center flex-grow-0 m-0 p-0">
          <Image src="vec2.svg" />
        </Layout>
        <Layout className="rounded bg-white shadow-md w-[317.8px] h-[160.5px] flex-grow-0 p-3">
          {/* Cloudera agent studio header */}
          <Layout className="flex flex-row items-center justify-start flex-grow-0 gap-1 bg-transparent">
            <Image src="/cloudera-logo.svg" preview={false} color="gray" className="w-[18.6px]" />
            <Image
              src="/cloudera-agent-studio-text.svg"
              preview={false}
              color="gray"
              className="w-[47.4px]"
            />
          </Layout>
          <Layout className="bg-transparent justify-end flex-grow-0 flex-shrink-0 flex-row pt-6 gap-2">
            <Text className="text-xs font-light">
              What are the most customer service complaints?
            </Text>
            <Avatar icon={<UserOutlined />} size={14} className="bg-[#f7c200] flex-shrink-0" />
          </Layout>
          <Layout className="bg-transparent justify-start items-start flex-grow-0 flex-shrink-0 flex-row pt-6 gap-2">
            <Avatar icon={<UserOutlined />} size={14} className="bg-[#008cff] flex-shrink-0" />
            <Paragraph className="text-xs font-light bg-[#f4f5f6] rounded p-1">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
              incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
              exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
            </Paragraph>
          </Layout>
        </Layout>

        <Layout className="rounded bg-white shadow-md w-[317.8px] h-[40.1px] flex-grow-0 mt-3 flex-row gap-1.5 p-2.5 items-center">
          <Input
            className="bg-[#f4f5f6] h-[22.3px] text-[10px] border-none rounded w-[22.3px] flex-shrink-0"
            placeholder="Ask your question here"
          />
          <Button
            className="bg-[#f4f5f6] border-none h-[22.3px] rounded w-[22.3px] flex-shrink-0"
            icon={<SendOutlined />}
          />
        </Layout>
      </Layout>
    </>
  );
};

const HomeView: React.FC = () => {
  return (
    <>
      <Layout className="flex-1 flex flex-row justify-center items-center">
        <HomeViewBannerContent />
        <HomeViewDiagramContent />
      </Layout>
    </>
  );
};

export default HomeView;
