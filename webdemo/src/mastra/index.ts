import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { weatherWorkflow } from './workflows';
import { cadUnfoldTestWorkflow } from './workflows/test';
import { supabaseTestWorkflow } from './workflows/supabaseTest';
import { weatherAgent } from './agents';
import { LibSQLStore } from "@mastra/libsql";

export const mastra = new Mastra({
  workflows: { weatherWorkflow, cadUnfoldTestWorkflow, supabaseTestWorkflow },
  agents: { weatherAgent },
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  storage: new LibSQLStore({
    url: "file:./mastra.db",
  }),
});