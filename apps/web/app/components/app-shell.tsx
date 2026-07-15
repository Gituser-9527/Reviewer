'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/auth-provider';
import { roles, routePermissions, type RouteKey } from '../auth/permissions';
import { LanguageSwitcher } from './language-switcher';
import { ThemeSwitcher } from './theme-switcher';
import { OnboardingGuide } from './onboarding-guide';
import { PermissionGate } from './permission-gate';
import { ProtectedRoute } from './protected-route';
import { useLanguage } from '../i18n/language-provider';

interface NavItem {
  key:
    | 'overview'
    | 'jobAudit'
    | 'reviewQueue'
    | 'rules'
    | 'evaluations'
    | 'monitoring'
    | 'appeals'
    | 'qa'
    | 'settings';
  href: string;
  group: 'workbench' | 'quality' | 'ops';
}

const navItems: NavItem[] = [
  { key: 'overview', href: '/overview', group: 'workbench' },
  { key: 'jobAudit', href: '/', group: 'workbench' },
  { key: 'reviewQueue', href: '/reviews', group: 'workbench' },
  { key: 'rules', href: '/rules', group: 'quality' },
  { key: 'evaluations', href: '/evals', group: 'quality' },
  { key: 'appeals', href: '/appeals', group: 'quality' },
  { key: 'qa', href: '/qa', group: 'quality' },
  { key: 'monitoring', href: '/monitoring', group: 'ops' },
  { key: 'settings', href: '/settings', group: 'ops' },
];

const routeKeys = [
  '/',
  '/overview',
  '/reviews',
  '/rules',
  '/evals',
  '/red-team',
  '/releases',
  '/monitoring',
  '/appeals',
  '/qa',
  '/settings',
  '/uat',
  '/incidents',
  '/beta-launch',
  '/beta-trial',
  '/pilot',
  '/help-center',
  '/api-docs',
  '/landing',
] as const;

function isKnownRoute(pathname: string): pathname is (typeof routeKeys)[number] {
  return (routeKeys as readonly string[]).includes(pathname);
}

