import { ConvexError } from "convex/values";

/** Extracts a human-readable message from a Convex client error. */
export function errorMessage(
  error: unknown,
  fallback = "Something went wrong.",
): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  if (error instanceof Error) {
    const match = error.message.match(
      /Uncaught (?:ConvexError|Error):\s*([^\n]+)/,
    );
    if (match) return match[1].trim();
  }
  return fallback;
}
