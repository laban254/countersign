import React, { useId } from 'react';

interface LogoMarkProps {
  className?: string;
}

/**
 * The Countersign mark: a shield (the guardrail) holding two ticks. The faint tick is the
 * agent's request; the solid one is the human countersign.
 */
export const LogoMark: React.FC<LogoMarkProps> = ({ className = 'w-8 h-8' }) => {
  const gradientId = useId();
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="3" y1="2" x2="29" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f97316" />
          <stop offset=".55" stopColor="#ec4899" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.2 27 6.1v8.6c0 7.1-4.6 12.2-11 15.1C9.6 26.9 5 21.8 5 14.7V6.1L16 2.2Z"
        fill={`url(#${gradientId})`}
      />
      <path
        d="M8.9 15.6 12.2 19l5.6-7.1"
        stroke="#fff"
        strokeOpacity=".45"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.6 15.6 16.9 19l7.2-9"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

interface LogoProps {
  /** Size of the mark in Tailwind units, e.g. 'w-8 h-8'. */
  markClassName?: string;
  textClassName?: string;
  /** Use light text on dark backgrounds. */
  inverted?: boolean;
  /** Hide the wordmark on very small screens, leaving only the mark. */
  compactOnMobile?: boolean;
}

export const Logo: React.FC<LogoProps> = ({
  markClassName = 'w-8 h-8',
  textClassName = 'text-[17px]',
  inverted = false,
  compactOnMobile = false,
}) => (
  <span className="inline-flex items-center gap-2.5">
    <LogoMark className={markClassName} />
    <span className={`${textClassName} tracking-tight leading-none ${compactOnMobile ? 'hidden sm:inline' : ''}`}>
      <span className={`font-medium ${inverted ? 'text-slate-300' : 'text-slate-500'}`}>counter</span>
      <span className={`font-bold ${inverted ? 'text-white' : 'text-slate-900'}`}>sign</span>
    </span>
  </span>
);
