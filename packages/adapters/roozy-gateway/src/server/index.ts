import type { ServerAdapterModule } from "@paperclipai/adapter-utils";
import { ADAPTER_TYPE, ADAPTER_LABEL } from "../shared/constants.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";
import { getConfigSchema } from "./config-schema.js";
import { agentConfigurationDoc, models } from "../index.js";

export function createServerAdapter(): ServerAdapterModule {
  return {
    type: ADAPTER_TYPE,
    label: ADAPTER_LABEL,
    execute,
    testEnvironment,
    models,
    agentConfigurationDoc,
    getConfigSchema,
  };
}

export { execute, testEnvironment, getConfigSchema };
