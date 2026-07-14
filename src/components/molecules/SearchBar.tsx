import React from "react";
import Input from "../atoms/Input";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SearchBar({
  value,
  onChange,
  placeholder = "Search sessions...",
}: SearchBarProps) {
  return (
    <Input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      variant="dark"
      className="!py-2 !text-xs"
      leftIcon="🔍"
    />
  );
}
