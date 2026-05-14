"use client";

import {useState} from "react";
import {format} from "date-fns";
import {Calendar as CalendarIcon} from "lucide-react";
import {Calendar} from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {cn} from "@/lib/utils";

interface AppDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

export function AppDatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  label,
  className,
}: AppDatePickerProps) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(value) : undefined;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {label && (
        <span className="text-[10px] text-white/40 whitespace-nowrap">{label}</span>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="date-input-app flex items-center gap-2 min-w-[132px] text-left text-sm text-white/95 py-2 px-3 rounded-xl cursor-pointer"
          >
            <CalendarIcon size={14} className="text-secondary shrink-0" />
            <span className="flex-1">
              {date ? format(date, "dd MMM yyyy") : placeholder}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto p-0 border border-white/10 bg-[hsl(237,56%,13%)] shadow-xl"
          sideOffset={6}
        >
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => {
              if (d) {
                onChange(format(d, "yyyy-MM-dd"));
                setOpen(false);
              }
            }}
            classNames={{
              months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
              month: "space-y-4 p-3",
              caption: "flex justify-center pt-1 relative items-center",
              caption_label: "text-sm font-medium text-white/90",
              nav: "space-x-1 flex items-center",
              nav_button: "h-8 w-8 p-0 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10",
              nav_button_previous: "absolute left-1",
              nav_button_next: "absolute right-1",
              table: "w-full border-collapse space-y-1",
              head_row: "flex",
              head_cell: "text-white/50 rounded-md w-9 font-normal text-[0.8rem]",
              row: "flex w-full mt-2",
              cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected])]:rounded-md",
              day: "h-9 w-9 p-0 font-normal text-white/90 rounded-md hover:bg-white/10 aria-selected:opacity-100",
              day_selected:
                "bg-[hsl(232,42%,53%)] text-white hover:bg-[hsl(232,42%,48%)] focus:bg-[hsl(232,42%,53%)]",
              day_today: "bg-white/15 text-white font-medium",
              day_outside: "text-white/30 opacity-50",
              day_disabled: "text-white/30 opacity-40",
              day_hidden: "invisible",
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
