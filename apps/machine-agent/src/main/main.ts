import { app, Tray, Menu, nativeImage, type MenuItemConstructorOptions } from 'electron';
import { bootstrapAgent } from '../bootstrap';
import type { AgentState } from '../agent';
import type { BootstrappedAgent } from '../bootstrap';

/**
 * Electron main process: runs the agent headless in the background with a
 * system-tray icon for status + control. Single-instance, auto-start on login,
 * no visible window (it's a kiosk daemon).
 *
 * On Raspberry Pi this file is replaced by a thin systemd entry that calls the
 * same bootstrapAgent() — the agent core is untouched.
 */

let tray: Tray | null = null;
let bootstrapped: BootstrappedAgent | null = null;
let currentState: AgentState = 'stopped';

const STATE_LABEL: Record<AgentState, string> = {
  stopped: 'Stopped',
  connecting: 'Connecting…',
  online: 'Online',
  reconnecting: 'Reconnecting…',
};

function buildMenu(): Menu {
  const machineCode = bootstrapped?.config.machineId ?? 'unknown';
  const template: MenuItemConstructorOptions[] = [
    { label: `Print Karo Machine`, enabled: false },
    { label: `Status: ${STATE_LABEL[currentState]}`, enabled: false },
    { label: `Machine: ${machineCode}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Restart agent',
      click: () => {
        void restartAgent();
      },
    },
    {
      label: 'Quit',
      click: () => {
        void quit();
      },
    },
  ];
  return Menu.buildFromTemplate(template);
}

function refreshTray(): void {
  if (!tray) return;
  tray.setToolTip(`Print Karo — ${STATE_LABEL[currentState]}`);
  tray.setContextMenu(buildMenu());
}

async function startAgent(): Promise<void> {
  bootstrapped = bootstrapAgent(process.env, (state) => {
    currentState = state;
    refreshTray();
  });
  await bootstrapped.agent.start();
}

async function restartAgent(): Promise<void> {
  if (bootstrapped) await bootstrapped.agent.stop();
  await startAgent();
}

async function quit(): Promise<void> {
  if (bootstrapped) await bootstrapped.agent.stop();
  app.quit();
}

function createTray(): void {
  // Minimal 1x1 transparent icon; production ships a real asset.
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  refreshTray();
}

// Single instance only.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('ready', () => {
    // Run in background: no dock icon on macOS, no window anywhere.
    app.dock?.hide();
    // Launch on login (auto-start).
    app.setLoginItemSettings({ openAtLogin: true });
    createTray();
    void startAgent();
  });

  // Keep running with no windows (it's a background daemon).
  app.on('window-all-closed', () => {
    // Intentionally do not quit — the agent lives in the tray.
  });

  app.on('before-quit', () => {
    if (bootstrapped) void bootstrapped.agent.stop();
  });
}
