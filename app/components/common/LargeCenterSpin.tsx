import { Spin, Typography } from 'antd';

const { Text } = Typography;

export interface LargeCenterSpinProps {
  message?: string;
}

const LargeCenterSpin: React.FC<LargeCenterSpinProps> = ({ message }) => {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        flexDirection: 'column',
      }}
    >
      <Spin size="large" />
      {message && <Text>{message}</Text>}
    </div>
  );
};

export default LargeCenterSpin;
