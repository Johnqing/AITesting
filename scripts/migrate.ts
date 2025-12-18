import { connectDatabase, disconnectDatabase } from '../src/db/config.js';
import { runMigrations } from '../src/db/migrate.js';

async function main() {
  try {
    await connectDatabase();
    await runMigrations();
    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
}

main();

