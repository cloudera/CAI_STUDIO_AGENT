import path from 'path';
import React, { useState, useEffect, useRef } from 'react';
import { Layout, Typography, List, Button, Modal, Input, message, Alert, Spin, Select } from 'antd';
import { Workflow, DeployedWorkflow, WorkflowTemplateMetadata } from '@/studio/proto/agent_studio';
import SearchBar from './WorkflowSearchBar';
import WorkflowListItem from './WorkflowListItem';
import { useImportWorkflowTemplateMutation } from '@/app/workflows/workflowsApi';
import {
  PlusCircleOutlined,
  LoadingOutlined,
  RightOutlined,
  LeftOutlined,
} from '@ant-design/icons';
import { useGlobalNotification } from '../Notifications';
import i18n from '@/app/utils/i18n';

const { Text } = Typography;

interface ImportWorkflowTemplateModalProps {
  visible: boolean;
  onClose: () => void;
}

const ImportWorkflowTemplateModal: React.FC<ImportWorkflowTemplateModalProps> = ({
  visible,
  onClose,
}) => {
  const filePrefix = '/home/cdsw/';
  const notificationsApi = useGlobalNotification();
  const [importFilePath, setImportFilePath] = useState(filePrefix);
  const [fileExists, setFileExists] = useState<boolean | null>(null);
  const [isCheckingFile, setIsCheckingFile] = useState(false);
  const fileCheckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [importWorkflowTemplate, { isLoading: isImporting }] = useImportWorkflowTemplateMutation();

  useEffect(() => {
    if (visible) {
      setImportFilePath(filePrefix);
    }
  }, [visible]);

  useEffect(() => {
    // Reset status when path changes
    setFileExists(null);
    setIsCheckingFile(false);

    // Clear any existing timer
    if (fileCheckTimerRef.current) {
      clearTimeout(fileCheckTimerRef.current);
    }

    // Only check if we have a valid path and modal is open
    if (visible && importFilePath.length > filePrefix.length) {
      setIsCheckingFile(true);

      // Set a new timer to check file existence after 2 seconds
      fileCheckTimerRef.current = setTimeout(async () => {
        try {
          const response = await fetch(
            `/api/file/checkPresence?filePath=${encodeURIComponent(importFilePath.replace(filePrefix, ''))}`,
          );
          const data = await response.json();
          setFileExists(data.exists);
        } catch (error) {
          console.error('Failed to check file existence:', error);
          setFileExists(false);
        } finally {
          setIsCheckingFile(false);
        }
      }, 2000);
    }

    // Cleanup function
    return () => {
      if (fileCheckTimerRef.current) {
        clearTimeout(fileCheckTimerRef.current);
      }
    };
  }, [importFilePath, visible]);

  const handleImportWorkflowTemplate = async () => {
    try {
      await importWorkflowTemplate({ file_path: importFilePath }).unwrap();
      message.success(i18n.t('workflow.import.success'));
      onClose();
    } catch (error) {
      message.error(i18n.t('workflow.import.errorMsg', (error as Error).message));
      notificationsApi.error({
        message: i18n.t('workflow.import.errorTitle'),
        description: (error as Error).message,
        placement: 'topRight',
      });
    }
  };

  return (
    <Modal
      title={<div className="text-center">{i18n.t('workflow.import.title')}</div>}
      open={visible}
      onOk={handleImportWorkflowTemplate}
      okText={i18n.t('workflow.import.ok')}
      cancelText={i18n.t('common.cancel')}
      onCancel={onClose}
      confirmLoading={isImporting}
      width="40%"
    >
      <p className="mb-2">{i18n.t('workflow.import.prompt')}</p>
      {importFilePath.length > filePrefix.length && (
        <div className="h-[30px] mb-2 flex items-center">
          {(fileExists === null || isCheckingFile) && <Spin indicator={<LoadingOutlined spin />} />}
          {!isCheckingFile && (
            <Alert
              className="w-full"
              message={
                <Layout className="flex flex-col gap-1 p-0 bg-transparent">
                  <Text className="text-[10px] font-light bg-transparent">
                    {fileExists
                      ? i18n.t('workflow.import.found', path.basename(importFilePath))
                      : i18n.t('workflow.import.notFound')}
                  </Text>
                </Layout>
              }
              type={fileExists ? 'success' : 'warning'}
              showIcon
            />
          )}
        </div>
      )}
      <div className="flex items-center">
        <span className="mr-1 text-[#850020] font-mono">{filePrefix}</span>
        <Input
          value={importFilePath.replace(filePrefix, '')}
          onChange={(e) => setImportFilePath(`${filePrefix}${e.target.value}`)}
          placeholder={i18n.t('workflow.import.placeholder')}
          status={fileExists === false && !isCheckingFile ? 'warning' : undefined}
        />
      </div>
    </Modal>
  );
};

