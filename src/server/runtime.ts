import { join, resolve } from "node:path";
import { Auth } from "./auth";
import { BitrixClient } from "./bitrix";
import { Events } from "./events";
import { Journeys } from "./journeys";
import { AiProvider } from "./ai-provider";
import { OnboardingTrail } from "./onboarding-trail";
import { validateEnvironment } from "./security";
import { Setup } from "./setup";
import { Store } from "./store";
import { Worker } from "./worker";
export function createRuntime() {
  const env = validateEnvironment(), store = new Store(join(resolve(env.dataDir), "nexo.sqlite")), bitrix = new BitrixClient(store, env), auth = new Auth(store, env, bitrix), journeys = new Journeys(store, auth, bitrix), trails = new OnboardingTrail(store, auth, new AiProvider(env)), setup = new Setup(store, auth, bitrix, journeys), events = new Events(store, auth), worker = new Worker(store, auth, bitrix, journeys);
  return { env, store, bitrix, auth, journeys, trails, setup, events, worker };
}
let runtime: ReturnType<typeof createRuntime> | undefined;
export function getRuntime() { runtime ??= createRuntime(); return runtime; }
