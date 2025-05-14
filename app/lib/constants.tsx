import React from 'react';
import { WorkflowGenerationConfig, LocalStorageState } from './types';
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
  temperature: 0.7,
};

export const TOOL_PARAMS_ALERT = {
  message: 'Required Tool Parameters Not Configured',
  description: 'Some of the required tool parameters are not set to enable testing and deployment of workflow. Either set them or change the tool code to make them optional.'
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
    <Link href="/models?promptNewModelRegistration=true" style={{ textDecoration: 'underline' }}>
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
    Agent Studio is running without the <b>AI Studios</b> entitlement enabled for
    your account. This may cause degraded performance of deployed workflows. Please work with your
    administrator to enable the <b>AI Studios</b> entitlement.
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
    <Button type="link" onClick={onRotateClick} style={{ padding: 0 }}>
      Rotate Keys
    </Button>{' '}
    to address this issue.
  </>
);