interface WorkflowListProps {
  workflows: Workflow[];
  deployedWorkflows: DeployedWorkflow[];
  workflowTemplates: WorkflowTemplateMetadata[];
  editWorkflow: (workflowId: string) => void;
  deleteWorkflow: (workflowId: string) => void;
  deleteWorkflowTemplate: (workflowTemplateId: string) => void;
  testWorkflow: (workflowId: string) => void;
  onDeploy: (workflow: Workflow) => void;
  onDeleteDeployedWorkflow: (deployedWorkflow: DeployedWorkflow) => void;
  onCreateWorkflow: (name: string, templateId?: string) => void;
  handleGetStarted: () => void;
}

// Add new type for workflow filter
type WorkflowFilter = 'all' | 'draft' | 'deployed' | 'templates';

const WorkflowList: React.FC<WorkflowListProps> = ({
  workflows,
  deployedWorkflows,
  workflowTemplates,
  editWorkflow,
  deleteWorkflow,
  deleteWorkflowTemplate,
  testWorkflow,
  onDeploy,
  onDeleteDeployedWorkflow,
  handleGetStarted,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowFilter>('all');
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [showAllDrafts, setShowAllDrafts] = useState(false);
  const [showAllDeployed, setShowAllDeployed] = useState(false);

  // Filter out based on search term
  const filteredDeployedWorkflows = deployedWorkflows.filter((deployedWorkflow) =>
    deployedWorkflow.workflow_name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const filteredWorkflows = workflows.filter((workflow) =>
    workflow.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Add this new filter for workflow templates
  const filteredWorkflowTemplates = workflowTemplates.filter((template) =>
    template.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Create a map where key is workflow ID and value is list of deployed workflow IDs.
  // TODO: pass deployed workflow IDs in each workflow message as part of listWorkflows/getWorkflow
  const deployedWorkflowMap = filteredDeployedWorkflows.reduce<Record<string, DeployedWorkflow[]>>(
    (acc, dw) => {
      if (!acc[dw.workflow_id]) {
        acc[dw.workflow_id] = [];
      }
      acc[dw.workflow_id].push(dw);
      return acc;
    },
    {},
  );

  // Modify to exclude workflows that are deployed from draft section
  const deployedWorkflowIds = new Set(Object.keys(deployedWorkflowMap));
  const draftWorkflows = filteredWorkflows.filter((w) => !deployedWorkflowIds.has(w.workflow_id));

  const displayedTemplates = showAllTemplates
    ? filteredWorkflowTemplates
    : filteredWorkflowTemplates.slice(0, 5);

  const displayedDrafts = showAllDrafts ? draftWorkflows : draftWorkflows.slice(0, 5);

  const displayedDeployed = showAllDeployed
    ? Object.keys(deployedWorkflowMap)
    : Object.keys(deployedWorkflowMap).slice(0, 5);

  const EmptyWorkflowState = () => (
    <div className="flex flex-col items-center justify-center p-10 bg-white rounded-lg mt-5 mb-10">
      <Text>No workflows here yet</Text>
      <Text className="text-gray-600 mb-5">
        Explore our different workflow templates or create one yourself.
      </Text>
      <Button type="primary" onClick={handleGetStarted}>
        Create Workflow
      </Button>
    </div>
  );

  return (
    <Layout className="flex flex-col h-full relative m-0">
      {/* Search and Filter Bar */}
      <div className="flex gap-3 sticky top-0 z-10 border-b border-gray-200">
        <div className="w-1/4">
          <SearchBar
            onSearch={(value) => setSearchTerm(value)}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select
          className="w-1/4"
          defaultValue="all"
          onChange={(value: WorkflowFilter) => {
            setWorkflowFilter(value);
            // Reset view all states when changing filter
            setShowAllTemplates(false);
            setShowAllDrafts(false);
            setShowAllDeployed(false);
          }}
          options={[
            { value: 'all', label: i18n.t('label.allWorkflows') },
            {
              value: 'draft',
              label: i18n.t('label.draftWorkflows'),
              disabled: draftWorkflows.length === 0,
            },
            {
              value: 'deployed',
              label: i18n.t('label.deployedWorkflows'),
              disabled: Object.keys(deployedWorkflowMap).length === 0,
            },
            { value: 'templates', label: i18n.t('label.workflowTemplates') },
          ]}
        />
      </div>

      {/* Scrollable content area */}
      <div className="overflow-y-auto h-[calc(100%-0px)]">
        {/* Show empty state when no workflows exist */}
        {!Object.keys(deployedWorkflowMap).length &&
          !draftWorkflows.length &&
          (workflowFilter === 'all' ||
            workflowFilter === 'draft' ||
            workflowFilter === 'deployed') && <EmptyWorkflowState />}

        {/* Deployed Workflows */}
        {(workflowFilter === 'all' || workflowFilter === 'deployed') &&
          Object.keys(deployedWorkflowMap).length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-2.5">
                <Text className="text-lg font-semibold">{i18n.t('label.deployedWorkflows')}</Text>
                <div className="flex gap-2 p-0.5 h-8 items-center">
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setShowAllDeployed(!showAllDeployed)}
                    className="bg-white border border-gray-300"
                  >
                    {showAllDeployed ? (
                      <>
                        <LeftOutlined /> {i18n.t('label.viewLess')}
                      </>
                    ) : (
                      <>
                        {i18n.t('label.viewAll')} <RightOutlined />
                      </>
                    )}
                  </Button>
                </div>
              </div>
              <List
                grid={{
                  gutter: 10,
                  xs: 1,
                  sm: 2,
                  md: 3,
                  lg: 4,
                  xl: 5,
                  xxl: 5,
                }}
                className="w-full p-0"
                dataSource={displayedDeployed}
                renderItem={(workflowId) => {
                  const workflow = workflows.find((w) => w.workflow_id === workflowId);
                  const deployments = deployedWorkflowMap[workflowId] || [];

                  return workflow ? (
                    <List.Item className="w-full">
                      <WorkflowListItem
                        key={workflowId}
                        workflow={workflow}
                        deployments={deployments}
                        editWorkflow={editWorkflow}
                        deleteWorkflow={deleteWorkflow}
                        testWorkflow={testWorkflow}
                        onDeploy={onDeploy}
                        onDeleteDeployedWorkflow={onDeleteDeployedWorkflow}
                        sectionType="Deployed"
                      />
                    </List.Item>
                  ) : null;
                }}
              />
            </div>
          )}

        {/* Draft Workflows */}
        {(workflowFilter === 'all' || workflowFilter === 'draft') && draftWorkflows.length > 0 && (
          <div>
            <div className="flex justify-between items-center mt-px mb-px">
              <Text className="text-lg font-semibold">{i18n.t('label.draftWorkflows')}</Text>
              <div className="flex gap-2 p-0.5 h-8 items-center">
                <Button
                  type="link"
                  size="small"
                  onClick={() => setShowAllDrafts(!showAllDrafts)}
                  className="bg-white border border-gray-300"
                >
                  {showAllDrafts ? (
                    <>
                      <LeftOutlined /> {i18n.t('label.viewLess')}
                    </>
                  ) : (
                    <>
                      {i18n.t('label.viewAll')} <RightOutlined />
                    </>
                  )}
                </Button>
              </div>
            </div>
            <List
              grid={{
                gutter: 10,
                xs: 1,
                sm: 2,
                md: 3,
                lg: 4,
                xl: 5,
                xxl: 5,
              }}
              className="w-full"
              dataSource={displayedDrafts}
              renderItem={(workflow) => (
                <List.Item className="w-full mt-2.5">
                  <WorkflowListItem
                    key={workflow.workflow_id}
                    workflow={workflow}
                    deployments={deployedWorkflowMap[workflow.workflow_id] || []}
                    editWorkflow={editWorkflow}
                    deleteWorkflow={deleteWorkflow}
                    testWorkflow={testWorkflow}
                    onDeploy={onDeploy}
                    onDeleteDeployedWorkflow={onDeleteDeployedWorkflow}
                    sectionType="Draft"
                  />
                </List.Item>
              )}
            />
          </div>
        )}

        {/* Templates */}
        {(workflowFilter === 'all' || workflowFilter === 'templates') &&
          displayedTemplates.length > 0 && (
            <div>
              <div className="flex justify-between items-center mt-px mb-px">
                <div className="flex items-center">
                  <Text className="text-lg font-semibold">{i18n.t('label.workflowTemplates')}</Text>
                  <Button
                    type="text"
                    size="small"
                    onClick={() => setImportModalVisible(true)}
                    className="ml-7 bg-white border border-gray-300"
                  >
                    <PlusCircleOutlined /> {i18n.t('label.importTemplate')}
                  </Button>
                </div>
                <div className="flex gap-3 p-0.5 h-8 items-center">
                  <div className="w-px bg-gray-300" />
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setShowAllTemplates(!showAllTemplates)}
                    className="bg-white border border-gray-300"
                  >
                    {showAllTemplates ? (
                      <>
                        <LeftOutlined /> {i18n.t('label.viewLess')}
                      </>
                    ) : (
                      <>
                        {i18n.t('label.viewAll')} <RightOutlined />
                      </>
                    )}
                  </Button>
                </div>
              </div>
              <List
                grid={{
                  gutter: 10,
                  xs: 1,
                  sm: 2,
                  md: 3,
                  lg: 4,
                  xl: 5,
                  xxl: 5,
                }}
                className="w-full mt-2.5"
                dataSource={displayedTemplates}
                renderItem={(workflowTemplate) => (
                  <List.Item className="w-full m-0">
                    <WorkflowListItem
                      key={workflowTemplate.id}
                      workflowTemplate={workflowTemplate}
                      deleteWorkflowTemplate={deleteWorkflowTemplate}
                      sectionType="Template"
                    />
                  </List.Item>
                )}
              />
            </div>
          )}
      </div>

      {/* Import Workflow Template Modal */}
      <ImportWorkflowTemplateModal
        visible={importModalVisible}
        onClose={() => setImportModalVisible(false)}
      />
    </Layout>
  );
};

export default WorkflowList;
