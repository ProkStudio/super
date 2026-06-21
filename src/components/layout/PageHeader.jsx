/**
 * Truwas-style page header (keeps TechPro / nexus accent colors).
 */
export default function PageHeader({ icon: Icon, title, description, actions, className = '' }) {
  return (
    <div className={`flex items-start justify-between shrink-0 gap-4 flex-wrap ${className}`}>
      <div>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2 tracking-tight">
          {Icon && <Icon className="w-7 h-7 shrink-0" style={{ color: 'var(--nexus-accent)' }} />}
          {title}
        </h1>
        {description && (
          <div className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</div>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
