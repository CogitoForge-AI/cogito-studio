import {
  Eye,
  FileText,
  Package,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/atoms/tooltip';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  setRightPanelTab,
  toggleRightPanel,
} from '@/features/ui/state/uiSlice';
import { Button } from '@/ui/atoms/button/button';

export function ChatRightPanelControls() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['artifacts', 'common']);
  const activeTab = useAppSelector((state) => state.ui.rightPanelTab);
  const isRightPanelOpen = useAppSelector((state) => state.ui.isRightPanelOpen);

  const tabs = [
    { id: 'artifacts' as const, icon: Package, label: t('artifacts:tabLabel') },
    { id: 'viewer' as const, icon: Eye, label: t('artifacts:viewerTabLabel') },
    { id: 'notes' as const, icon: FileText, label: t('common:notes') },
  ];

  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center">
        {isRightPanelOpen ? (
          <div className="flex items-center gap-0.5 rounded-md bg-sidebar-accent/35 p-0.5">
            {tabs.map((tab) => (
              <Tooltip key={tab.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => dispatch(setRightPanelTab(tab.id))}
                    className={cn(
                      'relative flex h-7 min-w-7 items-center justify-center rounded-md px-2 transition-colors duration-200',
                      activeTab === tab.id
                        ? 'bg-sidebar-accent text-sidebar-foreground shadow-xs'
                        : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'
                    )}
                  >
                    <tab.icon className="size-3.5" />
                    {activeTab === tab.id ? (
                      <span className="absolute bottom-0 left-1 right-1 h-0.5 rounded-full bg-primary" />
                    ) : null}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {tab.label}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => dispatch(toggleRightPanel())}
          aria-label={
            isRightPanelOpen
              ? t('collapseRightPanel', { ns: 'common' })
              : t('expandRightPanel', { ns: 'common' })
          }
          className="h-7 w-7"
        >
          {isRightPanelOpen ? (
            <PanelRightClose className="size-4" />
          ) : (
            <PanelRightOpen className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
