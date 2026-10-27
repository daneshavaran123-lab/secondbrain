import React from 'react';
import { cn } from '@/lib/utils';

interface AuroraBackgroundProps {
  className?: string;
  intensity?: 'subtle' | 'normal' | 'vivid';
  children?: React.ReactNode;
}

/**
 * Page wrapper kept for API compatibility. The animated aurora was removed in
 * favour of the flat minimal surfaces; `intensity` is accepted and ignored.
 */
export const AuroraBackground: React.FC<AuroraBackgroundProps> = ({ className, children }) => (
  <div className={cn('relative isolate', className)}>{children}</div>
);

export default AuroraBackground;