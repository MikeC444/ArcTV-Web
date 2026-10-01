import { useEffect, useRef, useState } from "react";
import { MdCheck, MdExpandLess, MdExpandMore } from "react-icons/md";

interface GenrePickerProps {
  genres: string[];
  /** The chosen genre, or null for "All genres". */
  value: string | null;
  onChange(genre: string | null): void;
}

/** The "All genres" drop-down beside the Movies / TV Shows title: a pill that opens a two-column list of genres. */
export function GenrePicker({ genres, value, onChange }: GenrePickerProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    // focus the chosen genre (or "All genres") so the keyboard / remote starts from where you are
    const chosen = root.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    chosen?.focus({ preventScroll: true });
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

  const pick = (genre: string | null) => {
    setOpen(false);
    button.current?.focus();
    if (genre !== value) onChange(genre);
  };

  return (
    <div className="genrepick" ref={root}>
      <button ref={button} type="button" className="genrepick__button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{value ?? "All genres"}</span>
        {open ? <MdExpandLess aria-hidden="true" /> : <MdExpandMore aria-hidden="true" />}
      </button>
      {open ? (
        <div className="genrepick__panel" role="listbox" aria-label="Genre" data-spatial-trap="true">
          <button type="button" role="option" aria-selected={value === null} className="genrepick__all" onClick={() => pick(null)}>
            <span>All genres</span>
            {value === null ? <MdCheck aria-hidden="true" /> : null}
          </button>
          <div className="genrepick__grid">
            {genres.map((genre) => (
              <button key={genre} type="button" role="option" aria-selected={value === genre} className="genrepick__option" onClick={() => pick(genre)}>
                <span>{genre}</span>
                {value === genre ? <MdCheck aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
