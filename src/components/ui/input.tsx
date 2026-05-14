import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, autoComplete, ...props }, ref) => {
    return (
      <input
        type={type}
        // Default to autoComplete="off" everywhere. The HR app handles a lot
        // of PII (CURP, RFC, NSS, bank, personal email, addresses) and we
        // don't want browsers retaining a dropdown history of every employee
        // ever entered. Forms that NEED autocomplete (login, password reset)
        // pass an explicit value like "username" or "current-password".
        autoComplete={autoComplete ?? "off"}
        className={cn(
          "flex h-10 w-full rounded-lg border-b-2 border-transparent bg-muted px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:bg-card focus-visible:border-b-primary transition-[background-color,border-color] duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
