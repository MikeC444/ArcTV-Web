/** MangoLogo.kt — "ARC" in white, "TV" in the brand gradient, both Black weight. */
export function MangoLogo({ size = 24 }: { size?: number | string }) {
  const fontSize = typeof size === "number" ? `calc(${size} * var(--dp))` : size;
  return (
    <span className="logo" style={{ fontSize }} aria-label="Arc TV" role="img">
      <span aria-hidden="true">ARC</span>
      <span className="logo__tv" aria-hidden="true">
        TV
      </span>
    </span>
  );
}
