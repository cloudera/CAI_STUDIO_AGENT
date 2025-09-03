import React, { useState } from 'react';
import { Typography, Layout } from 'antd';
import { WarningOutlined, CloseOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface WarningMessageBoxProps {
  messageTrigger: boolean;
  message: React.ReactNode;
  onClose?: () => void;
}

const WarningMessageBox: React.FC<WarningMessageBoxProps> = ({
  messageTrigger,
  message,
  onClose,
}) => {
  const [visible, setVisible] = useState(true);

  if (!messageTrigger || !visible) {
    return null;
  }

  const handleClose = () => {
    setVisible(false);
    if (onClose) {
      onClose();
    }
  };

  return (
    <Layout className="bg-[#fff2f0] border-solid border-[#ffccc7] rounded-md flex flex-row items-center justify-between flex-none px-4 py-2 mt-2 mx-6">
      <div className="flex items-start flex-1">
        <WarningOutlined className="text-[22px] text-[#ff4d4f]" />
        <Text className="ml-3 text-[#434343] font-semibold">{message}</Text>
      </div>
      <CloseOutlined
        onClick={handleClose}
        className="text-[16px] text-[#bfbfbf] cursor-pointer ml-4"
        aria-label="Close warning message"
      />
    </Layout>
  );
};

export default WarningMessageBox;
