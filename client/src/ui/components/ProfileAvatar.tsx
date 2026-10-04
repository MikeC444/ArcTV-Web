import { avatarById } from "../../domain/profiles";

/** A profile's picture. `size` is the tile's side (a CSS length). */
export function ProfileAvatar({ avatar, size = "100%", label }: { avatar: string; size?: string; label?: string }) {
  const { src } = avatarById(avatar);
  return (
    <span className="pavatar" style={{ width: size, height: size }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <img className="pavatar__img" src={src} alt="" draggable={false} />
    </span>
  );
}
