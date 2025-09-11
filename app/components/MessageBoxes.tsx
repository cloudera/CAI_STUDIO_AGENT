'use client';

import React, { useEffect, useState } from 'react';
import { useGetDefaultModelQuery } from '../models/modelsApi';
import {
  COMPATIBILITY_WARNING_2_0_47,
  ENTITLEMENT_WARNING_ML_ENABLE_COMPOSABLE_AMPS,
  NO_DEFAULT_LLM_NOTIFICATION,
  VERSION_WARNING_OUT_OF_DATE,
  API_KEY_ROTATION_NEEDED,
} from '../lib/constants';
import {
  useCheckStudioUpgradeStatusQuery,
  useUpgradeStudioMutation,
  useWorkbenchDetailsQuery,
  useHealthCheckQuery,
  useRotateApiKeyMutation,
  useCmlApiCheckQuery,
} from '../lib/crossCuttingApi';
import { compareWorkbenchVersions } from '../lib/workbench';
import WarningMessageBox from './WarningMessageBox';
import { Button, Layout, Modal, Typography, Alert } from 'antd';
import i18n from '@/app/utils/i18n';
import { CheckStudioUpgradeStatusResponse } from '@/studio/proto/agent_studio';
import { SyncOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useGlobalNotification } from './Notifications';
import * as semver from 'semver';
import { useGetWorkflowDataQuery } from '../workflows/workflowAppApi';

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
            const baseUrl = workbenchDetails?.www || 'https://www.cloudera.com';
            window.location.href = `${baseUrl}/home`;
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [upgradePressed, workbenchDetails?.www]);

  const isValidSemver = (version: string | undefined) => {
    return version && Boolean(semver.valid(version));
  };

  return (
    <>
      <Modal
        open={isOpen}
        onCancel={() => !upgradePressed && setIsOpen(false)}
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
        <Layout className="flex-col gap-6 bg-transparent">
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
                <SyncOutlined className="ml-3" />{' '}
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
              <Title level={4}>Agent Studio Upgrade Started</Title>
              <Paragraph>
                Agent Studio will automatically close in <b>{countdown}</b> second
                {countdown !== 1 ? 's' : ''}...
              </Paragraph>
            </>
          )}
        </Layout>
      </Modal>
    </>
  );
};

