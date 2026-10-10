/** Arc TV logo — the transparent mark + "ArcTV" wordmark image; `size` sets the text-size the image height is based on. */
export function ArcLogo({ size = 24 }: { size?: number | string }) {
  const fontSize = typeof size === "number" ? `calc(${size} * var(--dp))` : size;
  return (
    <span className="logo" style={{ fontSize }}>
      <img className="logo__img" src="/arctv-logo.png" alt="Arc TV" draggable={false} />
    </span>
  );
}
