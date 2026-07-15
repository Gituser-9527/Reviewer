import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'info';
type RiskTone = 'none' | 'low' | 'medium' | 'high' | 'critical';
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type CardTone = Tone | 'plain';

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: Readonly<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
  }
>) {
  return (
    <button className={`ds-button ds-button--${variant} ${className}`.trim()} type="button" {...props}>
      {children}
    </button>
  );
}

export function Card({
  eyebrow,
  title,
  description,
  tone = 'plain',
  actions,
  children,
}: Readonly<{
  eyebrow?: string;
  title?: string;
  description?: string;
  tone?: CardTone;
  actions?: ReactNode;
  children?: ReactNode;
}>) {
  return (
    <section className={`ds-card ds-card--${tone}`}>
      {eyebrow || title || description || actions ? (
        <header className="ds-card__header">
          <div>
            {eyebrow ? <p className="section-label">{eyebrow}</p> : null}
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="ds-card__actions">{actions}</div> : null}
        </header>
      ) : null}
      {children ? <div className="ds-card__body">{children}</div> : null}
    </section>
  );
}

export function Badge({
  tone = 'default',
  children,
}: Readonly<{
  tone?: Tone;
  children: ReactNode;
}>) {
  return <span className={`ds-badge ds-badge--${tone}`}>{children}</span>;
}

export function TableShell({
  title,
  description,
  children,
}: Readonly<{
  title?: string;
  description?: string;
  children: ReactNode;
}>) {
  return (
    <section className="ds-table-shell">
      {title || description ? (
        <header>
          {title ? <h2>{title}</h2> : null}
          {description ? <p>{description}</p> : null}
        </header>
      ) : null}
      <div className="ds-table-shell__scroll">{children}</div>
    </section>
  );
}

export function Dialog({
  title,
  description,
  children,
  footer,
}: Readonly<{
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}>) {
  return (
    <section aria-labelledby="dialog-title" aria-modal="true" className="ds-dialog" role="dialog">
      <header>
        <h2 id="dialog-title">{title}</h2>
        {description ? <p>{description}</p> : null}
      </header>
      {children ? <div className="ds-dialog__body">{children}</div> : null}
      {footer ? <footer>{footer}</footer> : null}
    </section>
  );
}

export function Toast({
  tone = 'info',
  title,
  message,
}: Readonly<{
  tone?: Tone;
  title: string;
  message?: string;
}>) {
  return (
    <section className={`ds-toast ds-toast--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <strong>{title}</strong>
      {message ? <p>{message}</p> : null}
    </section>
  );
}

export function PageContainer({
  eyebrow,
  title,
  description,
  width = 'wide',
  children,
}: Readonly<{
  eyebrow?: string;
  title: string;
  description?: string;
  width?: 'compact' | 'default' | 'wide' | 'full';
  children: ReactNode;
}>) {
  return (
    <main className={`page-container page-container--${width}`}>
      <section className="intro-block intro-block--compact">
        {eyebrow ? <p className="section-label">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </section>
      {children}
    </main>
  );
}

export function StatCard({
  label,
  value,
  helper,
  tone = 'default',
}: Readonly<{
  label: string;
  value: string | number;
  helper?: string;
  tone?: Tone;
}>) {
  return (
    <article className={`stat-card stat-card--${tone} ds-card ds-card--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </article>
  );
}

export function MetricCard({
  label,
  value,
  helper,
  tone = 'default',
  size = 'md',
}: Readonly<{
  label: string;
  value: string | number;
  helper?: string;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
}>) {
  return (
    <article className={`metric-card metric-card--${size} metric-card--${tone}`}>
      <span>{label}</span>
      <strong title={String(value)}>{value}</strong>
      <small>{helper ?? ''}</small>
    </article>
  );
}

export function MetadataList({ items }: Readonly<{ items: Array<{ label: string; value: string }> }>) {
  return (
    <dl className="metadata-list">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd title={item.value}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RiskBadge({
  level,
  children,
}: Readonly<{
  level: RiskTone | string;
  children?: ReactNode;
}>) {
  const normalized = level.toLowerCase();
  return <span className={`risk-badge risk-badge--${normalized}`}>{children ?? level}</span>;
}

export function EmptyState({
  title,
  description,
  action,
}: Readonly<{
  title: string;
  description?: string;
  action?: ReactNode;
}>) {
  return (
    <section className="empty-state empty-state--modern">
      <div className="empty-state__icon">∅</div>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </section>
  );
}

export function LoadingState({ label = 'Loading…' }: Readonly<{ label?: string }>) {
  return (
    <section className="state-card state-card--loading">
      <span className="state-spinner" aria-hidden="true" />
      <strong>{label}</strong>
    </section>
  );
}

export function SkeletonPanel({ blocks = 4 }: Readonly<{ blocks?: number }>) {
  return (
    <section className="skeleton-panel" aria-label="Loading">
      {Array.from({ length: blocks }, (_, index) => (
        <div key={index} />
      ))}
    </section>
  );
}

export function ErrorState({
  title = 'Error',
  message,
}: Readonly<{
  title?: string;
  message: string;
}>) {
  return (
    <section className="state-card state-card--error" role="alert">
      <strong>{title}</strong>
      <p>{message}</p>
    </section>
  );
}
