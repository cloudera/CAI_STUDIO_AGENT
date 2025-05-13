import { useAppSelector } from '../../lib/hooks/hooks';
import { selectEditorCurrentStep } from '../../workflows/editorSlice';
import { Avatar, Divider, Layout } from 'antd';
import { Typography } from 'antd/lib';
const { Text } = Typography;

interface StepComponentProps {
  stepNumber: number;
  title: string;
  isActive: boolean;
}

const StepComponent: React.FC<StepComponentProps> = ({ stepNumber, title, isActive }) => {
  const color = isActive ? '#1677ff' : 'white';
  const opacity = isActive ? 1.0 : 0.45;
  const numberColor = isActive ? undefined : 'darkgray';
  const textColor = isActive ? undefined : 'darkgray';
  return (
    <>
      <Layout
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          background: 'transparent',
          gap: '8px',
          flexGrow: 0,
        }}
      >
        <Avatar size={32} style={{ backgroundColor: color, opacity: opacity, color: numberColor }}>
          {stepNumber}
        </Avatar>
        <Text style={{ fontSize: '16px', fontWeight: 400, color: textColor }}>{title}</Text>
      </Layout>
    </>
  );
};

const WorkflowStepView: React.FC = () => {
  const currentStep = useAppSelector(selectEditorCurrentStep);

  return (
    <>
      <Layout
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'transparent',
          flexGrow: 0,
          height: '32px',
          gap: '12px',
        }}
      >
        <StepComponent stepNumber={1} title="Add Agents" isActive={currentStep === 'Agents'} />
        <Layout style={{ flexGrow: 1, alignItems: 'center', flexDirection: 'column' }}>
          <Divider type="horizontal" />
        </Layout>
        <StepComponent stepNumber={2} title="Add Tasks" isActive={currentStep === 'Tasks'} />
        <Layout style={{ flexGrow: 1, alignItems: 'center', flexDirection: 'column' }}>
          <Divider type="horizontal" />
        </Layout>
        <StepComponent stepNumber={3} title="Configure" isActive={currentStep === 'Configure'} />
        <Layout style={{ flexGrow: 1, alignItems: 'center', flexDirection: 'column' }}>
          <Divider type="horizontal" />
        </Layout>
        <StepComponent stepNumber={4} title="Test" isActive={currentStep === 'Test'} />
        <Layout style={{ flexGrow: 1, alignItems: 'center', flexDirection: 'column' }}>
          <Divider type="horizontal" />
        </Layout>
        <StepComponent stepNumber={5} title="Deploy" isActive={currentStep === 'Deploy'} />
      </Layout>
    </>
  );
};

export default WorkflowStepView;
