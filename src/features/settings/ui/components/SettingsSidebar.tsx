import {
  Settings as SettingsIcon,
  Network,
  Server,
  Info,
  BarChart,
  Wand2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/ui/atoms/scroll-area';
import {
  setSettingsSection,
  type SettingsSection,
} from '@/features/ui/state/uiSlice';
import { useAppDispatch, useAppSelector } from '@/app/hooks';

export function SettingsSidebar() {
  const { t } = useTranslation(['settings', 'common']);
  const dispatch = useAppDispatch();
  const selectedSection = useAppSelector((state) => state.ui.settingsSection);

  const sections = [
    {
      id: 'general' as const,
      label: t('generalSetting'),
      icon: <SettingsIcon className="size-4" />,
    },
    {
      id: 'llm' as const,
      label: t('llmConnections'),
      icon: <Network className="size-4" />,
    },
    {
      id: 'mcp' as const,
      label: t('mcpServerConnections'),
      icon: <Server className="size-4" />,
    },
    {
      id: 'skills' as const,
      label: t('skills'),
      icon: <Wand2 className="size-4" />,
    },
    {
      id: 'usage' as const,
      label: 'Usage',
      icon: <BarChart className="size-4" />,
    },
    {
      id: 'about' as const,
      label: t('about'),
      icon: <Info className="size-4" />,
    },
  ];

  return (
    <div className="w-64 lg:w-72 xl:w-80 border-r border-sidebar-border bg-sidebar flex flex-col shrink-0">
      <ScrollArea className="flex-1">
        <div className="p-3">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() =>
                dispatch(setSettingsSection(section.id as SettingsSection))
              }
              data-tour={section.id === 'llm' ? 'settings-llm-tab' : undefined}
              className={cn(
                'relative mb-1 w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-[background-color,color,box-shadow] group',
                'hover:bg-accent hover:text-accent-foreground',
                selectedSection === section.id
                  ? 'bg-accent/80 text-accent-foreground shadow-sm'
                  : 'text-muted-foreground'
              )}
            >
              {selectedSection === section.id && (
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-l-md" />
              )}
              <span
                className={cn(
                  'transition-transform duration-200',
                  selectedSection === section.id && 'scale-110'
                )}
              >
                {section.icon}
              </span>
              <span>{section.label}</span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
