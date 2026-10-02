import { avatarById } from "../../domain/profiles";

/** A profile's picture: a coloured tile with its glyph. `size` is the tile's side (a CSS length). */
export function ProfileAvatar({ avatar, size = "100%", label }: { avatar: string; size?: string; label?: string }) {
  const { from, to, glyph } = avatarById(avatar);
  return (
    <span className="pavatar" style={{ width: size, height: size, background: `linear-gradient(145deg, ${from}, ${to})` }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <span className="pavatar__glyph">{glyph}</span>
    </span>
  );
}
