/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as messages from "../messages.js";
import type * as presence from "../presence.js";
import type * as queue from "../queue.js";
import type * as requests from "../requests.js";
import type * as rooms from "../rooms.js";
import type * as spotify from "../spotify.js";
import type * as trackId from "../trackId.js";
import type * as validate from "../validate.js";
import type * as youtube from "../youtube.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  messages: typeof messages;
  presence: typeof presence;
  queue: typeof queue;
  requests: typeof requests;
  rooms: typeof rooms;
  spotify: typeof spotify;
  trackId: typeof trackId;
  validate: typeof validate;
  youtube: typeof youtube;
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