function isActive(pathname: string, href: string, key: string): boolean {
  if (key === 'jobAudit') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupedItems(group: NavItem['group']) {
  return navItems.filter((item) => item.group === group);
}

function routePermissionsFor(pathname: string) {
  if (isKnownRoute(pathname)) return routePermissions[pathname as RouteKey];
  return [];
}

function RoleBasedSidebar({ pathname }: Readonly<{ pathname: string }>) {
  const auth = useAuth();
  const { messages } = useLanguage();

  return (
    <aside className="app-sidebar">
      <div className="app-brand">
        <span className="app-brand__mark">JC</span>
        <div>
          <strong>{messages.app.productName}</strong>
          <small>{messages.app.productSubtitle}</small>
        </div>
      </div>

      <nav className="app-nav" aria-label="Main navigation">
        {(['workbench', 'quality', 'ops'] as const).map((group) => {
          const visibleItems = groupedItems(group).filter((item) =>
            auth.canAny(routePermissions[item.href as RouteKey] ?? []),
          );
          if (visibleItems.length === 0) return null;
          return (
            <section className="app-nav__group" key={group}>
              <p>{messages.nav.groups[group]}</p>
              {visibleItems.map((item) => (
                <Link
                  aria-current={isActive(pathname, item.href, item.key) ? 'page' : undefined}
                  className={isActive(pathname, item.href, item.key) ? 'app-nav__item app-nav__item--active' : 'app-nav__item'}
                  href={item.href}
                  key={`${item.key}-${item.href}`}
                >
                  <span>{messages.nav[item.key].label}</span>
                  <small>{messages.nav[item.key].description}</small>
                </Link>
              ))}
            </section>
          );
        })}
      </nav>

      <div className="app-sidebar__footer">
        <label className="role-switcher role-switcher--footer">
          <span>{messages.permissions.currentRole}</span>
          <select value={auth.role} onChange={(event) => auth.setRole(event.target.value as typeof roles[number])}>
            {roles.map((role) => (
              <option key={role} value={role}>
                {messages.permissions.roles[role]}
              </option>
            ))}
          </select>
        </label>
        <small>{messages.app.principles}</small>
      </div>
    </aside>
  );
}

interface DemoSnapshot {
  tenant: {
    id: string;
    name: string;
  };
  auditCases: unknown[];
  auditRuns: unknown[];
  reviewTickets: unknown[];
  seededAt?: string;
}

const demoApiRoute = '/api/demo';
const demoSeedRoute = '/api/demo/seed';
const demoResetRoute = '/api/demo/reset';

function DemoModeBanner() {
  const auth = useAuth();
  const { messages, formatDate } = useLanguage();
  const [snapshot, setSnapshot] = useState<DemoSnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = messages.demoMode;

  const load = async () => {
    const response = await fetch(demoApiRoute);
    if (!response.ok) return;
    setSnapshot((await response.json()) as DemoSnapshot);
  };

  useEffect(() => {
    void load();
  }, []);

  const runDemoAction = async (action: 'seed' | 'reset') => {
    setBusy(true);
    setNotice(null);
    try {
      const route = action === 'seed' ? demoSeedRoute : demoResetRoute;
      const response = await auth.fetchWithAuth(route, { method: 'POST' });
      if (!response.ok) throw new Error(t.actionFailed);
      setSnapshot((await response.json()) as DemoSnapshot);
      setNotice(action === 'seed' ? t.seeded : t.reset);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : t.actionFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="demo-mode-banner" role="status">
      <div>
        <strong>{t.title}</strong>
        <span>{t.description}</span>
        <small>
          {snapshot?.tenant.name ?? t.notLoaded} · {t.auditCases}: {snapshot?.auditCases.length ?? 0} ·{' '}
          {t.auditRuns}: {snapshot?.auditRuns.length ?? 0} · {t.reviewTickets}:{' '}
          {snapshot?.reviewTickets.length ?? 0}
          {snapshot?.seededAt === undefined ? '' : ` · ${t.seededAt}: ${formatDate(snapshot.seededAt)}`}
        </small>
        {notice ? <em>{notice}</em> : null}
      </div>
      <div>
        <button className="ghost-button" disabled={busy || !auth.can('global:manage')} type="button" onClick={() => void runDemoAction('seed')}>
          {busy ? t.processing : t.seed}
        </button>
        <button className="ghost-button" disabled={busy || !auth.can('global:manage')} type="button" onClick={() => void runDemoAction('reset')}>
          {t.resetAction}
        </button>
      </div>
    </section>
  );
}

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const { messages } = useLanguage();
  if (pathname === '/landing' || pathname === '/api-docs') return <>{children}</>;
  const routeKey = isKnownRoute(pathname) ? pathname : 'fallback';
  const route = messages.routes[routeKey];
  const requiredPermissions = routePermissionsFor(pathname);

  return (
    <div className="app-shell">
      <RoleBasedSidebar pathname={pathname} />

      <section className="app-main">
        <header className="app-header">
          <div>
            <p>{messages.app.name}</p>
            <h1>{route.title}</h1>
            <span>{route.subtitle}</span>
          </div>
          <div className="app-header__actions">
            <LanguageSwitcher />
            <Link className="ghost-button app-header__help" href="/help-center" data-tooltip={messages.onboarding.helpTooltip}>
              {messages.onboarding.help}
            </Link>
            <PermissionGate permissions={routePermissions['/uat']}>
              <Link className="ghost-button" href="/uat">
                {messages.app.uatGate}
              </Link>
            </PermissionGate>
            <PermissionGate permissions={routePermissions['/incidents']}>
              <Link className="ghost-button" href="/incidents">
                {messages.app.killSwitch}
              </Link>
            </PermissionGate>
            <ThemeSwitcher />
          </div>
        </header>
        <DemoModeBanner />
        <OnboardingGuide />
        <div className="app-content">
          <ProtectedRoute permissions={requiredPermissions}>{children}</ProtectedRoute>
        </div>
      </section>
    </div>
  );
}
