import React, { forwardRef } from "react";

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = "", ...props }, ref) => {
    return (
      <div className="flex items-center justify-between py-1">
        <span className="text-sm font-medium text-neutral-300">
          {label}
        </span>
        <input
          type="checkbox"
          ref={ref}
          className={`w-4 h-4 rounded text-violet-600 bg-neutral-700 border-neutral-600 focus:ring-violet-500 cursor-pointer accent-violet-600 ${className}`}
          {...props}
        />
      </div>
    );
  },
);

Checkbox.displayName = "Checkbox";

export default Checkbox;
