import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge clsx classes with Tailwind class deduplication. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
