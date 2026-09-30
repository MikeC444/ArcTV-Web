/** MangoLogo.kt — "MANGO" in white, "TV" in the brand gradient, both Black weight. */
export function MangoLogo({ size = 24 }: { size?: number | string }) {
  const fontSize = typeof size === "number" ? `calc(${size} * var(--dp))` : size;
  return (
    <span className="logo" style={{ fontSize }} aria-label="Mango TV" role="img">
      <span aria-hidden="true">MANGO</span>
      <span className="logo__tv" aria-hidden="true">
        TV
      </span>
    </span>
  );
}
