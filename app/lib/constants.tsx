import React from 'react';
import { LocalStorageState } from './types';
import Link from 'next/link';
import { Button } from 'antd';

/**
 * Default generation config parameters for our
 * workflows once they are first created. Currently, we only
 * support a shared generation config across all agents and
 * manager agents that make LLM calls.
 */
export const DEFAULT_GENERATION_CONFIG = {
  max_new_tokens: 4096,
  temperature: 0.1,
};

export const TOOL_PARAMS_ALERT = {
  message: 'Required Tool Parameters Not Configured',
  description:
    'Some of the required tool parameters are not set to enable testing and deployment of workflow. Either set them or change the tool code to make them optional.',
};

/**
 * Initial local storage state for a client browser. Note: we are not
 * setting any information about our workflow configuration yet, which is
 * done once a viewer enters the the workflows/create page for a
 * specific workflow.
 */
export const INITIAL_LOCAL_STORAGE_STAGE: LocalStorageState = {
  viewSettings: {
    displayIntroPage: true,
    showTour: true,
  },
};

export const NO_DEFAULT_LLM_NOTIFICATION: React.ReactNode = (
  <>
    Agent Studio needs a default LLM model to run workflows. Please{' '}
    <Link href="/models?promptNewModelRegistration=true" className="underline">
      register a model
    </Link>{' '}
    to get started.
  </>
);

/**
 * Studio versions eariler than 2.0.47 do not support APIv2 authentication
 * for calling applications by their full domain. Right now, this is how
 * Studio, deployed workflow models, and deployed workflow applications
 * communicate with Phoenix. TODO: support IP targeting for a "degraded"
 * experience when running earlier workbenches
 */
export const COMPATIBILITY_WARNING_2_0_47: React.ReactNode = (
  <>
    Agent Studio is running on a Cloudera AI Workbench earlier than version <b>2.0.47</b>. This may
    cause degraded performance of Agent Studio workflows. Please upgrade your Cloudera AI Workbench
    to at least <b>2.0.47</b>.
  </>
);

/**
 * The ML_ENABLE_COMPOSABLE_AMP entitlement enables setting the model root dir
 * for workbench models. When this is disabled, the entire agent-studio subdirectory
 * (including build files, studio resources, and every workflow and every tool) gets
 * built into the workbench build - this causes bloating, and sometimes models stuck in "pending"
 * and never deploying if Agent Studio hosts enough resources.
 */
export const ENTITLEMENT_WARNING_ML_ENABLE_COMPOSABLE_AMPS: React.ReactNode = (
  <>
    Agent Studio is running without the <b>AI Studios</b> entitlement enabled for your account. This
    may cause degraded performance of deployed workflows. Please work with your administrator to
    enable the <b>AI Studios</b> entitlement.
  </>
);

export const VERSION_WARNING_OUT_OF_DATE = (openModal: () => void) => {
  return (
    <>
      Agent Studio is out of date.{' '}
      <Link href={''} onClick={openModal}>
        Upgrade Agent Studio
      </Link>
    </>
  );
};

export const API_KEY_ROTATION_NEEDED = (onRotateClick: () => void): React.ReactNode => (
  <>
    The CML API keys that Agent Studio uses are not valid.{' '}
    <Button type="link" onClick={onRotateClick} className="p-0">
      Rotate Keys
    </Button>{' '}
    to address this issue.
  </>
);

