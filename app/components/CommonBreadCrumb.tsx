import React from 'react';
import { Breadcrumb } from 'antd';
import { HomeOutlined } from '@ant-design/icons';
import Link from 'next/link';

interface BreadCrumbItem {
  title: string;
  href?: string;
  icon?: React.ReactNode;
}

interface CommonBreadcrumbProps {
  items: BreadCrumbItem[];
}

const CommonBreadCrumb: React.FC<CommonBreadcrumbProps> = ({ items }) => {
  const breadcrumbItems = [
    {
      title: (
        <Link href="/" className="inline-flex items-center">
          <HomeOutlined />
          <span className="ml-2">Agent Studio</span>
        </Link>
      ),
    },
    ...items.map((item) => ({
      title: item.href ? (
        <Link href={item.href}>
          {item.icon && <span className="mr-[8px]">{item.icon}</span>}
          <span>{item.title}</span>
        </Link>
      ) : (
        <>
          {item.icon && <span className="mr-[8px]">{item.icon}</span>}
          <span>{item.title}</span>
        </>
      ),
    })),
  ];

  return <Breadcrumb className="mb-[10px]" items={breadcrumbItems} />;
};

export default CommonBreadCrumb;