const MessageBoxes: React.FC = () => {
  const { data: workflowData } = useGetWorkflowDataQuery();

  // Default workflowMode to true while workflowData is loading
  // to avoid making grpc calls during workflow app mode.
  const isWorkflowMode = workflowData ? workflowData.renderMode === 'workflow' : true;

  // Skip all other API calls if in workflow mode
  const { data: isHealthy } = useHealthCheckQuery(undefined, {
    skip: isWorkflowMode,
  });
  const [hasInitialHealthCheck, setHasInitialHealthCheck] = useState(false);
  const { data: defaultModel } = useGetDefaultModelQuery(undefined, {
    skip: isWorkflowMode || !hasInitialHealthCheck,
  });
  const { data: workbench } = useWorkbenchDetailsQuery(undefined, {
    skip: isWorkflowMode,
  });
  const { data: upgradeStatus } = useCheckStudioUpgradeStatusQuery(undefined, {
    skip: isWorkflowMode,
  });
  const [isOpen, setIsOpen] = useState(false);
  const [isRotateModalOpen, setIsRotateModalOpen] = useState(false);
  const [rotateApiKey] = useRotateApiKeyMutation();
  const notificationsApi = useGlobalNotification();
  const [isRotating, setIsRotating] = useState(false);
  const [closedWarnings, setClosedWarnings] = useState<Set<number>>(new Set());

  // Add CML API check with proper skip condition
  const { data: cmlApiCheck, refetch: refetchApiCheck } = useCmlApiCheckQuery(undefined, {
    skip: isWorkflowMode || !hasInitialHealthCheck,
  });

  useEffect(() => {
    if (isHealthy && !hasInitialHealthCheck) {
      setHasInitialHealthCheck(true);
    }
  }, [isHealthy, hasInitialHealthCheck]);

  // Early return if in workflow mode
  if (isWorkflowMode) {
    return null;
  }

  const isOutOfDate = (upgradeStatus: CheckStudioUpgradeStatusResponse | undefined) => {
    return upgradeStatus && upgradeStatus.local_version !== upgradeStatus.newest_version;
  };

  const currentWarningMessages = [
    {
      messageTrigger:
        hasInitialHealthCheck && workflowData?.renderMode === 'studio' && !defaultModel,
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

  const handleRotateKeys = async () => {
    try {
      setIsRotating(true);

      // Show acknowledgment notification
      notificationsApi.info({
        message: i18n.t('keys.rotate.infoTitle'),
        description: i18n.t('keys.rotate.infoDesc'),
        placement: 'topRight',
      });

      await rotateApiKey().unwrap();
      setIsRotateModalOpen(false);
      setIsRotating(false);

      notificationsApi.success({
        message: i18n.t('keys.rotate.successTitle'),
        description: (
          <Layout className="flex flex-col gap-1 bg-transparent">
            <Text>{i18n.t('keys.rotate.successLine1')}</Text>
            <Text>{i18n.t('keys.rotate.successLine2')}</Text>
          </Layout>
        ),
        placement: 'topRight',
        duration: 5,
      });

      await refetchApiCheck();
    } catch (err: any) {
      setIsRotating(false);
      notificationsApi.error({
        message: i18n.t('keys.rotate.errorTitle'),
        description: err.message || i18n.t('keys.rotate.errorDesc'),
        placement: 'topRight',
      });
      setIsRotateModalOpen(false);
    }
  };

  // Only add API key warning if we have a response and there's an error message
  if (hasInitialHealthCheck && workflowData?.renderMode === 'studio' && cmlApiCheck?.message) {
    currentWarningMessages.push({
      messageTrigger: true,
      message: API_KEY_ROTATION_NEEDED(() => setIsRotateModalOpen(true)),
    });
  }

  return (
    <>
      <Modal
        open={isRotateModalOpen}
        title={i18n.t('keys.rotate.modalTitle')}
        onCancel={() => setIsRotateModalOpen(false)}
        centered
        footer={[
          <Button key="cancel" onClick={() => setIsRotateModalOpen(false)} disabled={isRotating}>
            {i18n.t('common.cancel')}
          </Button>,
          <Button key="rotate" type="primary" onClick={handleRotateKeys} loading={isRotating}>
            {isRotating ? i18n.t('keys.rotate.ctaWorking') : i18n.t('keys.rotate.cta')}
          </Button>,
        ]}
      >
        <Alert
          className="flex-start justify-start p-3 mb-3"
          message={
            <Layout className="flex-col gap-1 p-0 bg-transparent">
              <Layout className="flex-row items-center gap-2 bg-transparent">
                <InfoCircleOutlined className="text-yellow-500 text-lg" />
                <Text className="text-sm font-semibold">{i18n.t('keys.rotate.warnTitle')}</Text>
              </Layout>
              <Text className="text-sm font-normal">{i18n.t('keys.rotate.warnDesc')}</Text>
            </Layout>
          }
          type="warning"
          showIcon={false}
          closable={false}
        />
        <Typography.Paragraph>{i18n.t('keys.rotate.confirm')}</Typography.Paragraph>
      </Modal>

      <UpgradeModal upgradeStatus={upgradeStatus} isOpen={isOpen} setIsOpen={setIsOpen} />
      {currentWarningMessages.map((warningMessage, index) =>
        warningMessage.messageTrigger && !closedWarnings.has(index) ? (
          <WarningMessageBox
            key={`warning-${index}`}
            message={warningMessage.message}
            messageTrigger={warningMessage.messageTrigger}
            onClose={() => {
              setClosedWarnings((prev) => new Set(prev).add(index));
            }}
          />
        ) : null,
      )}
    </>
  );
};

export default MessageBoxes;
