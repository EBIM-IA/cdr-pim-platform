import { cn } from '@/lib/utils';

function BearingArt() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2.2">
      <ellipse cx="85" cy="70" rx="48" ry="45" />
      <ellipse cx="85" cy="70" rx="27" ry="25" />
      <path
        d="M44 47c11-14 25-21 42-21 16 0 31 8 41 21M44 93c11 14 25 21 42 21 16 0 31-8 41-21"
        opacity=".45"
      />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((degree) => {
        const radians = (degree * Math.PI) / 180;
        return (
          <circle
            key={degree}
            cx={85 + Math.cos(radians) * 37}
            cy={70 + Math.sin(radians) * 35}
            r="4.2"
            fill="white"
          />
        );
      })}
      <path d="M134 42l18 10v38l-18 10M37 43L20 53v36l17 10" opacity=".25" />
    </g>
  );
}

function BrakeArt() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="84" cy="70" r="45" />
      <circle cx="84" cy="70" r="17" />
      <circle cx="84" cy="70" r="6" />
      {[0, 72, 144, 216, 288].map((degree) => {
        const radians = (degree * Math.PI) / 180;
        return (
          <circle
            key={degree}
            cx={84 + Math.cos(radians) * 28}
            cy={70 + Math.sin(radians) * 28}
            r="3"
          />
        );
      })}
      <path d="M126 40c15 10 21 27 16 45l-14 22-13-9 9-18-1-25z" fill="white" />
    </g>
  );
}

function FluidArt() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M65 29h35v16l10 9v56H50V54l15-9z" />
      <path d="M65 29v17h35V29M59 61h42v35H59zM76 19h29v10H76z" />
      <path d="M68 73h24M68 82h18" opacity=".55" />
      <path d="M51 56L35 68v31l15 8" opacity=".25" />
    </g>
  );
}

export function ProductArtwork({
  category,
  name,
  compact = false,
  className,
}: {
  category: string;
  name: string;
  compact?: boolean;
  className?: string;
}) {
  const normalized = category.toLocaleLowerCase('es');
  const art = /aceite|grasa|lubric|fluido/.test(normalized) ? (
    <FluidArt />
  ) : /freno|disco|pastilla|tambor/.test(normalized) ? (
    <BrakeArt />
  ) : (
    <BearingArt />
  );

  return (
    <figure
      className={cn(
        'grid place-items-center overflow-hidden rounded-lg bg-[#f4f5f6] text-slate-600',
        compact ? 'size-16' : 'aspect-[4/3] w-full',
        className,
      )}
      role="img"
      aria-label={`Ilustración referencial de ${name}; no representa la fotografía del producto`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 170 140"
        className={cn(compact ? 'size-14' : 'h-[78%] w-[78%]')}
      >
        {art}
      </svg>
    </figure>
  );
}
