import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { usePositions, useAddPosition } from "@/hooks/useRecruiting";
import { Check, Plus, X, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";

interface Props {
  /** Currently selected position names. */
  value: string[];
  /** Called with the new full list whenever a tag is added/removed. */
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

/**
 * Multi-select combobox for position fit tags. Options come from
 * recruiting_positions; typing a name that doesn't exist yet shows an
 * "Add …" row that saves it for everyone going forward.
 */
export function PositionFitPicker({ value, onChange, disabled }: Props) {
  const { data: positions = [] } = usePositions();
  const addPosition = useAddPosition();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const toggle = (name: string) => {
    onChange(
      value.includes(name) ? value.filter((v) => v !== name) : [...value, name],
    );
  };

  const trimmed = search.trim();
  const exists = positions.some(
    (p) => p.name.toLowerCase() === trimmed.toLowerCase(),
  );

  const handleCreate = async () => {
    if (!trimmed) return;
    try {
      await addPosition.mutateAsync(trimmed);
      toggle(trimmed);
      setSearch("");
    } catch (e) {
      toast.error(`Couldn't add position: ${e instanceof Error ? e.message : "unknown"}`);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.length === 0 && (
          <span className="text-sm text-muted-foreground">No positions tagged</span>
        )}
        {value.map((name) => (
          <Badge key={name} variant="secondary" className="gap-1 pr-1">
            {name}
            {!disabled && (
              <button
                type="button"
                onClick={() => toggle(name)}
                className="rounded-full hover:bg-muted-foreground/20"
                aria-label={`Remove ${name}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            Tag positions…
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search or add a position…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                {trimmed ? "No match — add it below." : "No positions yet."}
              </CommandEmpty>
              <CommandGroup>
                {positions.map((p) => (
                  <CommandItem key={p.id} value={p.name} onSelect={() => toggle(p.name)}>
                    <Check
                      className={`mr-2 h-4 w-4 ${value.includes(p.name) ? "opacity-100" : "opacity-0"}`}
                    />
                    {p.name}
                  </CommandItem>
                ))}
                {trimmed && !exists && (
                  <CommandItem
                    value={`__create__${trimmed}`}
                    onSelect={handleCreate}
                    disabled={addPosition.isPending}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add “{trimmed}”
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
