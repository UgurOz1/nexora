import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Joins class names and resolves Tailwind conflicts (the last one wins): cn('p-2', cond && 'p-4').
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
