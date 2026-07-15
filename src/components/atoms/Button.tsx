import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "icon" | "clear";
  size?: "xs" | "sm" | "md" | "lg" | "none";
  fullWidth?: boolean;
}

export default function Button({
  children,
  variant = "secondary",
  size = "md",
  fullWidth = false,
  className = "",
  ...props
}: ButtonProps) {
  const baseStyles = "transition-all duration-200 active:scale-[0.98] font-bold focus:outline-none select-none flex items-center justify-center gap-1.5 cursor-pointer";
  
  const variants = {
    primary: "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
    secondary: "bg-neutral-900 border border-white/10 hover:border-violet-500 hover:bg-neutral-800 text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
    danger: "bg-red-600 hover:bg-red-500 text-white shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
    ghost: "text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-50",
    icon: "p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white disabled:opacity-50",
    clear: "text-[0.625rem] text-neutral-400 hover:text-white uppercase font-bold tracking-wider hover:bg-neutral-800 px-2 py-1 rounded transition",
  };

  const sizes = {
    xs: "px-2.5 py-1.5 rounded-lg text-[0.625rem]",
    sm: "px-3 py-1.5 rounded-lg text-xs",
    md: "px-4 py-2 rounded-xl text-sm",
    lg: "px-6 py-3 rounded-2xl text-base",
    none: "",
  };

  const widthStyle = fullWidth ? "w-full" : "";

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${widthStyle} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
