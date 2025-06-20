import React, { useState } from 'react';
import { Button, Layout, List, Typography, Divider, Tooltip, Space, message, Tag } from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  ExperimentOutlined,
  PlayCircleOutlined,
  ExportOutlined,
  UserOutlined,
  CopyOutlined,
  AppstoreOutlined,
  ApiOutlined,
  DownloadOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { Workflow, DeployedWorkflow, WorkflowTemplateMetadata } from '@/studio/proto/agent_studio';
import {
  useAddWorkflowMutation,
  useAddWorkflowTemplateMutation,
  useExportWorkflowTemplateMutation,
} from '../../workflows/workflowsApi';
import { useGlobalNotification } from '../Notifications';
import { useAppDispatch } from '../../lib/hooks/hooks';
import { resetEditor } from '../../workflows/editorSlice';
import { clearedWorkflowApp } from '../../workflows/workflowAppSlice';
import { downloadAndSaveFile, downloadFile } from '../../lib/fileDownload';
import { useListAgentsQuery, useListAgentTemplatesQuery } from '@/app/agents/agentApi';
import { useImageAssetsData } from '@/app/lib/hooks/useAssetData';

const { Text } = Typography;

const MAX_VISIBLE_AGENTS = 5;

function formatDate(dateString?: string) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

interface WorkflowDisplayCardProps {
  workflow: Workflow;
  deployment?: DeployedWorkflow;
  sectionType: 'Deployed' | 'Draft' | 'Template';
}

