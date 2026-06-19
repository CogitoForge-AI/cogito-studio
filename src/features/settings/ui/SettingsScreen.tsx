import { Suspense, lazy } from 'react';
import {
  Network,
  Server,
  Wand2,
  Github,
  Globe,
  BookOpen,
  Shield,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { logger } from '@/lib/logger';
import { useAppSelector } from '@/app/hooks';
import { Separator } from '@/ui/atoms/separator';
import { ScrollArea } from '@/ui/atoms/scroll-area';

const LLMConnections = lazy(() =>
  import('@/features/llm').then((module) => ({
    default: module.LLMConnections,
  }))
);
const MCPServerConnections = lazy(() =>
  import('@/features/mcp').then((module) => ({
    default: module.MCPServerConnections,
  }))
);
const UsagePage = lazy(() =>
  import('@/features/usage').then((module) => ({ default: module.UsagePage }))
);
const UpdateSection = lazy(() =>
  import('@/features/updater/ui/UpdateSection').then((module) => ({
    default: module.UpdateSection,
  }))
);
const SkillsManager = lazy(() =>
  import('@/features/skill/ui/SkillsManager').then((module) => ({
    default: module.SkillsManager,
  }))
);

import { AppSettings } from './AppSettings';
import { FeatureCard } from './components/FeatureCard';
import { ResourceButton } from './components/ResourceButton';
import { SettingsSidebar } from './components/SettingsSidebar';
import { GITHUB_URL, WEBSITE_URL, DOCS_URL } from '../lib/constants';

const SectionLoader = () => (
  <div className="flex h-full w-full items-center justify-center p-12">
    <Loader2 className="size-8 animate-spin text-muted-foreground" />
  </div>
);

export function SettingsScreen() {
  const { t } = useTranslation(['settings', 'common']);
  const selectedSection = useAppSelector((state) => state.ui.settingsSection);

  const renderContent = () => {
    switch (selectedSection) {
      case 'general':
        return <AppSettings />;
      case 'llm':
        return <LLMConnections />;
      case 'mcp':
        return <MCPServerConnections />;
      case 'usage':
        return <UsagePage />;
      case 'skills':
        return <SkillsManager />;
      case 'about':
        return <AboutContent />;
      default:
        return <AppSettings />;
    }
  };

  const sections = [
    { id: 'general', label: t('generalSetting') },
    { id: 'llm', label: t('llmConnections') },
    { id: 'mcp', label: t('mcpServerConnections') },
    { id: 'skills', label: t('skills') },
    { id: 'usage', label: 'Usage' },
    { id: 'about', label: t('about') },
  ];

  function AboutContent() {
    const { t: tCommon } = useTranslation('common');
    const { t: tSettings } = useTranslation('settings');

    const openExternalLink = async (url: string) => {
      try {
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        await openUrl(url);
      } catch (error) {
        logger.error('Failed to open external link in Settings:', {
          url,
          error,
        });
      }
    };

    return (
      <div className="max-w-3xl mx-auto pb-10 space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col items-center text-center space-y-4 pt-4">
          <div className="relative group">
            <div className="absolute -inset-1 bg-linear-to-r from-primary/20 to-secondary/20 rounded-3xl blur opacity-40 group-hover:opacity-75 transition duration-500" />
            <div className="relative flex items-center justify-center size-24 rounded-2xl bg-background shadow-xl ring-1 ring-border/50">
              <img
                src="/icon.svg"
                alt="Nexo Logo"
                className="size-14 drop-shadow-sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-foreground to-foreground/70">
              {tCommon('aboutTitle', { defaultValue: 'Nexo Agent' })}
            </h3>
            <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
              {tSettings('aboutDescription') || tCommon('appDescription')}
            </p>
          </div>
        </div>

        <div className="max-w-xl mx-auto w-full">
          <Suspense fallback={<SectionLoader />}>
            <UpdateSection />
          </Suspense>
        </div>

        <Separator className="opacity-50" />

        <div className="space-y-4">
          <h4 className="font-semibold text-sm text-foreground/80 uppercase tracking-wider px-1">
            {tCommon('keyFeatures', { defaultValue: 'Core Capabilities' })}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FeatureCard
              icon={<Network className="size-5" />}
              title="Multi-LLM Support"
              description="Connect seamlessly to OpenAI, Anthropic, Gemini, and Local LLMs."
            />
            <FeatureCard
              icon={<Server className="size-5" />}
              title="MCP Integration"
              description="Full support for Model Context Protocol servers and tools."
            />
            <FeatureCard
              icon={<Wand2 className="size-5" />}
              title="Agent Skills"
              description="Install and use Agent Skills from your filesystem or GitHub."
            />
            <FeatureCard
              icon={<Shield className="size-5" />}
              title="Privacy First"
              description="Your data stays locally on your device. No cloud collection."
            />
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="font-semibold text-sm text-foreground/80 uppercase tracking-wider px-1">
            {tCommon('resources', { defaultValue: 'Resources' })}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ResourceButton
              icon={<Github className="size-4" />}
              label="GitHub"
              onClick={() => openExternalLink(GITHUB_URL)}
            />
            <ResourceButton
              icon={<Globe className="size-4" />}
              label="Website"
              onClick={() => openExternalLink(WEBSITE_URL)}
            />
            <ResourceButton
              icon={<BookOpen className="size-4" />}
              label="Documentation"
              onClick={() => openExternalLink(DOCS_URL)}
            />
          </div>
        </div>

        <div className="pt-8 text-center space-y-1">
          <p className="text-xs text-muted-foreground">
            Built with Tauri, React & Rust
          </p>
          <p className="text-[10px] text-muted-foreground/60">
            © {new Date().getFullYear()} Nexo Agent. Open Source Software.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background text-foreground">
      <SettingsSidebar />
      <div className="flex-1 flex flex-col">
        <ScrollArea className="flex-1">
          <div className="p-6 max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto w-full space-y-6">
            <div className="mb-6">
              {selectedSection !== 'about' && (
                <h1 className="text-2xl font-bold">
                  {sections.find((s) => s.id === selectedSection)?.label}
                </h1>
              )}
            </div>
            <Suspense fallback={<SectionLoader />}>{renderContent()}</Suspense>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
