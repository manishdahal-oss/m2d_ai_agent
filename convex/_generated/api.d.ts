/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai_agent from "../ai/agent.js";
import type * as ai_nvidia from "../ai/nvidia.js";
import type * as ai_provider from "../ai/provider.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as campaignRun from "../campaignRun.js";
import type * as campaigns from "../campaigns.js";
import type * as cleanup from "../cleanup.js";
import type * as conversations from "../conversations.js";
import type * as customers from "../customers.js";
import type * as demo from "../demo.js";
import type * as engine from "../engine.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_config from "../lib/config.js";
import type * as lib_demoFixtures from "../lib/demoFixtures.js";
import type * as lib_denormalize from "../lib/denormalize.js";
import type * as lib_validators from "../lib/validators.js";
import type * as maintenance from "../maintenance.js";
import type * as settings from "../settings.js";
import type * as users from "../users.js";
import type * as whatsapp_index from "../whatsapp/index.js";
import type * as whatsapp_mock from "../whatsapp/mock.js";
import type * as whatsapp_provider from "../whatsapp/provider.js";
import type * as whatsapp_testSend from "../whatsapp/testSend.js";
import type * as whatsapp_times from "../whatsapp/times.js";
import type * as whatsapp_webhook from "../whatsapp/webhook.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "ai/agent": typeof ai_agent;
  "ai/nvidia": typeof ai_nvidia;
  "ai/provider": typeof ai_provider;
  analytics: typeof analytics;
  auth: typeof auth;
  campaignRun: typeof campaignRun;
  campaigns: typeof campaigns;
  cleanup: typeof cleanup;
  conversations: typeof conversations;
  customers: typeof customers;
  demo: typeof demo;
  engine: typeof engine;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/config": typeof lib_config;
  "lib/demoFixtures": typeof lib_demoFixtures;
  "lib/denormalize": typeof lib_denormalize;
  "lib/validators": typeof lib_validators;
  maintenance: typeof maintenance;
  settings: typeof settings;
  users: typeof users;
  "whatsapp/index": typeof whatsapp_index;
  "whatsapp/mock": typeof whatsapp_mock;
  "whatsapp/provider": typeof whatsapp_provider;
  "whatsapp/testSend": typeof whatsapp_testSend;
  "whatsapp/times": typeof whatsapp_times;
  "whatsapp/webhook": typeof whatsapp_webhook;
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
