import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppSettings } from './AppSettings';

// Mock dependencies
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('lucide-react', () => ({
  Languages: () => <div data-testid="languages-icon" />,
  Palette: () => <div data-testid="palette-icon" />,
  Search: () => <div data-testid="search-icon" />,
  FlaskConical: () => <div data-testid="flask-icon" />,
  ChevronRight: () => <div data-testid="chevron-icon" />,
}));

const mockUpdateLanguage = vi.fn();
const mockUpdateTheme = vi.fn();
const mockUpdateEnableWorkflowEditor = vi.fn();

vi.mock('@/hooks/useAppSettings', () => ({
  useAppSettings: () => ({
    language: 'en',
    theme: 'system',
    enableWorkflowEditor: false,
    updateLanguage: mockUpdateLanguage,
    updateTheme: mockUpdateTheme,
    updateEnableWorkflowEditor: mockUpdateEnableWorkflowEditor,
  }),
}));

vi.mock('@/features/web-search', () => ({
  WebSearchSettings: () => <div data-testid="web-search-settings" />,
}));

vi.mock('@/i18n/config', () => ({
  default: {
    changeLanguage: vi.fn(),
  },
}));

interface MockComponentProps {
  children?: React.ReactNode;
}

interface SelectProps extends MockComponentProps {
  value: string;
  onValueChange: (value: string) => void;
}

// Mock UI components that might use Radix UI or complex logic
vi.mock('@/ui/atoms/select', () => ({
  Select: ({ children, value, onValueChange }: SelectProps) => {
    return (
      <select
        data-testid="select-root"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      >
        {children}
      </select>
    );
  },
  SelectTrigger: ({ children }: MockComponentProps) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder: string }) => (
    <option value="">{placeholder}</option>
  ),
  SelectContent: ({ children }: MockComponentProps) => <>{children}</>,
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => <option value={value}>{children}</option>,
}));

vi.mock('@/ui/atoms/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    id,
  }: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    id: string;
  }) => {
    const label = id
      .replace('-switch', '')
      .split('-')
      .map((word, index) =>
        index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join('');

    return (
      <input
        type="checkbox"
        id={id}
        data-testid="switch"
        aria-label={label}
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
      />
    );
  },
}));

vi.mock('@/ui/atoms/collapsible', () => ({
  Collapsible: ({ children }: MockComponentProps) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: MockComponentProps) => (
    <div>{children}</div>
  ),
  CollapsibleContent: ({ children }: MockComponentProps) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/ui/atoms/button/button', () => ({
  Button: ({
    children,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

vi.mock('@/ui/atoms/separator', () => ({
  Separator: () => <hr />,
}));

describe('AppSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders language, theme, web search and experiments sections', () => {
    render(<AppSettings />);

    expect(screen.getByText('language')).toBeInTheDocument();
    expect(screen.getByText('theme')).toBeInTheDocument();
    expect(screen.getByText('webSearch')).toBeInTheDocument();
    expect(screen.getByText('experiments')).toBeInTheDocument();

    expect(screen.getByTestId('languages-icon')).toBeInTheDocument();
    expect(screen.getByTestId('palette-icon')).toBeInTheDocument();
    expect(screen.getByTestId('search-icon')).toBeInTheDocument();
    expect(screen.getByTestId('flask-icon')).toBeInTheDocument();
    expect(screen.getByTestId('web-search-settings')).toBeInTheDocument();
  });

  it('handles language change', async () => {
    render(<AppSettings />);

    const languageSelect = screen.getAllByTestId('select-root')[0];
    fireEvent.change(languageSelect, { target: { value: 'vi' } });

    expect(mockUpdateLanguage).toHaveBeenCalledWith('vi');
  });

  it('handles theme change', async () => {
    render(<AppSettings />);

    const themeSelect = screen.getAllByTestId('select-root')[1];
    fireEvent.change(themeSelect, { target: { value: 'dark' } });

    expect(mockUpdateTheme).toHaveBeenCalledWith('dark');
  });

  it('handles workflow editor toggle', async () => {
    render(<AppSettings />);

    const switchElement = screen.getByLabelText('enableWorkflowEditor');
    fireEvent.click(switchElement);

    expect(mockUpdateEnableWorkflowEditor).toHaveBeenCalled();
  });
});