const WorkflowDisplayCard: React.FC<WorkflowDisplayCardProps> = ({
  workflow,
  deployment,
  sectionType,
}) => {
  const { data: agents } = useListAgentsQuery({ workflow_id: workflow.workflow_id });
  const { imageData: agentIconsData } = useImageAssetsData(
    agents ? agents.map((_a) => _a.agent_image_uri) : [],
  );

  const agentIconsColorPalette = ['#a9ccb9', '#cca9a9', '#c4a9cc', '#ccc7a9'];

  return (
    <>
      <Layout
        style={{
          flex: 1,
          background: 'transparent',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
          width: '100%',
        }}
      >
        {sectionType === 'Deployed' && (
          <div
            style={{
              marginBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Tag
              color={getStatusColor(deployment?.application_status || '')}
              style={{
                borderRadius: '12px',
                color:
                  deployment?.application_status?.toLowerCase() === 'unknown' ? 'white' : undefined,
              }}
            >
              {getStatusDisplay(deployment?.application_status || '')}
            </Tag>
          </div>
        )}
        <Text
          style={{
            fontSize: '14px',
            fontWeight: 400,
            width: '100%',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: 3,
          }}
          title={workflow?.name}
        >
          {workflow?.name}
        </Text>
        <div style={{ margin: '3px 0 9px 0', fontSize: '13px', color: '#888', display: 'flex', flexDirection: 'column' }}></div>
        <Space
          style={{
            marginTop: 'auto',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          {(() => {
            const visibleAgents = agents?.slice(0, MAX_VISIBLE_AGENTS) || [];
            const hiddenCount = (agents?.length || 0) - visibleAgents.length;
            return (
              <>
                {visibleAgents.map((agent, index) => (
                  <Tooltip key={agent?.id || `agent-${index}`} title={agent?.name || 'Unknown'}>
                    <Button
                      style={{
                        backgroundColor: agentIconsData[agent.agent_image_uri || '']
                          ? `${agentIconsColorPalette[index % agentIconsColorPalette.length]}80`
                          : `${agentIconsColorPalette[index % agentIconsColorPalette.length]}c0`,
                        color: 'black',
                        fontSize: '10px',
                        height: '24px',
                        width: '28px',
                        padding: '2px',
                        borderRadius: '4px',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {!agentIconsData[agent?.agent_image_uri || ''] ? (
                        <UserOutlined style={{ fontSize: '14px' }} />
                      ) : (
                        <img
                          src={agentIconsData[agent?.agent_image_uri || '']}
                          alt={agent?.name || 'Unknown'}
                          style={{
                            width: '18px',
                            height: '18px',
                            objectFit: 'cover',
                            verticalAlign: 'middle',
                          }}
                        />
                      )}
                    </Button>
                  </Tooltip>
                ))}
                {hiddenCount > 0 && (
                  <Tooltip
                    title={
                      <div>
                        {agents?.slice(MAX_VISIBLE_AGENTS).map((agent, idx) => (
                          <div key={agent?.id || `hidden-agent-${idx}`}>{agent?.name || 'Unknown'}</div>
                        ))}
                      </div>
                    }
                    placement="top"
                  >
                    <Button
                      style={{
                        backgroundColor: '#f5f5f5',
                        color: 'black',
                        fontSize: '10px',
                        height: '24px',
                        width: '28px',
                        padding: '2px',
                        borderRadius: '4px',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      +{hiddenCount}
                    </Button>
                  </Tooltip>
                )}
              </>
            );
          })()}
        </Space>
      </Layout>
    </>
  );
};

interface WorkflowTemplateDisplayCardProps {
  workflowTemplate: WorkflowTemplateMetadata;
}

const WorkflowTemplateDisplayCard: React.FC<WorkflowTemplateDisplayCardProps> = ({
  workflowTemplate,
}) => {
  const { data: agentTemplates } = useListAgentTemplatesQuery({
    workflow_template_id: workflowTemplate.id,
  });
  const { imageData: agentIconsData } = useImageAssetsData(
    agentTemplates ? agentTemplates.map((_a) => _a.agent_image_uri) : [],
  );
  const agentIconsColorPalette = ['#a9ccb9', '#cca9a9', '#c4a9cc', '#ccc7a9'];

  return (
    <>
      <Layout
        style={{
          flex: 1,
          background: 'transparent',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
        }}
      >
        <Text
          style={{
            fontSize: '14px',
            fontWeight: 400,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: 3,
          }}
          title={workflowTemplate?.name}
        >
          {workflowTemplate?.name}
        </Text>
        
        <div style={{ margin: '3px 0 9px 0', fontSize: '13px', color: '#888', display: 'flex', flexDirection: 'column' }}>
          {/*
          <span style={{ marginBottom: 3 }}>
            Created By: 
            <Tooltip title={workflowTemplate?.created_by_username || 'Unknown'}>
              <span style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 120,
                display: 'inline-block',
                verticalAlign: 'bottom',
                marginLeft: 4,
                fontSize: '13px',
              }}>
                {workflowTemplate?.created_by_username || 'Unknown'}
              </span>
            </Tooltip>
          </span>
          <span>
            Last Updated By: 
            <Tooltip title={workflowTemplate?.updated_by_username || 'Unknown'}>
              <span style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 120,
                display: 'inline-block',
                verticalAlign: 'bottom',
                marginLeft: 4,
                fontSize: '13px',
              }}>
                {workflowTemplate?.updated_by_username || 'Unknown'}
              </span>
            </Tooltip>
          </span>
          */}
        </div>
        <Space
          style={{
            marginTop: 'auto',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          {(() => {
            const visibleAgentIds = workflowTemplate?.agent_template_ids?.slice(0, MAX_VISIBLE_AGENTS) || [];
            const hiddenCount = (workflowTemplate?.agent_template_ids?.length || 0) - visibleAgentIds.length;
            return (
              <>
                {visibleAgentIds.map((agentId, index) => {
                  const agent = agentTemplates?.find((a) => a.id === agentId);
                  return (
                    <Tooltip key={agent?.id || `agent-${index}`} title={agent?.name || 'Unknown'}>
                      <Button
                        style={{
                          backgroundColor: agentIconsData[agent?.agent_image_uri || '']
                            ? `${agentIconsColorPalette[index % agentIconsColorPalette.length]}80`
                            : `${agentIconsColorPalette[index % agentIconsColorPalette.length]}c0`,
                          color: 'black',
                          fontSize: '10px',
                          height: '24px',
                          width: '28px',
                          padding: '2px',
                          borderRadius: '4px',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {!agentIconsData[agent?.agent_image_uri || ''] ? (
                          <UserOutlined style={{ fontSize: '14px' }} />
                        ) : (
                          <img
                            src={agentIconsData[agent?.agent_image_uri || '']}
                            alt={agent?.name || 'Unknown'}
                            style={{
                              width: '18px',
                              height: '18px',
                              objectFit: 'cover',
                              verticalAlign: 'middle',
                            }}
                          />
                        )}
                      </Button>
                    </Tooltip>
                  );
                })}
                {hiddenCount > 0 && (
                  <Tooltip
                    title={
                      <div>
                        {workflowTemplate?.agent_template_ids
                          ?.slice(MAX_VISIBLE_AGENTS)
                          .map((agentId, idx) => {
                            const agent = agentTemplates?.find((a) => a.id === agentId);
                            return (
                              <div key={agent?.id || `hidden-agent-template-${idx}`}>{agent?.name || 'Unknown'}</div>
                            );
                          })}
                      </div>
                    }
                    placement="top"
                  >
                    <Button
                      style={{
                        backgroundColor: '#f5f5f5',
                        color: 'black',
                        fontSize: '10px',
                        height: '24px',
                        width: '28px',
                        padding: '2px',
                        borderRadius: '4px',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      +{hiddenCount}
                    </Button>
                  </Tooltip>
                )}
              </>
            );
          })()}
        </Space>
      </Layout>
    </>
  );
};

interface WorkflowListItemProps {
  workflow?: Workflow;
  workflowTemplate?: WorkflowTemplateMetadata;
  deployments?: (DeployedWorkflow & { statusTag?: React.ReactNode })[];
  editWorkflow?: (workflowId: string) => void;
  deleteWorkflow?: (workflowId: string) => void;
  deleteWorkflowTemplate?: (workflowTemplateId: string) => void;
  testWorkflow?: (workflowId: string) => void;
  onDeploy?: (workflow: Workflow) => void;
  onDeleteDeployedWorkflow?: (deployedWorkflow: DeployedWorkflow) => void;
  sectionType: 'Deployed' | 'Draft' | 'Template';
}

export const getStatusColor = (status: string): string => {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('run') || statusLower === 'deployed') {
    return 'success';
  } else if (
    statusLower.includes('start') ||
    statusLower.includes('build') ||
    statusLower.includes('pending') ||
    statusLower.includes('deploying')
  ) {
    return 'processing';
  } else if (statusLower.includes('fail')) {
    return 'error';
  } else if (statusLower.includes('stop')) {
    return 'warning'; // Changed from 'error' to 'warning' for stopped state
  } else {
    return 'error'; // For unknown or other statuses
  }
};

export const getStatusDisplay = (status: string): string => {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('run') || statusLower === 'deployed') {
    return 'Running';
  } else if (
    statusLower.includes('start') ||
    statusLower.includes('build') ||
    statusLower.includes('pending') ||
    statusLower.includes('deploying')
  ) {
    return 'Starting';
  } else if (statusLower.includes('fail')) {
    return 'Failed';
  } else if (statusLower.includes('stop')) {
    return 'Stopped';
  } else {
    return 'Unknown';
  }
};

// Place the inline SVG icon definitions after imports and before any component/function definitions
const ClouderaAIWorkbenchAppIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" style={{ opacity: 0.45, verticalAlign: 'middle', display: 'inline-block' }}>
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2L2 8.252l10-6.24 10 6.24L12 2zM2 8.252l2.1 1.311.9.566.146.088L7.1 11.439l.9.555v.012l2.1 1.298 1.9 1.19 1.9-1.19 2.1-1.298v-.012l.9-.555 1.954-1.222.146-.088.9-.566 2.1-1.31L12 2.01 2 8.252zm4.188 0L12 4.62l5.812 3.632L12 11.883l-5.812-3.63zM12 15.7l-8.044-5.019L2 11.902l10 6.241 10-6.24-1.956-1.222L12 15.7zm7.9-1.263L12 19.38l-7.9-4.943h-.011L2 15.747 12 22l10-6.252-2.089-1.311H19.9z" fill="currentColor"/>
  </svg>
);
const ClouderaAIWorkbenchModelIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" style={{ opacity: 0.45, verticalAlign: 'middle', display: 'inline-block' }}>
    <path fillRule="evenodd" clipRule="evenodd" d="M19.073 8.956a2.215 2.215 0 00-1.337 1.337h-3.073a3.159 3.159 0 00-.956-.956V6.264a2.215 2.215 0 001.337-1.337h2.692a2.218 2.218 0 001.337 1.337v2.692zm-8.78 8.78a2.213 2.213 0 00-1.337 1.337H6.263a2.214 2.214 0 00-1.336-1.337v-2.692a2.211 2.211 0 001.336-1.337h3.074c.243.381.575.713.956.956v3.073zM20.78 6.156A2.193 2.193 0 0022 4.196C22 2.985 21.014 2 19.804 2c-.858 0-1.599.498-1.96 1.22h-2.908A2.193 2.193 0 0012.976 2c-1.21 0-2.196.985-2.196 2.195 0 .86.498 1.6 1.22 1.961V8.83A3.178 3.178 0 008.83 12H6.155a2.194 2.194 0 00-1.96-1.22c-1.21 0-2.196.986-2.196 2.196 0 .858.498 1.6 1.22 1.96v2.908A2.194 2.194 0 002 19.805C2 21.015 2.985 22 4.195 22c.858 0 1.6-.498 1.961-1.22h2.907A2.196 2.196 0 0011.024 22c1.21 0 2.195-.985 2.195-2.195 0-.859-.498-1.6-1.219-1.96V15.17a3.178 3.178 0 003.171-3.17h2.673a2.193 2.193 0 001.96 1.22A2.2 2.2 0 0022 11.023c0-.858-.498-1.599-1.22-1.96V6.155z" fill="currentColor"/>
  </svg>
);

const WorkflowListItem: React.FC<WorkflowListItemProps> = ({
  workflow,
  workflowTemplate,
  deployments,
  editWorkflow,
  deleteWorkflow,
  deleteWorkflowTemplate,
  testWorkflow,
  onDeploy,
  onDeleteDeployedWorkflow,
  sectionType,
}) => {
  const router = useRouter();
  const [addWorkflow] = useAddWorkflowMutation();
  const notificationsApi = useGlobalNotification();
  const [addWorkflowTemplate] = useAddWorkflowTemplateMutation();
  const [exportWorkflowTemplate] = useExportWorkflowTemplateMutation();
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const dispatch = useAppDispatch();

  const handleCardClick = () => {
    if (sectionType === 'Template') {
      router.push(`/workflows/view_template/${workflowTemplate?.id}`);
    } else {
      router.push(`/workflows/view/${workflow?.workflow_id}`);
    }
  };

  const handleCreateWorkflowFromTemplate = async (e: React.MouseEvent) => {
    try {
      e.stopPropagation();
      const workflowId = await addWorkflow({
        workflow_template_id: workflowTemplate!.id,
        name: `Copy of ${workflowTemplate?.name}`,
      }).unwrap();
      dispatch(resetEditor());
      dispatch(clearedWorkflowApp());
      router.push(`/workflows/create?workflowId=${workflowId}`);
      notificationsApi.info({
        message: 'Draft Workflow Created',
        description: `Workflow template "${workflowTemplate?.name}" copied to a new draft workflow.`,
        placement: 'topRight',
      });
    } catch (error) {
      console.error('Error deploying workflow:', error);
    }
  };

  const handleDownloadWorkflowTemplate = async (e: React.MouseEvent) => {
    try {
      e.stopPropagation();
      setDownloadingTemplate(true);
      const tmp_file_path = await exportWorkflowTemplate({
        id: workflowTemplate!.id,
      }).unwrap();
      console.log('tmp_file_path', tmp_file_path);
      await downloadAndSaveFile(tmp_file_path);
      setDownloadingTemplate(false);
    } catch (error) {
      console.error('Error downloading workflow template:', error);
      notificationsApi.error({
        message: 'Error in downloading workflow template',
        description: (error as Error).message,
        placement: 'topRight',
      });
      setDownloadingTemplate(false);
    }
  };

  const matchingDeployedWorkflow = deployments?.find(
    (deployedWorkflow) => deployedWorkflow.workflow_id === workflow?.workflow_id,
  );

  const isDeploymentRunning = (status?: string): boolean => {
    const statusLower = status?.toLowerCase() || '';
    return statusLower.includes('run');
  };

  const handleOpenDeployment = () => {
    if (
      isDeploymentRunning(matchingDeployedWorkflow?.application_status) &&
      matchingDeployedWorkflow?.application_url &&
      matchingDeployedWorkflow.application_url.length > 0
    ) {
      console.log('opening deployment', matchingDeployedWorkflow.application_url);
      window.open(matchingDeployedWorkflow.application_url, '_blank');
    } else {
      const currentStatus = getStatusDisplay(matchingDeployedWorkflow?.application_status || '');
      message.error(`Can't open application while it is ${currentStatus}`);
    }
  };

  const handleOpenAppDeepLink = () => {
    if (matchingDeployedWorkflow?.application_deep_link) {
      window.open(matchingDeployedWorkflow.application_deep_link, '_blank');
    }
  };

  const handleOpenModelDeepLink = () => {
    if (matchingDeployedWorkflow?.model_deep_link) {
      window.open(matchingDeployedWorkflow.model_deep_link, '_blank');
    }
  };

  return (
    <>
      <List.Item style={{ padding: 0 }}>
        <Layout
          style={{
            borderRadius: '4px',
            border: 'solid 1px #f0f0f0',
            backgroundColor: '#fff',
            width: '100%',
            margin: '0 8px 16px 0',
            padding: '0',
            display: 'flex',
            flexDirection: 'column',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            position: 'relative',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.03)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
          }}
          onClick={handleCardClick}
        >
          {sectionType === 'Template' && workflowTemplate ? (
            <WorkflowTemplateDisplayCard workflowTemplate={workflowTemplate} />
          ) : sectionType === 'Deployed' && workflow && deployments?.[0] ? (
            <WorkflowDisplayCard
              workflow={workflow}
              deployment={deployments?.[0]}
              sectionType={sectionType}
            />
          ) : sectionType === 'Draft' && workflow ? (
            <WorkflowDisplayCard workflow={workflow} sectionType={sectionType} />
          ) : (
            <>Cannot render workflow information.</>
          )}
          <Divider style={{ margin: '0' }} />
          <Layout
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexGrow: 0,
              background: 'transparent',
              justifyContent: 'space-around',
              alignItems: 'center',
              padding: '8px',
            }}
          >
            {sectionType === 'Deployed' ? (
              <>
                <Tooltip title="Save as New Template">
                  <Button
                    style={{ border: 'none' }}
                    icon={<CopyOutlined style={{ opacity: 0.45 }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      addWorkflowTemplate({
                        workflow_id: workflow!.workflow_id,
                        agent_template_ids: [],
                        task_template_ids: [],
                      });
                      notificationsApi.success({
                        message: 'Workflow Template Created',
                        description: `Success! Workflow "${workflow?.name}" copied to a workflow template.`,
                        placement: 'topRight',
                      });
                    }}
                  />
                </Tooltip>
                <Divider style={{ flexGrow: 0, margin: '12px 0px' }} type="vertical" />
                <Tooltip title="Delete Workflow">
                  <Button
                    style={{ border: 'none' }}
                    icon={<DeleteOutlined style={{ opacity: 0.45 }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteWorkflow && deleteWorkflow(workflow!.workflow_id);
                    }}
                  />
                </Tooltip>
                <Divider style={{ flexGrow: 0, margin: '12px 0px' }} type="vertical" />
                <Tooltip title="Open Application UI">
                  <Button
                    style={{ border: 'none' }}
                    icon={<ExportOutlined style={{ opacity: 0.45 }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDeployment();
                    }}
                    disabled={!isDeploymentRunning(matchingDeployedWorkflow?.application_status)}
                  />
                </Tooltip>
                <Divider style={{ flexGrow: 0, margin: '12px 0px' }} type="vertical" />
                <Tooltip title="Open Cloudera AI Workbench Application">
                  <Button
                    style={{ border: 'none' }}
                    icon={ClouderaAIWorkbenchAppIcon}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenAppDeepLink();
                    }}
                    disabled={!matchingDeployedWorkflow?.application_deep_link}
                  />
                </Tooltip>
                <Divider style={{ flexGrow: 0, margin: '12px 0px' }} type="vertical" />
                <Tooltip title="Open Cloudera AI Workbench Model">
                  <Button
                    style={{ border: 'none' }}
                    icon={ClouderaAIWorkbenchModelIcon}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenModelDeepLink();
                    }}
                    disabled={!matchingDeployedWorkflow?.model_deep_link}
                  />
                </Tooltip>
              </>
            ) : sectionType === 'Template' ? (
              <>
                <Tooltip title="Create Workflow from Template">
                  <Button
                    style={{ border: 'none' }}
                    icon={<CopyOutlined style={{ opacity: 0.45 }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreateWorkflowFromTemplate(e);
                    }}
                  />
                </Tooltip>
                <Divider style={{ flexGrow: 0, margin: '12px 0px' }} type="vertical" />
                <Tooltip title="Download Workflow Template">
                  <Button
                    style={{ border: 'none' }}
                    icon={
                      !downloadingTemplate ? (
                        <DownloadOutlined style={{ opacity: 0.45 }} />
                      ) : (
                        <LoadingOutlined style={{ opacity: 0.45 }} />
                      )
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadWorkflowTemplate(e);
                    }}
                    disabled={downloadingTemplate}
                  />
                </Tooltip>
                {!workflowTemplate?.pre_packaged && (
                  <>
                    <Divider style={{ flexGrow: 0, margin: '12px 0px' }} type="vertical" />
                    <Tooltip title="Delete Workflow Template">
                      <Button
                        style={{ border: 'none' }}
                        icon={<DeleteOutlined style={{ opacity: 0.45 }} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteWorkflowTemplate?.(workflowTemplate!.id);
                        }}
                      />
                    </Tooltip>
                  </>
                )}
              </>
            ) : (
              <>
                <Tooltip title="Edit Workflow">
                  <Button
                    style={{ border: 'none' }}
                    icon={<EditOutlined style={{ opacity: 0.45 }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      editWorkflow && editWorkflow(workflow!.workflow_id);
                    }}
                  />
                </Tooltip>
                <Divider style={{ flexGrow: 0, margin: '12px 0px' }} type="vertical" />
                <Tooltip title="Delete Workflow">
                  <Button
                    style={{ border: 'none' }}
                    icon={<DeleteOutlined style={{ opacity: 0.45 }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteWorkflow && deleteWorkflow(workflow!.workflow_id);
                    }}
                  />
                </Tooltip>
                <Divider style={{ flexGrow: 0, margin: '12px 0px' }} type="vertical" />
                <Tooltip title="Test Workflow">
                  <Button
                    style={{ border: 'none' }}
                    icon={<ExperimentOutlined style={{ opacity: 0.45 }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      testWorkflow && testWorkflow(workflow!.workflow_id);
                    }}
                  />
                </Tooltip>
                <Divider style={{ flexGrow: 0, margin: '12px 0px' }} type="vertical" />
                <Tooltip title="Deploy Workflow">
                  <Button
                    style={{ border: 'none' }}
                    icon={<PlayCircleOutlined style={{ opacity: 0.45 }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeploy && onDeploy(workflow!);
                    }}
                  />
                </Tooltip>
                <Divider style={{ flexGrow: 0, margin: '12px 0px' }} type="vertical" />
                <Tooltip title="Save as New Template">
                  <Button
                    style={{ border: 'none' }}
                    icon={<CopyOutlined style={{ opacity: 0.45 }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      addWorkflowTemplate({
                        workflow_id: workflow!.workflow_id,
                        agent_template_ids: [],
                        task_template_ids: [],
                      });
                      notificationsApi.success({
                        message: 'Workflow Template Created',
                        description: `Success! Workflow "${workflow?.name}" copied to a workflow template.`,
                        placement: 'topRight',
                      });
                    }}
                  />
                </Tooltip>
              </>
            )}
          </Layout>
        </Layout>
      </List.Item>
    </>
  );
};

export default WorkflowListItem;
