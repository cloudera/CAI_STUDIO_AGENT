'use client';
import React from 'react';
import { Result, Button } from 'antd';
import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f5f5f5] p-6">
      <div className="bg-white shadow-sm rounded-lg w-full max-w-2xl p-6">
        <Result
          status="404"
          title="Page not found"
          subTitle="The page you are looking for doesn’t exist or has been moved."
          extra={
            <div className="flex gap-3 justify-center">
              <Button type="primary" onClick={() => router.push('/')}>
                Go Home
              </Button>
              <Button onClick={() => router.push('/workflows')}>Go to Workflows</Button>
            </div>
          }
        />
      </div>
    </div>
  );
}
