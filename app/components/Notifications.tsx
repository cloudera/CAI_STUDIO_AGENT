'use client';
import { notification, message } from 'antd';
import { ReactNode, createContext, useContext } from 'react';

const NotificationContext = createContext<any>(null);
const MessagesContext = createContext<any>(null);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [api, contextHolder] = notification.useNotification();
  const [messageApi, messageContextHolder] = message.useMessage();

  return (
    <NotificationContext.Provider value={api}>
      <MessagesContext.Provider value={messageApi}>
        {contextHolder}
        {messageContextHolder}
        {children}
      </MessagesContext.Provider>
    </NotificationContext.Provider>
  );
};

export const useGlobalNotification = () => useContext(NotificationContext);
export const useGlobalMessage = () => useContext(MessagesContext);
