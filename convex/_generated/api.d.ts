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
import type * as board from "../board.js";
import type * as calendar from "../calendar.js";
import type * as dates from "../dates.js";
import type * as domain from "../domain.js";
import type * as holidaysData from "../holidaysData.js";
import type * as http from "../http.js";
import type * as items from "../items.js";
import type * as lib from "../lib.js";
import type * as team from "../team.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  board: typeof board;
  calendar: typeof calendar;
  dates: typeof dates;
  domain: typeof domain;
  holidaysData: typeof holidaysData;
  http: typeof http;
  items: typeof items;
  lib: typeof lib;
  team: typeof team;
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
