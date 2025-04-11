import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../lib/store';

export interface WorkflowAppChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface WorkflowAppChat {
  messages: WorkflowAppChatMessage[];
  userInput?: string;
}

export interface WorkflowAppStandard {
  inputs: Record<string, string>;
}

// We store workflow information right in the editor. ts-proto compiles
// everything to be non-optional in protobuf messages, but we need
// all optional fields for proper component loading.
export interface WorkflowAppState {
  currentTraceId?: string;
  appStandard: WorkflowAppStandard;
  appChat: WorkflowAppChat;
  isRunning?: boolean;
  crewOutput?: string;
  currentEvents?: any[];
  currentEventIndex?: number;
  currentPhoenixProjectId?: string;
}

const initialState: WorkflowAppState = {
  appStandard: {
    inputs: {},
  },
  appChat: {
    messages: [],
  },
};

export const workflowAppSlice = createSlice({
  name: 'workflowApp',
  initialState,
  reducers: {
    updatedCurrentTraceId: (state, action: PayloadAction<string>) => {
      console.log('Redux: traceId updated', action.payload);
      state.currentTraceId = action.payload;
    },
    updatedChatUserInput: (state, action: PayloadAction<string>) => {
      state.appChat.userInput = action.payload;
    },
    addedChatMessage: (state, action: PayloadAction<WorkflowAppChatMessage>) => {
      // If the /api/ops/events endpoint responds late or does not poll quickly,
      // then polling events can get "blocked up", and when the event eventually responds,
      // all of these polls fire off at once. If the crew already completed, this can lead
      // to multiple polls receiving a Crew.complete event. We need ensure that crew completes
      // are not being duplicated.
      // To get around this, we append the Phoenix node ID to messages that come from
      // crew output events. We can then filter them for uniqueness.
      // We can technically handle this outside of redux, but we run the risk of this still
      // happening because of the nature of our event loop. So for now, let's handle this here.

      if (action.payload.id) {
        const repeatedOutputMessages = state.appChat.messages.filter(
          (message) => message.id === action.payload.id,
        );
        if (repeatedOutputMessages && repeatedOutputMessages.length > 0) {
          return;
        }
      }

      state.appChat.messages = [...state.appChat.messages, action.payload];
    },
    updatedChatMessages: (state, action: PayloadAction<WorkflowAppChatMessage[]>) => {
      state.appChat.messages = action.payload;
    },
    updatedAppInputs: (state, action: PayloadAction<Record<string, string>>) => {
      state.appStandard.inputs = {
        ...state.appStandard.inputs,
        ...action.payload,
      };
    },
    updatedIsRunning: (state, action: PayloadAction<boolean>) => {
      state.isRunning = action.payload;
    },
    updatedCurrentEvents: (state, action: PayloadAction<any[]>) => {
      state.currentEvents = action.payload;
    },
    addedCurrentEvents: (state, action: PayloadAction<any[]>) => {
      state.currentEvents = [...(state.currentEvents || []), ...action.payload];
    },
    clearedCurrentEvents: (state) => {
      state.currentEvents = [];
    },
    updatedCrewOutput: (state, action: PayloadAction<string | undefined>) => {
      state.crewOutput = action.payload;
    },
    updatedCurrentEventIndex: (state, action: PayloadAction<number>) => {
      state.currentEventIndex = action.payload;
    },
    updatedCurrentPhoenixProjectId: (state, action: PayloadAction<string>) => {
      state.currentPhoenixProjectId = action.payload;
    },
    clearedWorkflowApp: (state, action: PayloadAction<void>) => {
      state.appStandard.inputs = {};
      state.appChat.messages = [];
    },
    clearedChatMessages: (state) => {
      state.appChat.messages = [];
    },
  },
});

export const {
  updatedCurrentTraceId,
  updatedChatUserInput,
  updatedAppInputs,
  addedChatMessage,
  updatedChatMessages,
  updatedIsRunning,
  updatedCurrentEvents,
  addedCurrentEvents,
  clearedCurrentEvents,
  updatedCrewOutput,
  updatedCurrentEventIndex,
  updatedCurrentPhoenixProjectId,
  clearedWorkflowApp,
  clearedChatMessages,
} = workflowAppSlice.actions;

export const selectWorkflowAppStandardInputs = (state: RootState) =>
  state.workflowApp.appStandard.inputs;
export const selectWorkflowAppChatMessages = (state: RootState) =>
  state.workflowApp.appChat.messages;
export const selectWorkflowAppChatUserInput = (state: RootState) =>
  state.workflowApp.appChat.userInput;
export const selectWorkflowCurrentTraceId = (state: RootState) => state.workflowApp.currentTraceId;
export const selectWorkflowIsRunning = (state: RootState) => state.workflowApp.isRunning;
export const selectWorkflowCrewOutput = (state: RootState) => state.workflowApp.crewOutput;
export const selectCurrentEvents = (state: RootState) => state.workflowApp.currentEvents;
export const selectCurrentEventIndex = (state: RootState) => state.workflowApp.currentEventIndex;
export const selectCurrentPhoenixProjectId = (state: RootState) =>
  state.workflowApp.currentPhoenixProjectId;

export default workflowAppSlice.reducer;
