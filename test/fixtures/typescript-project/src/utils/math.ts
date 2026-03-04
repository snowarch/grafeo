// Sample utility module

export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export const PI = 3.14159;

export interface MathResult {
  value: number;
  operation: string;
}

export type NumberPair = [number, number];
