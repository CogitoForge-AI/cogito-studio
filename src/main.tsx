import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './i18n/config';
import App from './App';
import { attachConsole } from '@tauri-apps/plugin-log';
import { scheduleSentryInit } from '@/lib/sentry';

// Attach console for Tauri logs
if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
  attachConsole().catch(console.error);
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

scheduleSentryInit();
