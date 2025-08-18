import React from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import 'antd/dist/reset.css';
import Layout from 'antd/lib/layout/layout';
import './globals.css';
import StoreProvider from './components/StoreProvider';
import TopNav from './components/TopNav';
import { NotificationProvider } from './components/Notifications';
import MessageBoxes from './components/MessageBoxes';

const RootLayout = ({ children }: React.PropsWithChildren) => {
  return (
    <>
      <html lang="en">
        <body>
          <AntdRegistry>
            <StoreProvider>
              <NotificationProvider>
                <Layout className="flex flex-col h-full">
                  <TopNav />
                  <MessageBoxes />
                  <Layout className="flex flex-col h-full flex-grow">{children}</Layout>
                </Layout>
              </NotificationProvider>
            </StoreProvider>
          </AntdRegistry>
        </body>
      </html>
    </>
  );
};

export default RootLayout;
