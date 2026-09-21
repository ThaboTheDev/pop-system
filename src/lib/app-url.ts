/** Only a configured origin may receive auth redirects; never trust a form's
 * next parameter, forwarded host, or arbitrary request origin. */
export function appOrigin() {
  const value = process.env.APP_URL;
  if (!value) throw new Error("APP_URL is required");
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:"))) {
    throw new Error("APP_URL must be a valid public origin (HTTPS in production)");
  }
  return url.origin;
}
