import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { Artifact } from '../../types';
import { MarkdownArtifactViewer } from './MarkdownArtifactViewer';

const readArtifactTextFileMock = vi.fn();

vi.mock('@/features/artifacts/lib/readArtifactText', () => ({
  readArtifactTextFile: (...args: unknown[]) =>
    readArtifactTextFileMock(...args),
}));

vi.mock('./ArtifactMarkdownContent', () => ({
  ArtifactMarkdownContent: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

const artifact: Artifact = {
  id: 'artifact-1',
  chat_id: 'chat-1',
  message_id: null,
  tool_call_id: null,
  title: 'Notes',
  filename: 'notes.md',
  path: '/tmp/notes.md',
  mime_type: 'text/markdown',
  size_bytes: 12,
  created_at: Date.now(),
};

describe('MarkdownArtifactViewer', () => {
  beforeEach(() => {
    readArtifactTextFileMock.mockReset();
  });

  it('renders markdown content after loading', async () => {
    readArtifactTextFileMock.mockResolvedValue('# Hello artifact');

    render(<MarkdownArtifactViewer artifact={artifact} />);

    await waitFor(() => {
      expect(screen.getByTestId('markdown-content')).toHaveTextContent(
        '# Hello artifact'
      );
    });
  });

  it('shows an error when reading fails', async () => {
    readArtifactTextFileMock.mockRejectedValue(new Error('read failed'));

    render(<MarkdownArtifactViewer artifact={artifact} />);

    await waitFor(() => {
      expect(screen.getByText('viewerLoadError')).toBeInTheDocument();
    });
  });
});
