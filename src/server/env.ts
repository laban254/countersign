/**
 * Optional .env loading for local development and single-binary deployments.
 * Uses Node's built-in loader (20.12+) so no extra dependency is required.
 * Import this module before any module that reads process.env at import time.
 */
try {
  const loadEnvFile = (
    process as NodeJS.Process & { loadEnvFile?: (path?: string) => void }
  ).loadEnvFile;
  loadEnvFile?.('.env');
} catch {
  // A .env file is optional; shell/container environment variables still win.
}
