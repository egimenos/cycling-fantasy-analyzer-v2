import { useState } from 'react';
import { cn } from '@/shared/lib/utils';

interface RiderAvatarProps {
  avatarUrl: string | null;
  fullName: string;
  nationality: string | null;
  size?: 'sm' | 'md';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
} as const;

const FLAG_SIZE_CLASSES = {
  sm: 'text-[8px] -bottom-0.5 -right-0.5',
  md: 'text-[10px] -bottom-0.5 -right-0.5',
} as const;

const PALETTE = [
  'bg-primary/20 text-primary',
  'bg-secondary/20 text-secondary',
  'bg-tertiary/20 text-tertiary',
  'bg-green-500/20 text-green-600 dark:text-green-400',
  'bg-purple-500/20 text-purple-500',
  'bg-blue-500/20 text-blue-500',
  'bg-orange-500/20 text-orange-600 dark:text-orange-400',
  'bg-pink-500/20 text-pink-500',
];

function getInitials(fullName: string): string {
  const parts = fullName.split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function nameToColorClass(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function countryCodeToEmoji(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

export function RiderAvatar({
  avatarUrl,
  fullName,
  nationality,
  size = 'sm',
  className,
}: RiderAvatarProps) {
  const [imgError, setImgError] = useState(false);

  const showImage = avatarUrl && !imgError;

  return (
    <div className={cn('relative flex-shrink-0', className)}>
      {showImage ? (
        <img
          src={avatarUrl}
          alt={fullName}
          loading="lazy"
          width={size === 'sm' ? 28 : 36}
          height={size === 'sm' ? 28 : 36}
          onError={() => setImgError(true)}
          className={cn(
            'rounded-full object-cover border border-outline-variant/20',
            SIZE_CLASSES[size],
          )}
        />
      ) : (
        <div
          className={cn(
            'rounded-full flex items-center justify-center font-mono font-bold border border-outline-variant/20',
            SIZE_CLASSES[size],
            nameToColorClass(fullName),
          )}
          title={fullName}
        >
          {getInitials(fullName)}
        </div>
      )}
      {nationality && (
        <span
          className={cn('absolute leading-none select-none', FLAG_SIZE_CLASSES[size])}
          aria-hidden="true"
        >
          {countryCodeToEmoji(nationality)}
        </span>
      )}
    </div>
  );
}
