/** Arc TV logo — the round "C + play" mark (rounded tile, since the artwork has a black background) followed by "ArcTV" in white, Black weight. */
export function MangoLogo({ size = 24 }: { size?: number | string }) {
  const fontSize = typeof size === "number" ? `calc(${size} * var(--dp))` : size;
  return (
    <span className="logo" style={{ fontSize }} aria-label="Arc TV" role="img">
      <img className="logo__mark" src="/icon-512.png" alt="" aria-hidden="true" draggable={false} />
      <span aria-hidden="true">ArcTV</span>
    </span>
  );
}
