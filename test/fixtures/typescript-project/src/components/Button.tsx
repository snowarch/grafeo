import React from 'react';
import { add } from '../utils/math';

export interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export class ButtonState {
  isHovered: boolean = false;
  clickCount: number = 0;

  increment() {
    this.clickCount = add(this.clickCount, 1);
  }

  reset() {
    this.clickCount = 0;
  }
}

export default function Button({ label, onClick, variant = 'primary' }: ButtonProps) {
  return React.createElement('button', { onClick, className: variant }, label);
}
