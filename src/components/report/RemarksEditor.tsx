import React, { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toRemarksHtml } from "@/lib/remarksHtml";

interface RemarksEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const FORMAT_COMMANDS = ["bold", "italic", "underline"] as const;

// Lightweight rich-text editor for remarks — a contentEditable box with a
// Bold/Italic/Underline toolbar that formats the current selection via the
// browser's built-in execCommand, rather than the whole field at once (the
// per-value bold/italic/underline toggles elsewhere in the app apply to one
// flat value; remarks needs mid-sentence formatting, which that can't do).
const RemarksEditor: React.FC<RemarksEditorProps> = ({
  value,
  onChange,
  placeholder,
  disabled,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  // Starts as null (not `value`) so the seed effect below always runs on
  // mount — if it started equal to `value`, the initial content would never
  // get written into the DOM, leaving the editor blank even when there's
  // real saved content to show (and silently wiping it on next save).
  const lastEmittedRef = useRef<string | null>(null);
  const [activeFormats, setActiveFormats] = useState<string[]>([]);

  // Only re-seed the DOM when `value` changed from outside this editor (e.g.
  // switching which report is being edited) — never on our own onChange, or
  // every keystroke would reset the cursor to the start.
  useEffect(() => {
    if (ref.current && value !== lastEmittedRef.current) {
      ref.current.innerHTML = toRemarksHtml(value);
      lastEmittedRef.current = value;
    }
  }, [value]);

  const syncActiveFormats = () => {
    setActiveFormats(
      FORMAT_COMMANDS.filter((cmd) => {
        try {
          return document.queryCommandState(cmd);
        } catch {
          return false;
        }
      }),
    );
  };

  const emitChange = () => {
    if (!ref.current) return;
    const html = ref.current.innerHTML === "<br>" ? "" : ref.current.innerHTML;
    lastEmittedRef.current = html;
    onChange(html);
  };

  const handleToolbarChange = (newValues: string[]) => {
    const changed = FORMAT_COMMANDS.find(
      (cmd) => newValues.includes(cmd) !== activeFormats.includes(cmd),
    );
    if (!changed || !ref.current) return;
    ref.current.focus();
    try {
      // Pin execCommand to emit legacy tags (<b>/<i>/<u>) instead of
      // CSS/span-based markup — some engines default the other way
      // depending on selection context, and the server sanitizer only
      // allows the tag-based form (a style attribute is always stripped).
      // TS types the 3rd arg as string, but the real DOM API expects an
      // actual boolean here — a stringified "false" is truthy and would
      // enable styleWithCSS instead of disabling it.
      document.execCommand("styleWithCSS", false, false as unknown as string);
    } catch {
      // Unsupported in some engines — execCommand(changed) below still works.
    }
    document.execCommand(changed);
    syncActiveFormats();
    emitChange();
  };

  return (
    <div className="rounded-md border border-input bg-background">
      <div className="flex items-center gap-1 border-b border-input p-1">
        <ToggleGroup
          type="multiple"
          size="sm"
          value={activeFormats}
          onValueChange={handleToolbarChange}
          disabled={disabled}
        >
          <ToggleGroupItem
            value="bold"
            aria-label="Bold"
            onMouseDown={(e) => e.preventDefault()}
          >
            <Bold size={14} />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="italic"
            aria-label="Italic"
            onMouseDown={(e) => e.preventDefault()}
          >
            <Italic size={14} />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="underline"
            aria-label="Underline"
            onMouseDown={(e) => e.preventDefault()}
          >
            <Underline size={14} />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className="min-h-[90px] px-3 py-2 text-sm focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground"
        onInput={emitChange}
        onMouseUp={syncActiveFormats}
        onKeyUp={syncActiveFormats}
        onFocus={syncActiveFormats}
      />
    </div>
  );
};

export default RemarksEditor;
