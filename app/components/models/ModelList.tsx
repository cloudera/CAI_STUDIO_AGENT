import React, { useEffect } from 'react';
import { Table, Button, Popconfirm, Switch, Tooltip } from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  ExperimentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { Model } from '@/studio/proto/agent_studio';

import {
  useListModelsQuery,
  useRemoveModelMutation,
  useTestModelMutation,
  useSetDefaultModelMutation,
} from '@/app/models/modelsApi';
import { useGlobalNotification } from '../Notifications';
import {
  setIsRegisterDrawerOpen,
  setIsTestDrawerOpen,
  setModelRegisterId,
  setModelTestId,
  selectModelsStatus,
  updateModelStatus,
} from '@/app/models/modelsSlice';
import { useAppDispatch, useAppSelector } from '@/app/lib/hooks/hooks';
import { asyncTestModelWithRetry } from '@/app/models/utils';

interface ModelListProps {}

const ModelList: React.FC<ModelListProps> = ({}) => {
  const { data: models } = useListModelsQuery({});
  const [removeModel] = useRemoveModelMutation();
  const [setDefaultModel] = useSetDefaultModelMutation();
  const [testModel] = useTestModelMutation();
  const modelTestStatus = useAppSelector(selectModelsStatus);

  // Add notification API
  const notificationsApi = useGlobalNotification();

  const dispatch = useAppDispatch();

  const onSetDefault = async (modelId: string) => {
    try {
      await setDefaultModel({ model_id: modelId });
      notificationsApi.success({
        message: 'Default Model Updated',
        description: 'Default model updated successfully!',
        placement: 'topRight',
      });
    } catch (error: any) {
      const errorMessage = error.data?.error || error.message || 'Failed to set default model.';
      notificationsApi.error({
        message: 'Error Setting Default Model',
        description: errorMessage,
        placement: 'topRight',
      });
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    try {
      await removeModel({ model_id: modelId }).unwrap();
      notificationsApi.success({
        message: 'Model Deleted',
        description: 'Model deleted successfully!',
        placement: 'topRight',
      });
    } catch (error: any) {
      const errorMessage = error.data?.error || error.message || 'Failed to delete model.';
      notificationsApi.error({
        message: 'Error Deleting Model',
        description: errorMessage,
        placement: 'topRight',
      });
    }
  };

  // Upon model list changing, revalidate all models
  useEffect(() => {
    if (models) {
      models.forEach((model) => {
        if (!(model.model_id in modelTestStatus)) {
          asyncTestModelWithRetry(model.model_id, dispatch, testModel, updateModelStatus);
        }
      });
    }
  }, [models]);

  const columns = [
    {
      title: 'Model Alias',
      dataIndex: 'model_name',
      key: 'model_name',
      render: (_: string, record: Model) => {
        const status = modelTestStatus[record.model_id];
        return (
          <div className="flex items-center gap-2">
            {status === 'pending' && (
              <Tooltip title="Validating model...">
                <ClockCircleOutlined className="text-yellow-500" />
              </Tooltip>
            )}
            {status === 'failure' && (
              <Tooltip title="Model connectivity could not be validated.">
                <CloseCircleOutlined className="text-red-500" />
              </Tooltip>
            )}
            {status === 'success' && (
              <Tooltip title="Model connectivity validated.">
                <CheckCircleOutlined className="text-green-500" />
              </Tooltip>
            )}
            {!status && <QuestionCircleOutlined className="text-gray-400" />}
            {record.model_name}
          </div>
        );
      },
    },
    {
      title: 'Model Identifier',
      dataIndex: 'provider_model',
      key: 'provider_model',
    },
    {
      title: 'Model Provider',
      dataIndex: 'model_type',
      key: 'model_type',
      render: (modelType: string) => {
        const typeMap: Record<string, string> = {
          OPENAI: 'OpenAI',
          AZURE_OPENAI: 'Azure OpenAI',
          OPENAI_COMPATIBLE: 'OpenAI Compatible',
          GEMINI: 'Google Gemini',
          ANTHROPIC: 'Anthropic',
          CAII: 'Cloudera AI Inference',
          BEDROCK: 'AWS Bedrock',
        };
        const iconMap: Record<string, string> = {
          OPENAI: '/llm_providers/openai.svg',
          AZURE_OPENAI: '/llm_providers/azure-openai.svg',
          OPENAI_COMPATIBLE: '/llm_providers/generic-llm.svg',
          GEMINI: '/llm_providers/gemini.svg',
          ANTHROPIC: '/llm_providers/anthropic.svg',
          CAII: '/llm_providers/caii.svg',
          BEDROCK: '/llm_providers/bedrock.svg',
        };
        return (
          <div className="flex items-center gap-2">
            <img src={iconMap[modelType]} alt={typeMap[modelType]} className="w-4 h-4" />
            {typeMap[modelType] || modelType}
          </div>
        );
      },
    },
    {
      title: 'Default',
      dataIndex: 'is_studio_default',
      key: 'is_studio_default',
      render: (_: boolean, record: Model) => (
        <Switch
          checked={record.is_studio_default}
          onChange={() => {
            // Only allow switching from false to true
            if (!record.is_studio_default) {
              onSetDefault(record.model_id);
            }
          }}
          disabled={record.is_studio_default} // Disable if already default
          className={record.is_studio_default ? 'bg-[#52c41a]' : ''}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Model) => (
        <div className="flex gap-2">
          <Tooltip title="Edit Model">
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => {
                dispatch(setIsRegisterDrawerOpen(true));
                dispatch(setModelRegisterId(record.model_id));
              }}
            ></Button>
          </Tooltip>
          <Tooltip title="Test Model">
            <Button
              type="link"
              icon={<ExperimentOutlined />}
              onClick={() => {
                dispatch(setIsTestDrawerOpen(true));
                dispatch(setModelTestId(record.model_id));
              }}
            ></Button>
          </Tooltip>
          <Tooltip title="Delete Model">
            <Popconfirm
              title={`Delete ${record.model_name}?`}
              description={`Are you sure you want to delete the model "${record.model_name}"?`}
              placement="topRight"
              okText="Confirm"
              cancelText="Cancel"
              onConfirm={() => handleDeleteModel(record.model_id)}
            >
              <Button type="link" icon={<DeleteOutlined />} danger></Button>
            </Popconfirm>
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <Table columns={columns} dataSource={models} rowKey="model_id" pagination={{ pageSize: 5 }} />
  );
};

export default ModelList;
