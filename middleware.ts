import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Exclude API routes, Next.js internals, auth callbacks, and static files
  // from the i18n locale-prefix middleware. /auth/* are server route handlers
  // that must be reached at their exact paths (no locale prefix).
  matcher: ["/((?!api|_next|auth|.*\\..*).*)"],
};

