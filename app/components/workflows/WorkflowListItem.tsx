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
import {
  Workflow,
  DeployedWorkflow,
  WorkflowTemplateMetadata,
} from '@/studio/proto/agent_studio';
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
  const { data: agents } = useListAgentsQuery({workflow_id: workflow.workflow_id});
  const { imageData: agentIconsData } = useImageAssetsData(agents ? agents.map((_a) => _a.agent_image_uri) : []);

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
          }}
          title={workflow?.name}
        >
          {workflow?.name}
        </Text>
        <Space
          style={{
            marginTop: 'auto',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          {agents?.map((agent, index) => {
            return (
              <Tooltip key={agent?.id || `agent-${index}`} title={agent?.name || 'Unknown'}>
                <Button
                  style={{
                    backgroundColor: agentIconsData[agent.agent_image_uri || '']
                      ? `${agentIconsColorPalette[index % agentIconsColorPalette.length]}80` // 50% opacity
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
  const { data: agentTemplates } = useListAgentTemplatesQuery({workflow_template_id: workflowTemplate.id});
  const { imageData: agentIconsData } = useImageAssetsData(
    agentTemplates ? agentTemplates.map((_a) => _a.agent_image_uri) : []
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
          }}
          title={workflowTemplate?.name}
        >
          {workflowTemplate?.name}
        </Text>
        <Space
          style={{
            marginTop: 'auto',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          {workflowTemplate?.agent_template_ids?.map((agentId, index) => {
            const agent = agentTemplates?.find((a) => a.id === agentId);
            return (
              <Tooltip key={agent?.id || `agent-${index}`} title={agent?.name || 'Unknown'}>
                <Button
                  style={{
                    backgroundColor: agentIconsData[agent?.agent_image_uri || '']
                      ? `${agentIconsColorPalette[index % agentIconsColorPalette.length]}80` // 50% opacity
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
            height: sectionType === 'Deployed' ? '180px' : '160px',
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
            <WorkflowTemplateDisplayCard
              workflowTemplate={workflowTemplate}
            />
          ) : sectionType === 'Deployed' && workflow && deployments?.[0] ? (
            <WorkflowDisplayCard
              workflow={workflow}
              deployment={deployments?.[0]}
              sectionType={sectionType}
            />
          ) : sectionType === 'Draft' && workflow ? (
            <WorkflowDisplayCard
              workflow={workflow}
              sectionType={sectionType}
            />
          ) : (<>Cannot render workflow information.</>)}
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
                    icon={<AppstoreOutlined style={{ opacity: 0.45 }} />}
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
                    icon={<ApiOutlined style={{ opacity: 0.45 }} />}
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
