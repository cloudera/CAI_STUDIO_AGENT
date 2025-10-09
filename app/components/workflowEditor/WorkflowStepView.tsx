import { useAppSelector } from '../../lib/hooks/hooks';
import { selectEditorCurrentStep } from '../../workflows/editorSlice';
import { Avatar, Divider, Layout } from 'antd';
import { Typography } from 'antd/lib';
import i18n from '../../utils/i18n';
const { Text } = Typography;

interface StepComponentProps {
  stepNumber: number;
  title: string;
  isActive: boolean;
}

const StepComponent = ({ stepNumber, title, isActive }: StepComponentProps) => {
  // Tailwind color classes for dynamic background and text
  const avatarBg = isActive ? 'bg-[#1890ff]' : 'bg-[#d9d9d9]';
  const textColor = isActive ? 'text-[#1890ff]' : 'text-[#434343]';

  return (
    <>
      <Layout className="flex flex-row items-center bg-transparent gap-2 flex-grow-0">
        <Avatar size={32} className={`${avatarBg} text-white`}>
          {stepNumber}
        </Avatar>
        <Text className={`text-lg font-normal ${textColor}`}>{title}</Text>
      </Layout>
    </>
  );
};

const WorkflowStepView = () => {
  const currentStep = useAppSelector(selectEditorCurrentStep);

  return (
    <>
      <Layout className="flex flex-row items-center justify-between bg-transparent flex-grow-0 h-8 gap-3">
        <StepComponent
          stepNumber={1}
          title={i18n.t('workflow.steps.addAgents')}
          isActive={currentStep === 'Agents'}
        />
        <Layout className="flex-grow items-center flex-col">
          <Divider type="horizontal" />
        </Layout>
        <StepComponent
          stepNumber={2}
          title={i18n.t('workflow.steps.addTasks')}
          isActive={currentStep === 'Tasks'}
        />
        <Layout className="flex-grow items-center flex-col">
          <Divider type="horizontal" />
        </Layout>
        <StepComponent
          stepNumber={3}
          title={i18n.t('workflow.steps.configure')}
          isActive={currentStep === 'Configure'}
        />
        <Layout className="flex-grow items-center flex-col">
          <Divider type="horizontal" />
        </Layout>
        <StepComponent
          stepNumber={4}
          title={i18n.t('workflow.steps.test')}
          isActive={currentStep === 'Test'}
        />
        <Layout className="flex-grow items-center flex-col">
          <Divider type="horizontal" />
        </Layout>
        <StepComponent
          stepNumber={5}
          title={i18n.t('workflow.steps.deploy')}
          isActive={currentStep === 'Deploy'}
        />
      </Layout>
    </>
  );
};

export default WorkflowStepView;
