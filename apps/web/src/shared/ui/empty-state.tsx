interface EmptyStateProps extends React.ComponentPropsWithoutRef<'div'> {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

export function EmptyState({ title, description, icon, ...rest }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center" {...rest}>
      {icon ? (
        <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center text-primary text-3xl">
          {icon}
        </div>
      ) : (
        <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center text-primary text-2xl">
          <span>&#x1F6B4;</span>
        </div>
      )}
      <h3 className="text-lg font-headline font-bold text-on-surface">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-on-surface-variant leading-relaxed">{description}</p>
      )}
    </div>
  );
}
