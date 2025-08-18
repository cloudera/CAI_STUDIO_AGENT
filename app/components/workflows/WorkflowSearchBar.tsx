import React from 'react';
import { Input, Space } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

const { Search } = Input;

interface SearchBarProps {
  onSearch: (value: string) => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, onChange }) => (
  <Space direction="vertical" className="w-full mb-4">
    <Search
      placeholder="Search workflows by name"
      allowClear
      enterButton={<SearchOutlined />}
      onSearch={onSearch}
      onChange={onChange}
    />
  </Space>
);

export default SearchBar;
