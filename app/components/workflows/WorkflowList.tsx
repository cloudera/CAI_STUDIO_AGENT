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
  const fileCheckTimerRef = useRef<NodeJS.Timeout | null>(null);
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
      message.success('Workflow template imported successfully');
      onClose();
    } catch (error) {
      message.error('Failed to import workflow template: ' + (error as Error).message);
      notificationsApi.error({
        message: 'Error in importing workflow template',
        description: (error as Error).message,
        placement: 'topRight',
      });
    }
  };

  return (
    <Modal
      title={<div style={{ textAlign: 'center' }}>Import Workflow Template</div>}
      open={visible}
      onOk={handleImportWorkflowTemplate}
      okText="Import"
      cancelText="Cancel"
      onCancel={onClose}
      confirmLoading={isImporting}
      width="40%"
    >
      <p style={{ marginBottom: '10px' }}>
        Please enter the absolute path of the workflow template zip file to import:
      </p>
      {importFilePath.length > filePrefix.length && (
        <div
          style={{ height: '30px', marginBottom: '10px', display: 'flex', alignItems: 'center' }}
        >
          {(fileExists === null || isCheckingFile) && <Spin indicator={<LoadingOutlined spin />} />}
          {!isCheckingFile && (
            <Alert
              style={{ width: '100%' }}
              message={
                <Layout
                  style={{ flexDirection: 'column', gap: 4, padding: 0, background: 'transparent' }}
                >
                  <Text style={{ fontSize: 10, fontWeight: 300, background: 'transparent' }}>
                    {fileExists
                      ? `Found: ${path.basename(importFilePath)}`
                      : 'The specified file could not be found. Please ensure that the path is correct.'}
                  </Text>
                </Layout>
              }
              type={fileExists ? 'success' : 'warning'}
              showIcon
            />
          )}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ marginRight: '4px', color: '#850020', fontFamily: 'monospace' }}>
          {filePrefix}
        </span>
        <Input
          value={importFilePath.replace(filePrefix, '')}
          onChange={(e) => setImportFilePath(`${filePrefix}${e.target.value}`)}
          placeholder="workflow_template.zip"
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
  onCreateWorkflow,
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
      if (!acc[dw.workflow_id]) acc[dw.workflow_id] = [];
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        background: 'white',
        borderRadius: '8px',
        margin: '20px 0 0 0',
      }}
    >
      <Text>No workflows here yet</Text>
      <Text style={{ color: '#666', marginBottom: '20px' }}>
        Explore our different workflow templates or create one yourself.
      </Text>
      <Button type="primary" onClick={handleGetStarted}>
        Create Workflow
      </Button>
    </div>
  );

  // Common button style
  const buttonStyle = {
    background: 'white',
    border: '1px solid #d9d9d9', // Ant Design's default grey border color
  };

  return (
    <Layout
      style={{
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
        margin: '0px 0px 0px 0px',
      }}
    >
      {/* Search and Filter Bar */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          position: 'sticky',
          top: 0,
          zIndex: 1,
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <div style={{ width: '25%' }}>
          <SearchBar
            onSearch={(value) => setSearchTerm(value)}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select
          style={{ width: '25%' }}
          defaultValue="all"
          onChange={(value: WorkflowFilter) => {
            setWorkflowFilter(value);
            // Reset view all states when changing filter
            setShowAllTemplates(false);
            setShowAllDrafts(false);
            setShowAllDeployed(false);
          }}
          options={[
            { value: 'all', label: 'All Workflows' },
            {
              value: 'draft',
              label: 'Draft Workflows',
              disabled: draftWorkflows.length === 0,
            },
            {
              value: 'deployed',
              label: 'Deployed Workflows',
              disabled: Object.keys(deployedWorkflowMap).length === 0,
            },
            { value: 'templates', label: 'Workflow Templates' },
          ]}
        />
      </div>

      {/* Scrollable content area */}
      <div style={{ overflowY: 'auto', height: 'calc(100% - 0px)' }}>
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
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px',
                }}
              >
                <Text style={{ fontSize: '18px', fontWeight: 600 }}>Deployed Workflows</Text>
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    padding: '2px 8px',
                    height: '32px',
                    alignItems: 'center',
                  }}
                >
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setShowAllDeployed(!showAllDeployed)}
                    style={buttonStyle}
                  >
                    {showAllDeployed ? (
                      <>
                        <LeftOutlined /> View Less
                      </>
                    ) : (
                      <>
                        View All <RightOutlined />
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
                style={{ width: '100%', padding: 0 }}
                dataSource={displayedDeployed}
                renderItem={(workflowId) => {
                  const workflow = workflows.find((w) => w.workflow_id === workflowId);
                  const deployments = deployedWorkflowMap[workflowId] || [];

                  return workflow ? (
                    <List.Item style={{ width: '100%' }}>
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
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '1px',
                marginBottom: '1px',
              }}
            >
              <Text style={{ fontSize: '18px', fontWeight: 600 }}>Draft Workflows</Text>
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '2px 8px',
                  height: '32px',
                  alignItems: 'center',
                }}
              >
                <Button
                  type="link"
                  size="small"
                  onClick={() => setShowAllDrafts(!showAllDrafts)}
                  style={buttonStyle}
                >
                  {showAllDrafts ? (
                    <>
                      <LeftOutlined /> View Less
                    </>
                  ) : (
                    <>
                      View All <RightOutlined />
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
              style={{ width: '100%' }}
              dataSource={displayedDrafts}
              renderItem={(workflow) => (
                <List.Item style={{ width: '100%', marginTop: '10px' }}>
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
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '1px',
                  marginBottom: '1px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Text style={{ fontSize: '18px', fontWeight: 600 }}>Workflow Templates</Text>
                  <Button
                    type="text"
                    size="small"
                    onClick={() => setImportModalVisible(true)}
                    style={{ marginLeft: 30, background: 'white', border: '1px solid #d9d9d9' }}
                  >
                    <PlusCircleOutlined /> Import Template
                  </Button>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '2px 8px',
                    height: '32px',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ width: '1px', background: '#d9d9d9' }} />
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setShowAllTemplates(!showAllTemplates)}
                    style={buttonStyle}
                  >
                    {showAllTemplates ? (
                      <>
                        <LeftOutlined /> View Less
                      </>
                    ) : (
                      <>
                        View All <RightOutlined />
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
                style={{ width: '100%', marginTop: '10px' }}
                dataSource={displayedTemplates}
                renderItem={(workflowTemplate) => (
                  <List.Item style={{ width: '100%', margin: 0 }}>
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
