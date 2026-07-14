import React, { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  variant?: "normal" | "dark";
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      leftIcon,
      rightIcon,
      variant = "normal",
      className = "",
      ...props
    },
    ref,
  ) => {
    const bgStyle = variant === "dark" ? "bg-neutral-900" : "bg-neutral-800";
    
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label className="text-sm font-medium text-neutral-300">
            {label}
          </label>
        )}
        <div className="relative w-full">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={`w-full ${bgStyle} border border-white/10 rounded-lg py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors placeholder-neutral-500 disabled:opacity-50
              ${leftIcon ? "pl-9" : "pl-4"}
              ${rightIcon ? "pr-12" : "pr-4"}
              ${className}
            `}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  },
);

Input.displayName = "Input";

export default Input;
