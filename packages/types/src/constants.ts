/**
 * Shared constants used across apps. Business-rule values that the
 * architecture docs define live here so FE/BE/agent agree on one source.
 */
export const APP_NAME = 'Print Karo';
export const APP_TAGLINE = 'Upload. Pay. Print Anywhere.';

/** Default local dev ports for the workspaces. */
export const DEV_PORTS = {
  API: 4000,
  WEB_CUSTOMER: 3000,
  WEB_ADMIN: 3001,
  WEB_MACHINE: 3002,
} as const;
