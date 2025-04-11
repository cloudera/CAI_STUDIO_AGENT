'use client';

import React, { useEffect, useState } from 'react';
import { useGetDefaultModelQuery } from '../models/modelsApi';
import {
  COMPATIBILITY_WARNING_2_0_47,
  ENTITLEMENT_WARNING_ML_ENABLE_COMPOSABLE_AMPS,
  NO_DEFAULT_LLM_NOTIFICATION,
  VERSION_WARNING_OUT_OF_DATE,
} from '../lib/constants';
import {
  useCheckStudioUpgradeStatusQuery,
  useUpgradeStudioMutation,
  useWorkbenchDetailsQuery,
} from '../lib/crossCuttingApi';
import { compareWorkbenchVersions } from '../lib/workbench';
import WarningMessageBox from './WarningMessageBox';
import { Button, Layout, Modal, Typography } from 'antd';
import { CheckStudioUpgradeStatusResponse } from '@/studio/proto/agent_studio';
import { SyncOutlined } from '@ant-design/icons';
import { useGlobalNotification } from './Notifications';
import * as semver from 'semver';
import { useGetWorkflowDataQuery } from '../workflows/workflowAppApi';

const { confirm } = Modal;
const { Text, Title, Paragraph } = Typography;

export interface UpgradeModalProps {
  upgradeStatus?: CheckStudioUpgradeStatusResponse;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ upgradeStatus, isOpen, setIsOpen }) => {
  const [upgradeStudio] = useUpgradeStudioMutation();
  const notificationsApi = useGlobalNotification();
  const [upgradePressed, setUpgradePressed] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const { data: workbenchDetails } = useWorkbenchDetailsQuery();

  const handleUpgrade = async () => {
    setUpgradePressed(true);

    upgradeStudio();

    notificationsApi.info({
      message: 'Upgrade In Progress',
      description:
        'Agent Studio is upgrading in the background. Agent Studio will restart once upgrades are complete.',
      placement: 'topRight',
    });
  };

  useEffect(() => {
    if (upgradePressed) {
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            window.location.href = workbenchDetails.www + '/home' || 'https://www.cloudera.com';
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [upgradePressed]);

  const isValidSemver = (version: string | undefined) => {
    return version && Boolean(semver.valid(version));
  };

  return (
    <>
      <Modal
        open={isOpen}
        onCancel={() => !upgradePressed && setIsOpen(false)}
        onClose={() => !upgradePressed && setIsOpen(false)}
        onOk={handleUpgrade}
        footer={
          !upgradePressed
            ? [
                <Button key="cancel" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>,
                <Button key="upgrade" type="primary" onClick={handleUpgrade}>
                  Upgrade
                </Button>,
              ]
            : []
        }
      >
        <Layout
          style={{
            background: 'transparent',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          {!upgradePressed ? (
            <>
              <Title level={4}>
                Upgrade Agent Studio to{' '}
                <b>
                  {isValidSemver(upgradeStatus?.local_version)
                    ? upgradeStatus?.newest_version
                    : upgradeStatus?.newest_version.substring(0, 7)}
                </b>
                {'?'}
                <SyncOutlined style={{ marginLeft: 12 }} />{' '}
              </Title>
              <Text>
                Current Version:{' '}
                <b>
                  {isValidSemver(upgradeStatus?.local_version)
                    ? upgradeStatus?.local_version
                    : upgradeStatus?.local_version.substring(0, 7)}
                </b>
              </Text>
              <Paragraph>
                Your version of Agent Studio is out of date. Upgrading Agent Studio will make both
                Agent Studio and the Ops & Metrics applications temporarily unavailable. You will
                not lose your workflows. Do you want to continue?
              </Paragraph>
            </>
          ) : (
            <>
              <>
                <Title level={4}>Agent Studio Upgrade Started</Title>
                <Paragraph>
                  Agent Studio will automatically close in <b>{countdown}</b> second
                  {countdown !== 1 ? 's' : ''}...
                </Paragraph>
              </>
            </>
          )}
        </Layout>
      </Modal>
    </>
  );
};

const MessageBoxes: React.FC = () => {
  const { data: defaultModel } = useGetDefaultModelQuery();
  const { data: workbench } = useWorkbenchDetailsQuery();
  const { data: upgradeStatus } = useCheckStudioUpgradeStatusQuery();
  const { data: workflowData } = useGetWorkflowDataQuery();
  const [isOpen, setIsOpen] = useState(false);

  const isOutOfDate = (upgradeStatus: CheckStudioUpgradeStatusResponse | undefined) => {
    return upgradeStatus && upgradeStatus.local_version !== upgradeStatus.newest_version;
  };

  const currentWarningMessages = [
    {
      messageTrigger: workflowData && workflowData?.renderMode === 'studio' && !defaultModel,
      message: NO_DEFAULT_LLM_NOTIFICATION,
    },
  ];
  workbench &&
    workbench.gitSha &&
    currentWarningMessages.push({
      messageTrigger: compareWorkbenchVersions(workbench.gitSha, '2.0.47') < 0,
      message: COMPATIBILITY_WARNING_2_0_47,
    });
  workbench &&
    currentWarningMessages.push({
      messageTrigger: !workbench.enable_ai_studios,
      message: ENTITLEMENT_WARNING_ML_ENABLE_COMPOSABLE_AMPS,
    });
  isOutOfDate(upgradeStatus) &&
    currentWarningMessages.push({
      messageTrigger: isOutOfDate(upgradeStatus) || true,
      message: VERSION_WARNING_OUT_OF_DATE(() => setIsOpen(true)),
    });

  return (
    <>
      <UpgradeModal upgradeStatus={upgradeStatus} isOpen={isOpen} setIsOpen={setIsOpen} />
      {currentWarningMessages.map((warningMessage) =>
        warningMessage.messageTrigger ? (
          <>
            <Layout
              style={{
                padding: 10,
                flexGrow: 0,
                flexShrink: 0,
                paddingBottom: 0,
              }}
            >
              <WarningMessageBox
                message={warningMessage.message}
                messageTrigger={warningMessage.messageTrigger}
              />
            </Layout>
          </>
        ) : (
          <></>
        ),
      )}
    </>
  );
};

export default MessageBoxes;
