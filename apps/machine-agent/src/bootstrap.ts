import { loadConfig, type AgentConfig } from './config';
import { createPrinterPort } from './printer/printer.factory';
import { SystemMetricsCollector } from './system/metrics';
import { NetworkChecker } from './system/network';
import { HeartbeatBuilder } from './heartbeat-builder';
import { MachineApiClient } from './api-client';
import { AgentLogger } from './logger';
import { PrintRunner } from './print-runner';
import { MachineAgent, type AgentStatusListener } from './agent';

export interface BootstrappedAgent {
  agent: MachineAgent;
  logger: AgentLogger;
  config: AgentConfig;
}

/**
 * Composition root — assembles the agent from its parts. Kept free of Electron
 * so it can be driven by the Electron main process, a systemd service (Pi), or
 * a test harness.
 */
export function bootstrapAgent(
  env: NodeJS.ProcessEnv = process.env,
  onStatus?: AgentStatusListener,
): BootstrappedAgent {
  const config = loadConfig(env);
  const logger = new AgentLogger();

  const printer = createPrinterPort(env);
  const builder = new HeartbeatBuilder(printer, new SystemMetricsCollector(), new NetworkChecker());
  const api = new MachineApiClient(config.apiBaseUrl, config.machineId, config.machineSecret);
  const printRunner = new PrintRunner(printer);

  const agent = new MachineAgent(config, api, builder, logger, printRunner, onStatus);
  return { agent, logger, config };
}
