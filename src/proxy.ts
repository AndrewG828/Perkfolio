import { NextResponse, type NextRequest } from "next/server";

/**
 * The site used to live at credit-card-hacking.vercel.app. Browsers keep localStorage per address, so wallets
 * saved there aren't visible on the new domain. Requests to the old host get the /move page, which hands the
 * saved wallet to the new domain (in the URL fragment, never sent to a server) and then redirects.
 */
const OLD_HOSTS = new Set(["credit-card-hacking.vercel.app"]);

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (!OLD_HOSTS.has(host)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/move";
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip Next internals and static files so the /move page itself can load.
  matcher: ["/((?!_next/|api/|cards/|icon\\.svg|favicon\\.ico).*)"],
};
