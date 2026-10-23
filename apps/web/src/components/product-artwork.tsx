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

function SealArt() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="85" cy="70" rx="51" ry="39" />
      <ellipse cx="85" cy="70" rx="40" ry="29" />
      <ellipse cx="85" cy="70" rx="28" ry="19" />
      <path d="M34 70v10c0 22 23 39 51 39s51-17 51-39V70M45 89c10 12 24 18 40 18s30-6 40-18" />
    </g>
  );
}

function FilterArt() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="85" cy="36" rx="34" ry="14" />
      <ellipse cx="85" cy="36" rx="12" ry="5" />
      <path d="M51 36v65c0 8 15 15 34 15s34-7 34-15V36M51 94c0 8 15 15 34 15s34-7 34-15" />
      {[61, 73, 85, 97, 109].map((x) => (
        <path key={x} d={`M${x} 54v43`} opacity=".45" />
      ))}
    </g>
  );
}

function BearingDrawing() {
  return (
    <svg aria-hidden="true" viewBox="0 0 360 240" className="h-auto w-full">
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        {[78, 65, 43, 30].map((radius) => (
          <circle key={radius} cx="106" cy="124" r={radius} />
        ))}
        {Array.from({ length: 9 }, (_, index) => {
          const angle = (index * Math.PI * 2) / 9;
          return (
            <circle
              key={index}
              cx={106 + Math.cos(angle) * 54}
              cy={124 + Math.sin(angle) * 54}
              r="10"
            />
          );
        })}
        <path d="M225 46h41v18h-41zM225 82h41v12h-41zM225 154h41v12h-41zM225 184h41v18h-41z" />
        <circle cx="245.5" cy="73" r="9" />
        <circle cx="245.5" cy="175" r="9" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth=".7" strokeDasharray="5 4" opacity=".5">
        <path d="M16 124h180M106 34v180M212 124h68" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth=".8">
        <path d="M225 26h41M225 21v10M266 21v10M291 46v156M286 46h10M286 202h10M316 94v60M311 94h10M311 154h10" />
      </g>
      <g fill="currentColor" fontSize="12" textAnchor="middle">
        <text x="245" y="19">
          B
        </text>
        <text x="304" y="58">
          D
        </text>
        <text x="329" y="129">
          d
        </text>
      </g>
    </svg>
  );
}

export function ProductArtwork({
  category,
  name,
  compact = false,
  technical = false,
  className,
}: {
  category: string;
  name: string;
  compact?: boolean;
  technical?: boolean;
  className?: string;
}) {
  const normalized = `${category} ${name}`.toLocaleLowerCase('es');
  const art = /aceite|grasa|lubric|fluido/.test(normalized) ? (
    <FluidArt />
  ) : /freno|disco|pastilla|tambor/.test(normalized) ? (
    <BrakeArt />
  ) : /reten|retén|sello|empaque/.test(normalized) ? (
    <SealArt />
  ) : /filtro/.test(normalized) ? (
    <FilterArt />
  ) : (
    <BearingArt />
  );

  return (
    <figure
      className={cn(
        'grid place-items-center overflow-hidden rounded-lg border border-[#eceef1] bg-[#fafbfc] bg-[linear-gradient(#eef0f3_1px,transparent_1px),linear-gradient(90deg,#eef0f3_1px,transparent_1px)] bg-[length:12px_12px] text-[#7d8791]',
        compact ? 'size-16' : 'aspect-[4/3] w-full',
        className,
      )}
      role="img"
      aria-label={`Ilustración referencial de ${name}; no representa la fotografía del producto`}
    >
      {technical && /rodam|cojine|bearing|bolas|rodillos|agujas|c[oó]nico/.test(normalized) ? (
        <BearingDrawing />
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 170 140"
          className={cn(compact ? 'size-14' : 'h-[78%] w-[78%]')}
        >
          {art}
        </svg>
      )}
    </figure>
  );
}
