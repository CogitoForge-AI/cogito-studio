import { NotesPanel } from '@/features/notes/ui/NotesPanel';
import { ArtifactsPanel } from '@/features/artifacts/ui/ArtifactsPanel';
import { ArtifactViewerPanel } from '@/features/artifacts/ui/ArtifactViewerPanel';
import { useGetArtifactsQuery } from '@/features/artifacts/state/artifactsApi';
import { useAppSelector } from '@/app/hooks';

export function ChatRightPanel() {
  const activeTab = useAppSelector((state) => state.ui.rightPanelTab);
  const selectedChatId = useAppSelector((state) => state.chats.selectedChatId);

  // Keep artifact cache subscribed while the right panel is mounted so invalidations refetch immediately.
  useGetArtifactsQuery(selectedChatId ?? '', { skip: !selectedChatId });

  const renderContent = () => {
    switch (activeTab) {
      case 'artifacts':
        return <ArtifactsPanel />;
      case 'viewer':
        return <ArtifactViewerPanel />;
      case 'notes':
      default:
        return <NotesPanel />;
    }
  };

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="relative flex-1 overflow-hidden bg-linear-to-b from-sidebar to-sidebar-accent/25">
        {renderContent()}
      </div>
    </div>
  );
}
