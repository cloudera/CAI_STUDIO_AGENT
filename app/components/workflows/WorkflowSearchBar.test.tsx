import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Component from './WorkflowSearchBar';

describe('WorkflowSearchBar', () => {
  it('renders and matches snapshot', () => {
    const onSearch = jest.fn();
    const onChange = jest.fn();
    const { container } = render(<Component onSearch={onSearch} onChange={onChange} />);
    expect(container).toMatchSnapshot();
  });

  it('calls onChange when typing and onSearch when Enter pressed', () => {
    const onSearch = jest.fn();
    const onChange = jest.fn();
    render(<Component onSearch={onSearch} onChange={onChange} />);

    const input = screen.getByPlaceholderText('Search workflows by name');
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(onChange).toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onSearch).toHaveBeenCalled();
    expect(onSearch.mock.calls[0][0]).toBe('abc');
  });
});
