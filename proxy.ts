import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isAuthPage = createRouteMatcher([
  "/signin",
  "/signup(.*)",
  "/forgot-password",
  "/reset-password",
]);
const isProtected = createRouteMatcher([
  "/dashboard(.*)",
  "/projects(.*)",
  "/templates(.*)",
  "/admin(.*)",
]);

// Next 16's proxy convention (the middleware successor); runs on the
// Node runtime, which @convex-dev/auth's server module requires.
export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  if (isAuthPage(request) && (await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/dashboard");
  }
  if (isProtected(request) && !(await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/signin");
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
