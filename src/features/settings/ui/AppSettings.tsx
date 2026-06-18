import { useTranslation } from 'react-i18next';
import { Languages, Palette, FlaskConical, ChevronRight } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/atoms/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/ui/atoms/collapsible';
import { Switch } from '@/ui/atoms/switch';
import { Button } from '@/ui/atoms/button/button';
import { Separator } from '@/ui/atoms/separator';
import { useAppSettings } from '@/hooks/useAppSettings';
import i18n from '@/i18n/config';

type Theme =
  | 'light'
  | 'dark'
  | 'system'
  | 'github-light'
  | 'github-dark'
  | 'gruvbox'
  | 'dracula'
  | 'solarized-light'
  | 'solarized-dark'
  | 'one-dark-pro'
  | 'one-light'
  | 'monokai'
  | 'nord'
  | 'ayu-dark';

export function AppSettings() {
  const { t } = useTranslation(['settings', 'common']);
  const {
    language: currentLanguage,
    theme: currentTheme,
    showUsage,
    enableWorkflowEditor,
    enableRawText,
    updateLanguage,
    updateTheme,
    updateShowUsage,
    updateEnableWorkflowEditor,
    updateEnableRawText,
  } = useAppSettings();

  const handleLanguageChange = (lang: 'vi' | 'en') => {
    updateLanguage(lang);
    i18n.changeLanguage(lang);
  };

  const handleThemeChange = (newTheme: Theme) => {
    updateTheme(newTheme);
  };

  return (
    <div className="space-y-6">
      {/* Language */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Languages className="size-4 text-muted-foreground shrink-0" />
          <h3 className="font-medium text-sm leading-none my-0">
            {t('language')}
          </h3>
        </div>
        <Select
          value={currentLanguage}
          onValueChange={(value: 'vi' | 'en') => handleLanguageChange(value)}
        >
          <SelectTrigger id="language-select" className="w-full">
            <SelectValue placeholder={t('selectLanguage')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">{t('english')}</SelectItem>
            <SelectItem value="vi">{t('vietnamese')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Theme */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="size-4 text-muted-foreground shrink-0" />
          <h3 className="font-medium text-sm leading-none my-0">
            {t('theme')}
          </h3>
        </div>
        <Select
          value={currentTheme}
          onValueChange={(value: Theme) => handleThemeChange(value)}
        >
          <SelectTrigger id="theme-select" className="w-full">
            <SelectValue placeholder={t('selectTheme')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">{t('lightTheme')}</SelectItem>
            <SelectItem value="dark">{t('darkTheme')}</SelectItem>
            <SelectItem value="system">{t('systemTheme')}</SelectItem>
            {/* <SelectItem value="github-light">
              {t('githubLightTheme')}
            </SelectItem>
            <SelectItem value="github-dark">{t('githubDarkTheme')}</SelectItem>
            <SelectItem value="gruvbox">{t('gruvboxTheme')}</SelectItem>
            <SelectItem value="dracula">{t('draculaTheme')}</SelectItem>
            <SelectItem value="solarized-light">
              {t('solarizedLightTheme')}
            </SelectItem>
            <SelectItem value="solarized-dark">
              {t('solarizedDarkTheme')}
            </SelectItem>
            <SelectItem value="one-dark-pro">{t('oneDarkProTheme')}</SelectItem>
            <SelectItem value="one-light">{t('oneLightTheme')}</SelectItem>
            <SelectItem value="monokai">{t('monokaiTheme')}</SelectItem>
            <SelectItem value="nord">{t('nordTheme')}</SelectItem>
            <SelectItem value="ayu-dark">{t('ayuDarkTheme')}</SelectItem> */}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Experiments Collapsible */}
      <Collapsible className="space-y-2">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between p-0 hover:bg-transparent group"
          >
            <div className="flex items-center gap-2">
              <FlaskConical className="size-4 text-muted-foreground shrink-0" />
              <h3 className="font-medium text-sm leading-none my-0">
                {t('experiments')}
              </h3>
            </div>
            <ChevronRight className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <div className="flex items-center justify-between gap-4 p-3 border rounded-lg bg-card/50">
            <div className="space-y-1">
              <h4 className="text-sm font-medium leading-none">
                {t('showUsage')}
              </h4>
              <p className="text-xs text-muted-foreground">
                {t('showUsageDescription')}
              </p>
            </div>
            <Switch
              id="show-usage-switch"
              checked={showUsage}
              onCheckedChange={updateShowUsage}
            />
          </div>
          <div className="flex items-center justify-between gap-4 p-3 border rounded-lg bg-card/50">
            <div className="space-y-1">
              <h4 className="text-sm font-medium leading-none">
                {t('enableWorkflowEditor')}
              </h4>
              <p className="text-xs text-muted-foreground">
                {t('enableWorkflowEditorDescription')}
              </p>
            </div>
            <Switch
              id="enable-workflow-editor-switch"
              checked={enableWorkflowEditor}
              onCheckedChange={updateEnableWorkflowEditor}
            />
          </div>
          <div className="flex items-center justify-between gap-4 p-3 border rounded-lg bg-card/50">
            <div className="space-y-1">
              <h4 className="text-sm font-medium leading-none">
                {t('enableRawText')}
              </h4>
              <p className="text-xs text-muted-foreground">
                {t('enableRawTextDescription')}
              </p>
            </div>
            <Switch
              id="enable-raw-text-switch"
              checked={enableRawText}
              onCheckedChange={updateEnableRawText}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
