/** Public client/runtime config for this Next.js app. */
export const env = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://printkaro-b9r0.onrender.com',
  appEnv: process.env.NEXT_PUBLIC_APP_ENV ?? 'development',
};
