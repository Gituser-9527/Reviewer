import type { Metadata } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';
import { AuthProvider } from './auth/auth-provider';
import { AppShell } from './components/app-shell';
import { LegacyLocalizer } from './components/legacy-localizer';
import { LanguageProvider } from './i18n/language-provider';
import { ThemeProvider } from './theme/theme-provider';
import './styles.css';

export const metadata: Metadata = {
  title: '岗位合规审核 Agent',
  description: '招聘岗位合规审核工作台',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <Script id="theme-preload" strategy="beforeInteractive">
          {"(function(){try{var t=localStorage.getItem('job-compliance-theme')||'system';var d=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;document.documentElement.dataset.theme=d;document.documentElement.style.colorScheme=d;}catch(e){}})();"}
        </Script>
      </head>
      <body>
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <AppShell>{children}</AppShell>
            </AuthProvider>
            <LegacyLocalizer />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
