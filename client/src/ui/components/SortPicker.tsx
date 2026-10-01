import { useEffect, useRef, useState } from "react";
import { MdCheck, MdExpandLess, MdExpandMore } from "react-icons/md";

interface SortPickerProps<T extends string> {
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange(id: T): void;
}

/** "Sort by: …" drop-down: the same pill-and-panel look as the genre drop-down on Movies / TV Shows, with a single column of choices. */
export function SortPicker<T extends string>({ options, value, onChange }: SortPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.id === value) ?? options[0]!;

  useEffect(() => {
    if (!open) return undefined;
    root.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Backspace") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const pick = (id: T) => {
    setOpen(false);
    button.current?.focus();
    if (id !== value) onChange(id);
  };

  return (
    <div className="genrepick sortpick" ref={root}>
      <button ref={button} type="button" className="genrepick__button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>
          <span className="c-text-2">Sort by:</span> {current.label}
        </span>
        {open ? <MdExpandLess aria-hidden="true" /> : <MdExpandMore aria-hidden="true" />}
      </button>
      {open ? (
        <div className="genrepick__panel" role="listbox" aria-label="Sort by" data-spatial-trap="true">
          <div className="genrepick__grid">
            {options.map((o) => (
              <button key={o.id} type="button" role="option" aria-selected={value === o.id} className="genrepick__option" onClick={() => pick(o.id)}>
                <span>{o.label}</span>
                {value === o.id ? <MdCheck aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
