import type { InputHTMLAttributes } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchInputProps = InputHTMLAttributes<HTMLInputElement>;

interface SearchInputComponentProps extends SearchInputProps {
  wrapperClassName?: string;
}

export function SearchInput({
  className,
  wrapperClassName,
  ...props
}: SearchInputComponentProps) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input className={cn("pl-10", className)} {...props} />
    </div>
  );
}
