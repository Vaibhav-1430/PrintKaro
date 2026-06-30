import { bootstrapAgent } from './bootstrap';

/**
 * Headless entrypoint for non-Electron hosts (Raspberry Pi / systemd, Docker).
 * Proves the agent core is fully decoupled from Electron — same bootstrap, same
 * protocol, different process manager.
 */
async function main(): Promise<void> {
  const { agent, logger } = bootstrapAgent(process.env, (state) => {
    // eslint-disable-next-line no-console
    console.log(`[agent] state=${state}`);
  });

  const shutdown = async (): Promise<void> => {
    await agent.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  logger.log('RECONNECT', 'INFO', 'Headless agent starting');
  await agent.start();
}

void main();
