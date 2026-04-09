export function getJwtSecret(): Uint8Array | null {
  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (!jwtSecret) {
    return null;
  }

  return new TextEncoder().encode(jwtSecret);
}
