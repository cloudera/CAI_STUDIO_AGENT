import { Spin, Typography } from 'antd';

const { Text } = Typography;

export interface LargeCenterSpinProps {
  message?: string;
}

const LargeCenterSpin = ({ message }: LargeCenterSpinProps) => {
  return (
    <div className="flex justify-center items-center h-full flex-col">
      <Spin size="large" />
      {message && <Text>{message}</Text>}
    </div>
  );
};

export default LargeCenterSpin;
