type SpriteKind = 'ingot' | 'die' | 'rack' | 'pod' | 'rocket';

export function ItemSprite({
  kind,
  color,
}: {
  kind: SpriteKind;
  color: string;
}) {
  const common = "drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]";
  const uniqueId = `sprite-${kind}-${Math.random().toString(36).substr(2, 9)}`;
  
  switch (kind) {
    case 'ingot':
      return (
        <svg viewBox="0 0 32 16" className={`h-3 w-5 ${common}`}>
          <defs>
            <linearGradient id={uniqueId} x1="0" x2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.5" />
              <stop offset="100%" stopColor={color} />
            </linearGradient>
          </defs>
          <rect x="2" y="4" width="28" height="8" rx="2" fill={`url(#${uniqueId})`} />
        </svg>
      );
    case 'die':
      return (
        <svg viewBox="0 0 20 20" className={`h-3 w-3 ${common}`}>
          <rect x="2" y="2" width="16" height="16" rx="3"
                fill={color} opacity={0.9} />
          <rect x="5" y="5" width="3" height="3" fill="#020617" />
          <rect x="9" y="5" width="3" height="3" fill="#020617" />
          <rect x="13" y="5" width="3" height="3" fill="#020617" />
          <rect x="5" y="9" width="3" height="3" fill="#020617" />
        </svg>
      );
    case 'rack':
      return (
        <svg viewBox="0 0 24 24" className={`h-4 w-3 ${common}`}>
          <rect x="4" y="2" width="16" height="20" rx="2" fill={color} />
          <rect x="6" y="4" width="12" height="3" fill="#020617" />
          <rect x="6" y="9" width="12" height="3" fill="#020617" />
          <rect x="6" y="14" width="12" height="3" fill="#020617" />
        </svg>
      );
    case 'pod':
      return (
        <svg viewBox="0 0 24 24" className={`h-4 w-4 ${common}`}>
          <circle cx="12" cy="10" r="7" fill={color} />
          <rect x="9" y="14" width="6" height="6" rx="2" fill={color} />
          <circle cx="12" cy="10" r="3" fill="#020617" />
        </svg>
      );
    case 'rocket':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4 drop-shadow-[0_0_8px_rgba(248,113,113,0.9)]">
          <path d="M12 2c4 2 6 6 6 11l-3 3-3-1-3 1-3-3C6 8 8 4 12 2z" fill={color} />
          <circle cx="12" cy="9" r="2" fill="#0f172a" />
          <path d="M9 18l-1 3 2-1 2 1 2-1 2 1-1-3" fill="#f97316" />
        </svg>
      );
  }
}

