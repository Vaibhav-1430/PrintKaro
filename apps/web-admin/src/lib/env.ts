/** Public client/runtime config for this Next.js app. */
export const env = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000',
  appEnv: process.env.NEXT_PUBLIC_APP_ENV ?? 'development',
};
