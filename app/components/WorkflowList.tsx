import path from 'path';
import React, { useState, useEffect, useRef } from 'react';
import { Layout, Typography, List, Button, Modal, Input, message, Alert, Spin } from 'antd';
import {
  Workflow,
  DeployedWorkflow,
  AgentMetadata,
  WorkflowTemplateMetadata,
  AgentTemplateMetadata,
} from '@/studio/proto/agent_studio';
import SearchBar from './WorkflowSearchBar';
import WorkflowListItem from './WorkflowListItem';
import { useListDeployedWorkflowsQuery } from '@/app/workflows/deployedWorkflowsApi';
import { useImageAssetsData } from '../lib/hooks/useAssetData';
import { useImportWorkflowTemplateMutation } from '@/app/workflows/workflowsApi';
import { PlusCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { useGlobalNotification } from './Notifications';

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
  agents: AgentMetadata[];
  workflowTemplates: WorkflowTemplateMetadata[];
  agentTemplates: AgentTemplateMetadata[];
  editWorkflow: (workflowId: string) => void;
  deleteWorkflow: (workflowId: string) => void;
  deleteWorkflowTemplate: (workflowTemplateId: string) => void;
  testWorkflow: (workflowId: string) => void;
  onDeploy: (workflow: Workflow) => void;
  onDeleteDeployedWorkflow: (deployedWorkflow: DeployedWorkflow) => void;
}

const WorkflowList: React.FC<WorkflowListProps> = ({
  workflows,
  deployedWorkflows,
  agents,
  workflowTemplates,
  agentTemplates,
  editWorkflow,
  deleteWorkflow,
  deleteWorkflowTemplate,
  testWorkflow,
  onDeploy,
  onDeleteDeployedWorkflow,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [importModalVisible, setImportModalVisible] = useState(false);

  const { imageData: agentIconsData } = useImageAssetsData(agents.map((_a) => _a.agent_image_uri));
  const { imageData: agentTemplateIconsData } = useImageAssetsData(
    agentTemplates.map((_a) => _a.agent_image_uri),
  );
  const combinedAgentIconsData = { ...agentIconsData, ...agentTemplateIconsData }; // two API calls to reduce load on backend?

  // Update the deployment status handling
  const { data: latestDeployments } = useListDeployedWorkflowsQuery(
    {},
    {
      pollingInterval: 10000,
    },
  );

  // Use latestDeployments if available, otherwise fall back to deployedWorkflows prop
  const currentDeployments = latestDeployments || deployedWorkflows;

  // Create the map from the current deployments
  const deployedWorkflowMap = currentDeployments.reduce<Record<string, DeployedWorkflow[]>>(
    (acc, dw) => {
      if (!acc[dw.workflow_id]) acc[dw.workflow_id] = [];
      acc[dw.workflow_id].push(dw);
      return acc;
    },
    {},
  );

  const filteredWorkflows = workflows.filter((workflow) =>
    workflow.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Add this new filter for workflow templates
  const filteredWorkflowTemplates = workflowTemplates.filter((template) =>
    template.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Modify to exclude workflows that are deployed from draft section
  const deployedWorkflowIds = new Set(Object.keys(deployedWorkflowMap));
  const draftWorkflows = filteredWorkflows.filter(
    (w) => w.is_draft && !deployedWorkflowIds.has(w.workflow_id),
  );

  return (
    <Layout
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
      }}
    >
      {/* Search Bar - Fixed at top */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <SearchBar
          onSearch={(value) => setSearchTerm(value)}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Scrollable content area */}
      <div
        style={{
          overflowY: 'auto',
          height: 'calc(100% - 70px)',
        }}
      >
        {/* Deployed Workflows */}
        {Object.keys(deployedWorkflowMap).length > 0 && (
          <>
            <Text
              style={{
                fontSize: '18px',
                fontWeight: 600,
                marginTop: '5px',
                display: 'block',
                marginBottom: '10px',
              }}
            >
              Deployed Workflows
            </Text>
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
              dataSource={Object.keys(deployedWorkflowMap).filter((workflowId) =>
                filteredWorkflows.some((w) => w.workflow_id === workflowId),
              )}
              renderItem={(workflowId) => {
                const workflow = workflows.find((w) => w.workflow_id === workflowId);
                const deployments = deployedWorkflowMap[workflowId] || [];

                return workflow ? (
                  <List.Item style={{ width: '100%' }}>
                    <WorkflowListItem
                      key={workflowId}
                      workflow={workflow}
                      deployments={deployments}
                      agents={agents}
                      agentIconsData={combinedAgentIconsData}
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
          </>
        )}

        {/* Draft Workflows */}
        {draftWorkflows.length > 0 && (
          <>
            <Text
              style={{ fontSize: '18px', fontWeight: 600, marginTop: '25px', marginBottom: '10px' }}
            >
              Draft Workflows
            </Text>
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
              dataSource={draftWorkflows}
              renderItem={(workflow) => (
                <List.Item style={{ width: '100%', marginTop: '10px' }}>
                  <WorkflowListItem
                    key={workflow.workflow_id}
                    workflow={workflow}
                    deployments={deployedWorkflowMap[workflow.workflow_id] || []}
                    agents={agents}
                    agentIconsData={combinedAgentIconsData}
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
          </>
        )}

        {/* Templates */}
        {filteredWorkflowTemplates.length > 0 && (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '25px',
                marginBottom: '10px',
              }}
            >
              <Text style={{ fontSize: '18px', fontWeight: 600 }}>Workflow Templates</Text>
              <Button
                type="text"
                size="small"
                onClick={() => {
                  setImportModalVisible(true);
                }}
              >
                <PlusCircleOutlined /> Import Template
              </Button>
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
              dataSource={filteredWorkflowTemplates}
              renderItem={(workflowTemplate) => (
                <List.Item style={{ width: '100%', margin: 0 }}>
                  <WorkflowListItem
                    key={workflowTemplate.id}
                    workflowTemplate={workflowTemplate}
                    agentTemplates={agentTemplates}
                    agentIconsData={combinedAgentIconsData}
                    deleteWorkflowTemplate={deleteWorkflowTemplate}
                    sectionType="Template"
                  />
                </List.Item>
              )}
            />
          </>
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
