'use client';

import React from 'react';
import { Drawer, Typography, Card, Button, Divider } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

interface WorkflowAppApiDrawerProps {
  open: boolean;
  onClose: () => void;
  workflowName: string;
  workflowTasks: any[];
}

const WorkflowAppApiDrawer: React.FC<WorkflowAppApiDrawerProps> = ({
  open,
  onClose,
  workflowName,
  workflowTasks,
}) => {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const taskSet = new Array<string>();
  workflowTasks.forEach((task) => {
    task.inputs.forEach((input: string) => {
      taskSet.push(input);
    });
  });

  const inputsObject = Object.fromEntries(taskSet.map((input) => [input, '']));
  const inputsJson = JSON.stringify(inputsObject, null, 4).replace(/^/gm, '      ');

  const kickoffCommand = `curl -X POST "${baseUrl}/api/workflow/kickoff" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $CDSW_APIV2_KEY" \\
  -d '{
    "inputs": {
${inputsJson}
  }'`;

  const eventsCommand = `curl -X GET "${baseUrl}/api/workflow/events?trace_id=<trace_id>" \\
  -H "Accept: application/json" \\
  -H "Authorization: Bearer $CDSW_APIV2_KEY"`;

  return (
    <Drawer
      title={
        <div className="flex items-center gap-2">
          <span>API Documentation</span>
          <Text type="secondary" className="text-sm">
            {workflowName}
          </Text>
        </div>
      }
      open={open}
      onClose={onClose}
      width={600}
      placement="right"
    >
      <div className="space-y-6">
        {/* Base URL Section */}
        <div>
          <Title level={4} className="mb-3">
            Endpoint
          </Title>
          <Paragraph type="secondary" className="mb-3">
            This is the base endpoint of the workflow deployment.
          </Paragraph>
          <Card className="bg-gray-50">
            <div className="flex items-center justify-between">
              <pre className="flex-1 whitespace-pre-wrap text-xs font-mono text-gray-800 overflow-x-auto mb-0">
                {baseUrl}
              </pre>
              <Button
                icon={<CopyOutlined />}
                size="small"
                onClick={() => copyToClipboard(baseUrl)}
                className="ml-2"
              />
            </div>
          </Card>
        </div>

        <Divider />

        {/* Kickoff Request Section */}
        <div>
          <Title level={4} className="mb-3">
            Start Workflow Execution
          </Title>
          <Paragraph type="secondary" className="mb-3">
            Use this endpoint to start a new workflow execution with input parameters.
          </Paragraph>
          <Card className="bg-gray-50">
            <div className="flex items-start justify-between">
              <pre className="flex-1 whitespace-pre-wrap text-xs font-mono text-gray-800 overflow-x-auto mb-0">
                {kickoffCommand}
              </pre>
              <Button
                icon={<CopyOutlined />}
                size="small"
                onClick={() => copyToClipboard(kickoffCommand)}
                className="ml-2 flex-shrink-0"
              />
            </div>
          </Card>
          <Paragraph type="secondary" className="mb-3 mt-3">
            The response will contain a trace ID which can be used to track the events of the
            workflow.
          </Paragraph>
          <Card className="bg-gray-50">
            <div className="flex items-start justify-between">
              <pre className="flex-1 whitespace-pre-wrap text-xs font-mono text-gray-800 overflow-x-auto mb-0">
                {`{"trace_id": "<trace_id>"}`}
              </pre>
              <Button
                icon={<CopyOutlined />}
                size="small"
                onClick={() => copyToClipboard(kickoffCommand)}
                className="ml-2 flex-shrink-0"
              />
            </div>
          </Card>
        </div>

        <Divider />

        {/* Events Section */}
        <div>
          <Title level={4} className="mb-3">
            Get Workflow Events
          </Title>
          <Paragraph type="secondary" className="mb-3">
            Retrieve real-time events and progress updates for a workflow execution.
          </Paragraph>
          <Card className="bg-gray-50">
            <div className="flex items-start justify-between">
              <pre className="flex-1 whitespace-pre-wrap text-xs font-mono text-gray-800 overflow-x-auto mb-0">
                {eventsCommand}
              </pre>
              <Button
                icon={<CopyOutlined />}
                size="small"
                onClick={() => copyToClipboard(eventsCommand)}
                className="ml-2 flex-shrink-0"
              />
            </div>
          </Card>
        </div>
      </div>
    </Drawer>
  );
};

export default WorkflowAppApiDrawer;
