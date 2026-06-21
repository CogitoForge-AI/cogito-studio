import { FileText, Info, Code2, Package, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { NotesPanel } from '@/features/notes/ui/NotesPanel';
import { ArtifactsPanel } from '@/features/artifacts/ui/ArtifactsPanel';
import { useGetArtifactsQuery } from '@/features/artifacts/state/artifactsApi';
import { BrowserPanel } from '@/features/browser/ui/BrowserPanel';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/atoms/tooltip';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { setRightPanelTab } from '@/features/ui/state/uiSlice';

export function ChatRightPanel() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['artifacts', 'browser', 'common']);
  const activeTab = useAppSelector((state) => state.ui.rightPanelTab);
  const selectedChatId = useAppSelector((state) => state.chats.selectedChatId);

  // Keep artifact cache subscribed while the right panel is mounted so invalidations refetch immediately.
  useGetArtifactsQuery(selectedChatId ?? '', { skip: !selectedChatId });

  const tabs = [
    { id: 'notes' as const, icon: FileText, label: t('common:notes') },
    { id: 'artifacts' as const, icon: Package, label: t('artifacts:tabLabel') },
    { id: 'browser' as const, icon: Globe, label: t('browser:tabLabel') },
    { id: 'skills' as const, icon: Code2, label: t('common:skills') },
    { id: 'info' as const, icon: Info, label: t('common:chatInfo') },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'notes':
        return <NotesPanel />;
      case 'artifacts':
        return <ArtifactsPanel />;
      case 'browser':
        return <BrowserPanel />;
      default:
        return (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="mb-4 rounded-full bg-primary/10 p-4">
              <Package className="size-8 text-primary" />
            </div>
            <h3 className="mb-2 text-lg font-medium text-foreground">
              {tabs.find((tab) => tab.id === activeTab)?.label}{' '}
              {t('common:comingSoon')}
            </h3>
            <p className="max-w-[200px] text-sm text-muted-foreground">
              {t('common:rightPanelComingSoonDescription', {
                tab: tabs.find((tab) => tab.id === activeTab)?.label,
              })}
            </p>
          </div>
        );
    }
  };

  return (
    <div className="flex h-full flex-col bg-background border-l border-border">
      {/* Topbar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-background/50 backdrop-blur-md px-1 pr-2">
        <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <Tooltip key={tab.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => dispatch(setRightPanelTab(tab.id))}
                  className={cn(
                    'relative flex size-7 items-center justify-center rounded-md transition-colors duration-200',
                    activeTab === tab.id
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
                  )}
                >
                  <tab.icon className="size-4" />
                  {activeTab === tab.id && (
                    <span className="absolute bottom-0 left-1 right-1 h-0.5 rounded-full bg-primary" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {tab.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="relative flex-1 overflow-hidden bg-linear-to-b from-background to-accent/5">
        {renderContent()}
      </div>
    </div>
  );
}
