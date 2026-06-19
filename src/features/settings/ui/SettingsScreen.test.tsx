import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsScreen } from './SettingsScreen';
import { setSettingsSection } from '@/features/ui/state/uiSlice';

// Mock dependencies
const mockDispatch = vi.fn();
const mockSelector = vi.fn();

vi.mock('@/app/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (fn: (state: any) => any) => mockSelector(fn),
}));

vi.mock('lucide-react', () => ({
  Search: () => <div data-testid="search-icon" />,
  Loader2: () => <div data-testid="loader-icon" />,
  Settings: () => <div data-testid="settings-icon" />,
  Network: () => <div data-testid="network-icon" />,
  Server: () => <div data-testid="server-icon" />,
  FileText: () => <div data-testid="file-icon" />,
  Info: () => <div data-testid="info-icon" />,
  Package: () => <div data-testid="package-icon" />,
  BarChart: () => <div data-testid="chart-icon" />,
  Bot: () => <div data-testid="bot-icon" />,
  Globe: () => <div data-testid="globe-icon" />,
  Github: () => <div data-testid="github-icon" />,
  BookOpen: () => <div data-testid="book-icon" />,
  Wand2: () => <div data-testid="wand-icon" />,
}));

vi.mock('@/features/ui/state/uiSlice', () => ({
  setSettingsSection: vi.fn((id: string) => ({
    type: 'ui/setSettingsSection',
    payload: id,
  })),
  navigateToChat: vi.fn(() => ({ type: 'ui/navigateToChat' })),
}));

// Mock sub-components
vi.mock('@/features/llm', () => ({
  LLMConnections: () => <div>LLM Connections</div>,
}));
vi.mock('@/features/mcp', () => ({
  MCPServerConnections: () => <div>MCP Connections</div>,
}));
vi.mock('./AppSettings', () => ({
  AppSettings: () => <div>App Settings</div>,
}));
vi.mock('@/features/usage', () => ({ UsagePage: () => <div>Usage Page</div> }));
vi.mock('@/features/updater/ui/UpdateSection', () => ({
  UpdateSection: () => <div>Update Section</div>,
}));

vi.mock('@/ui/atoms/separator', () => ({ Separator: () => <hr /> }));
vi.mock('@/ui/atoms/button/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));
vi.mock('@/ui/atoms/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe('SettingsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelector.mockImplementation((selectorFn: (state: any) => any) => {
      // Mock the state object for the selector
      const state = {
        ui: {
          settingsSection: 'general',
          language: 'en',
          theme: 'light',
          loading: false,
          experiments: {
            enableWorkflowEditor: false,
          },
        },
      };
      return selectorFn(state);
    });
  });

  it('renders sidebar with sections', () => {
    render(<SettingsScreen />);

    expect(screen.getAllByText('generalSetting')[0]).toBeInTheDocument();
    expect(screen.getAllByText('llmConnections')[0]).toBeInTheDocument();
    expect(screen.getAllByText('mcpServerConnections')[0]).toBeInTheDocument();
    expect(screen.getAllByText('about')[0]).toBeInTheDocument();
  });

  it('renders the correct content based on selected section', async () => {
    mockSelector.mockImplementation((selectorFn) => {
      const state = {
        ui: {
          settingsSection: 'llm',
          language: 'en',
          theme: 'light',
          loading: false,
          experiments: {
            enableWorkflowEditor: false,
          },
        },
      };
      return selectorFn(state);
    });

    render(<SettingsScreen />);
    expect(await screen.findByText('LLM Connections')).toBeInTheDocument();
  });

  it('dispatches setSettingsSection when a sidebar item is clicked', () => {
    render(<SettingsScreen />);

    const llmTab = screen.getByText('llmConnections').closest('button');
    if (llmTab) fireEvent.click(llmTab);

    expect(mockDispatch).toHaveBeenCalledWith(setSettingsSection('llm'));
  });
});
