import React from 'react';
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

interface ModelListProps {
  models: Model[];
  modelTestStatus: Record<string, 'success' | 'failure' | 'pending'>;
  onEdit: (modelId: string) => void;
  onTest: (modelId: string) => void;
  onDelete: (modelId: string) => void;
  onSetDefault: (modelId: string) => void;
}

const ModelList: React.FC<ModelListProps> = ({
  models,
  modelTestStatus,
  onEdit,
  onTest,
  onDelete,
  onSetDefault,
}) => {
  const columns = [
    {
      title: 'Model Alias',
      dataIndex: 'model_name',
      key: 'model_name',
      render: (_: string, record: Model) => {
        const status = modelTestStatus[record.model_id];
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {status === 'pending' && (
              <Tooltip title="Validating model...">
                <ClockCircleOutlined style={{ color: '#faad14' }} />
              </Tooltip>
            )}
            {status === 'failure' && (
              <Tooltip title="Model connectivity could not be validated.">
                <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
              </Tooltip>
            )}
            {status === 'success' && (
              <Tooltip title="Model connectivity validated.">
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
              </Tooltip>
            )}
            {!status && <QuestionCircleOutlined style={{ color: '#bfbfbf' }} />}
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
        };
        const iconMap: Record<string, string> = {
          OPENAI: '/llm_providers/openai.svg',
          AZURE_OPENAI: '/llm_providers/azure-openai.svg',
          OPENAI_COMPATIBLE: '/llm_providers/generic-llm.svg',
          GEMINI: '/llm_providers/gemini.svg',
          ANTHROPIC: '/llm_providers/anthropic.svg',
          CAII: '/llm_providers/caii.svg',
        };
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img
              src={iconMap[modelType]}
              alt={typeMap[modelType]}
              style={{ width: '16px', height: '16px' }}
            />
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
          style={{
            backgroundColor: record.is_studio_default ? '#52c41a' : undefined,
          }}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Model) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Tooltip title="Edit Model">
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => onEdit(record.model_id)}
            ></Button>
          </Tooltip>
          <Tooltip title="Test Model">
            <Button
              type="link"
              icon={<ExperimentOutlined />}
              onClick={() => onTest(record.model_id)}
            ></Button>
          </Tooltip>
          <Tooltip title="Delete Model">
            <Popconfirm
              title={`Delete ${record.model_name}?`}
              description={`Are you sure you want to delete the model "${record.model_name}"?`}
              placement="topRight"
              okText="Confirm"
              cancelText="Cancel"
              onConfirm={() => onDelete(record.model_id)}
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
