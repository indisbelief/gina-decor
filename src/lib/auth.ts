const COOKIE_NAME = "gd_auth";

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function expectedToken(): Promise<string> {
  return sha256(`gina-decor:${process.env.APP_PASSWORD}`);
}

export async function isValidToken(token: string | undefined): Promise<boolean> {
  if (!token || !process.env.APP_PASSWORD) return false;
  return token === (await expectedToken());
}

export { COOKIE_NAME };
