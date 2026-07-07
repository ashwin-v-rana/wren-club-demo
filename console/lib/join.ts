// Supabase to-one embeds come back either as an object or a single-element
// array depending on the client version; normalise to one object (or null).
export function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export function guestNameOf(embed: unknown): string {
  const p = one(embed as { name_given?: string; name_surname?: string });
  return p ? `${p.name_given ?? ""} ${p.name_surname ?? ""}`.trim() : "Unknown";
}
