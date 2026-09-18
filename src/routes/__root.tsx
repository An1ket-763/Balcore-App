import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  redirect,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ACCESS_ROUTE, NEXT_PARAM, decideAccess } from "@/lib/accessGate";
import { verifyAccess } from "@/lib/accessGate.server";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  /**
   * THE ACCESS GATE.
   *
   * Runs on the root route, so it covers every path in the app including ones
   * added later — a per-route guard would have to be remembered each time.
   *
   * On the server this executes during SSR, before any child route renders, so
   * an unauthenticated visitor is redirected without ever receiving app markup.
   * On the client it runs again for each navigation, where `verifyAccess`
   * becomes an RPC call rather than a local check — the cookie is HttpOnly, so
   * the browser cannot inspect it and the answer has to come from the server
   * either way.
   *
   * This sits IN FRONT OF Privy and knows nothing about it. Past the gate, the
   * wallet sign-in behaves exactly as it did before.
   */
  beforeLoad: async ({ location }) => {
    const decision = await decideAccess(location.pathname, location.href, () => verifyAccess());
    if (decision.allow) return;
    throw redirect({
      to: ACCESS_ROUTE,
      search: { [NEXT_PARAM]: decision.next },
      // A gate bounce is not a page the user chose; it should not sit in
      // history where Back would land them on it after they are let in.
      replace: true,
    });
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Balcore" },
      {
        name: "description",
        content:
          "Balcore: provide liquidity, earn fees, and track your market-making positions on Avalanche.",
      },
      { name: "author", content: "Balcore" },
      { name: "application-name", content: "Balcore" },
      { name: "apple-mobile-web-app-title", content: "Balcore" },
      { property: "og:site_name", content: "Balcore" },
      { property: "og:title", content: "Balcore" },
      {
        property: "og:description",
        content:
          "Balcore: provide liquidity, earn fees, and track your market-making positions on Avalanche.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
