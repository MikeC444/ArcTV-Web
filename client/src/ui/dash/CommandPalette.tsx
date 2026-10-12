import { useEffect, useMemo, useRef, useState } from "react";
import { MdPerson, MdSearch } from "react-icons/md";
import { fetchAdminUsers, NO_FILTERS, type AdminUserRow } from "../../state/admin";
import { VIEWS, type ViewId } from "./views";

interface Item {
  key: string;
  label: string;
  hint: string;
  run(): void;
}

/** Ctrl+K: jump to a view, or search every account by email or name. Arrow keys and Enter, Esc to close. */
export function CommandPalette({ onClose, onGo }: { onClose(): void; onGo(view: ViewId, userId?: string | null): void }) {
  const [text, setText] = useState("");
  const [people, setPeople] = useState<AdminUserRow[]>([]);
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) {
      setPeople([]);
      return undefined;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      fetchAdminUsers({ ...NO_FILTERS, q }, 6).then((l) => !cancelled && setPeople(l.users)).catch(() => !cancelled && setPeople([]));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [text]);

  const items: Item[] = useMemo(() => {
    const q = text.trim().toLowerCase();
    const views = VIEWS.filter((v) => !q || v.label.toLowerCase().includes(q)).map((v): Item => ({ key: `v-${v.id}`, label: v.label, hint: v.hint, run: () => onGo(v.id) }));
    const users = people.map((u): Item => ({ key: `u-${u.id}`, label: u.email, hint: u.displayName ?? "Open user", run: () => onGo("users", u.id) }));
    return [...views, ...users];
  }, [text, people, onGo]);
  useEffect(() => setAt(0), [items.length]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setAt((n) => Math.min(items.length - 1, n + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAt((n) => Math.max(0, n - 1));
    } else if (e.key === "Enter") choose(items[at]);
  };

  return (
    <div className="dd-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div className="dd-palette" role="dialog" aria-modal="true" aria-label="Search the dashboard" onKeyDown={onKey}>
        <div className="dd-palette__in"><MdSearch aria-hidden="true" /><input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Search users by email or name, or type a view" aria-label="Search" /></div>
        <ul className="dd-palette__list" role="listbox">
          {items.map((item, i) => (
            <li key={item.key} role="option" aria-selected={i === at}>
              <button type="button" data-active={i === at ? "true" : undefined} onMouseEnter={() => setAt(i)} onClick={() => choose(item)}>
                {item.key.startsWith("u-") ? <MdPerson aria-hidden="true" /> : null}
                <b className="ellipsis">{item.label}</b>
                <span className="ellipsis">{item.hint}</span>
              </button>
            </li>
          ))}
          {items.length === 0 ? <li className="dd-sub dd-empty">Nothing found</li> : null}
        </ul>
      </div>
    </div>
  );
}
