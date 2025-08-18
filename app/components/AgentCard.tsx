import React from 'react';
import { Card } from 'antd';
import { AgentMetadata } from '@/studio/proto/agent_studio';

const { Meta } = Card;

type AgentCardProps = {
  agent: AgentMetadata;
};

const AgentCard: React.FC<AgentCardProps> = ({ agent }) => {
  return (
    <Card title={agent.name} className="w-72" bordered={true}>
      <Meta
        description={
          <>
            <p>
              <strong>ID:</strong> {agent.id}
            </p>
            <p>
              <strong>LLM Model:</strong> {agent.llm_provider_model_id}
            </p>
            <p>
              <strong>Tools:</strong>{' '}
              {agent.tools_id.length > 0 ? agent.tools_id.join(', ') : 'None'}
            </p>
            {agent.crew_ai_agent_metadata && (
              <>
                <p>
                  <strong>Role:</strong> {agent.crew_ai_agent_metadata.role}
                </p>
                <p>
                  <strong>Backstory:</strong> {agent.crew_ai_agent_metadata.backstory}
                </p>
                <p>
                  <strong>Goal:</strong> {agent.crew_ai_agent_metadata.goal}
                </p>
                <p>
                  <strong>Settings:</strong>{' '}
                  {`Delegation: ${agent.crew_ai_agent_metadata.allow_delegation}, Verbose: ${agent.crew_ai_agent_metadata.verbose}, Cache: ${agent.crew_ai_agent_metadata.cache}`}
                </p>
                <p>
                  <strong>Temperature:</strong> {agent.crew_ai_agent_metadata.temperature}
                </p>
                <p>
                  <strong>Max Iterations:</strong> {agent.crew_ai_agent_metadata.max_iter}
                </p>
              </>
            )}
            <p>
              <strong>Valid:</strong> {agent.is_valid ? 'Yes' : 'No'}
            </p>
          </>
        }
      />
    </Card>
  );
};

export default AgentCard;
