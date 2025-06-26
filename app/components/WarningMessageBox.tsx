import React, { useState } from 'react';
import { Typography, Layout } from 'antd';
import { WarningOutlined, CloseOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface WarningMessageBoxProps {
  messageTrigger: boolean;
  message: React.ReactNode;
  onClose?: () => void;
}

const WarningMessageBox: React.FC<WarningMessageBoxProps> = ({ messageTrigger, message, onClose }) => {
  const [visible, setVisible] = useState(true);

  if (!messageTrigger || !visible) {
    return null;
  }

  const handleClose = () => {
    setVisible(false);
    if (onClose) onClose();
  };

  return (
    <Layout
      style={{
        background: '#fff2f0',
        border: '1px solid #ffccc7',
        borderRadius: '6px',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexGrow: 0,
        padding: '10px 16px',
        marginTop: 8,
        marginLeft: 24,
        marginRight: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', flex: 1 }}>
        <WarningOutlined
          style={{
            fontSize: '22px',
            color: '#ff4d4f',
          }}
        />
        <Text
          style={{
            marginLeft: '12px',
            color: '#434343',
          }}
        >
          {message}
        </Text>
      </div>
      <CloseOutlined
        onClick={handleClose}
        style={{
          fontSize: '16px',
          color: '#bfbfbf',
          cursor: 'pointer',
          marginLeft: 16,
        }}
        aria-label="Close warning message"
      />
    </Layout>
  );
};

export default WarningMessageBox;