export const MODEL_IDENTIFIER_OPTIONS: Record<string, { value: string; label: string }[]> = {
  OPENAI: [
    { value: 'gpt-4.1', label: 'gpt-4.1' },
    { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
    { value: 'gpt-4.1-nano', label: 'gpt-4.1-nano' },
    { value: 'gpt-4o', label: 'gpt-4o' },
    { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
    { value: 'gpt-4', label: 'gpt-4' },
    { value: 'o4-mini', label: 'o4-mini' },
    { value: 'o3-mini', label: 'o3-mini' },
    { value: 'o1-mini', label: 'o1-mini' },
  ],
  GEMINI: [
    { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash' },
    { value: 'gemini-2.5-flash-preview-05-20', label: 'gemini-2.5-flash-preview-05-20' },
    { value: 'gemini-2.5-pro-preview-05-06', label: 'gemini-2.5-pro-preview-05-06' },
  ],
  ANTHROPIC: [
    { value: 'claude-opus-4-0', label: 'claude-opus-4-0' },
    { value: 'claude-sonnet-4-0', label: 'claude-sonnet-4-0' },
    { value: 'claude-3-7-sonnet-latest', label: 'claude-3-7-sonnet-latest' },
    { value: 'claude-3-5-sonnet-latest', label: 'claude-3-5-sonnet-latest' },
    { value: 'claude-3-5-haiku-latest', label: 'claude-3-5-haiku-latest' },
  ],
};

export const DEFAULT_MODEL_TEST_MESSAGE = 'Greet me in 5 different languages.';

export const GENERATE_AGENT_BACKGROUND_PROMPT = (description: string) => {
  return `
Given a user's description of an AI agent, generate appropriate role, goal, and backstory for the agent. 
  
## Role: The Agent's Specialized Function
The role defines what the agent does and their area of expertise. When crafting roles:
- Be specific and specialized: Instead of “Writer,” use “Technical Documentation Specialist” or “Creative Storyteller”
- Align with real-world professions: Base roles on recognizable professional archetypes
- Include domain expertise: Specify the agents field of knowledge (e.g., “Financial Analyst”)
Examples of effective roles:
* role: "Senior UX Researcher"
* role: "Full-Stack Software Architect"
* role: "Corporate Communications Director"


## Goal: The Agent's Purpose and Motivation
The goal directs the agent's efforts and shapes their decision-making process. Effective goals should:
- Be clear and outcome-focused: Define what the agent is trying to achieve
- Emphasize quality standards: Include expectations about the quality of work
- Incorporate success criteria: Help the agent understand what “good” looks like
Examples of effective goals:
* goal: "Uncover actionable user insights by analyzing interview data and identifying recurring patterns, unmet needs, and improvement opportunities"
* goal: "Design robust, scalable system architectures that balance performance, maintainability, and cost-effectiveness"
* goal: "Craft clear, empathetic crisis communications that address stakeholder concerns while protecting organizational reputation"


## Backstory: The Agent's Experience and Perspective
The backstory gives depth to the agent, influencing how they approach problems and interact with others. Good backstories:
- Establish expertise and experience: Explain how the agent gained their skills
- Define working style and values: Describe how the agent approaches their work
- Create a cohesive persona: Ensure all elements of the backstory align with the role and goal
Examples of effective backstories:
* backstory: "You have spent 15 years conducting and analyzing user research for top tech companies. You have a talent for reading between the lines and identifying patterns that others miss. You believe that good UX is invisible and that the best insights come from listening to what users don't say as much as what they do say."
* backstory: "With 20+ years of experience building distributed systems at scale, you've developed a pragmatic approach to software architecture. You've seen both successful and failed systems and have learned valuable lessons from each. You balance theoretical best practices with practical constraints and always consider the maintenance and operational aspects of your designs."
* backstory: "As a seasoned communications professional who has guided multiple organizations through high-profile crises, you understand the importance of transparency, speed, and empathy in crisis response. You have a methodical approach to crafting messages that address concerns while maintaining organizational credibility."

  
Please generate the agent properties in the following XML format:<agent><role>Role</role><goal>Goal</goal><backstory>Backstory</backstory></agent>
Always make sure that you generate the proper XML, even if the user's description is not clear or is lacking in details. Never mention that the user's description is too vague; instead, make sure you always generate 
the XML to the best of your ability.

### 

USER DESCRIPTION: ${description.replace(/\n/g, ' ')}
`;
};
