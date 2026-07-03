/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as brandDna from "../brandDna.js";
import type * as generation from "../generation.js";
import type * as generationWorker from "../generationWorker.js";
import type * as http from "../http.js";
import type * as images from "../images.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_prompts from "../lib/prompts.js";
import type * as passwordReset from "../passwordReset.js";
import type * as plans from "../plans.js";
import type * as productImages from "../productImages.js";
import type * as projects from "../projects.js";
import type * as promptGen from "../promptGen.js";
import type * as prompts from "../prompts.js";
import type * as research from "../research.js";
import type * as signupLinks from "../signupLinks.js";
import type * as templates from "../templates.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  brandDna: typeof brandDna;
  generation: typeof generation;
  generationWorker: typeof generationWorker;
  http: typeof http;
  images: typeof images;
  "lib/access": typeof lib_access;
  "lib/prompts": typeof lib_prompts;
  passwordReset: typeof passwordReset;
  plans: typeof plans;
  productImages: typeof productImages;
  projects: typeof projects;
  promptGen: typeof promptGen;
  prompts: typeof prompts;
  research: typeof research;
  signupLinks: typeof signupLinks;
  templates: typeof templates;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
