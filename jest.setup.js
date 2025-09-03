import '@testing-library/jest-dom';

// Mock for react-markdown
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }) => <div data-testid="markdown">{children}</div>
}));

// Mock rehype-raw and remark-gfm
jest.mock('rehype-raw', () => () => ({}));
jest.mock('remark-gfm', () => () => ({}));

// Mock for jsPDF
jest.mock('jspdf', () => ({
  jsPDF: jest.fn().mockImplementation(() => ({
    text: jest.fn(),
    save: jest.fn()
  }))
}));

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useParams: jest.fn(),
  useRouter: jest.fn(() => ({
    push: jest.fn()
  }))
}));

// Add scrollIntoView mock
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: jest.fn()
});

// Suppress console error for testing environment
console.error = (...args) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('Warning: ReactDOM.render is no longer supported')
  ) {
    return;
  }
  console.error(...args);
};