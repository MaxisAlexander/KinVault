/** Only allow same-origin relative paths as post-login destinations. */
export function safeRedirect(path: unknown, fallback = "/dashboard"): string {
  if (typeof path !== "string") return fallback;
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return fallback;
  if (path.startsWith("/auth")) return fallback;
  return path;
}

export const INVITE_KEY = "kinvault:invite";
