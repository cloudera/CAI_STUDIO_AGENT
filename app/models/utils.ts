import { AppDispatch } from '@/app/lib/store';
import { TestModelRequest } from '@/studio/proto/agent_studio';

export const asyncTestModelWithRetry = async (
  modelId: string,
  dispatch: AppDispatch,
  testModel: (request: TestModelRequest) => { unwrap: () => Promise<string> },
  updateModelStatus: (payload: {
    modelId: string;
    status: 'success' | 'failure' | 'pending';
  }) => any,
) => {
  // Initially set the status to pending
  dispatch(updateModelStatus({ modelId, status: 'pending' }));

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const testMessage = 'Hello, this is a test message. Please respond.';
  // try for 15 seconds in total
  const attempts = 5;
  const delayBetweenAttempts = 3000; // 3 seconds

  let passed = false;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await testModel({
        model_id: modelId,
        completion_role: 'user',
        completion_content: testMessage,
        temperature: 0.1,
        max_tokens: 20,
        timeout: 2,
      }).unwrap();

      if (response.startsWith('Model Test Failed')) {
        console.warn(`Attempt ${i + 1}: Model test failed with response: ${response}`);
        await sleep(delayBetweenAttempts);
        continue;
      }

      // if we get here, the test passed
      passed = true;
      break;
    } catch (error) {
      console.error(`Attempt ${i + 1}: Error testing model -`, error);
      await sleep(delayBetweenAttempts);
    }
  }

  dispatch(updateModelStatus({ modelId, status: passed ? 'success' : 'failure' }));
};
