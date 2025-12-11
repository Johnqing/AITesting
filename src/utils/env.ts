import dotenv from 'dotenv';

dotenv.config();

export function validateEnv(): void {
  const required = ['API_KEY', 'BASE_URL', 'DEFAULT_MODEL'];
  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}\nPlease create a .env file with the required variables.`);
  }
}

