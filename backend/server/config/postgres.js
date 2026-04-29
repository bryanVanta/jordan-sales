const { Pool } = require('pg');
require('dotenv').config();

const POSTGRES_ENABLED = String(process.env.POSTGRES_ENABLED || '').trim() === '1';

const getPostgresConfig = () => {
  const connectionString = String(process.env.POSTGRES_URL || process.env.DATABASE_URL || '').trim();
  if (connectionString) {
    return {
      connectionString,
      ssl: String(process.env.POSTGRES_SSL || '').trim() === '1' ? { rejectUnauthorized: false } : false,
    };
  }

  return {
    host: String(process.env.POSTGRES_HOST || 'localhost').trim(),
    port: Number(process.env.POSTGRES_PORT || 5432),
    database: String(process.env.POSTGRES_DATABASE || '').trim(),
    user: String(process.env.POSTGRES_USER || '').trim(),
    password: String(process.env.POSTGRES_PASSWORD || '').trim(),
    ssl: String(process.env.POSTGRES_SSL || '').trim() === '1' ? { rejectUnauthorized: false } : false,
  };
};

const hasPostgresConfig = () => {
  if (!POSTGRES_ENABLED) return false;
  if (String(process.env.POSTGRES_URL || process.env.DATABASE_URL || '').trim()) return true;
  return Boolean(
    String(process.env.POSTGRES_DATABASE || '').trim() &&
      String(process.env.POSTGRES_USER || '').trim() &&
      String(process.env.POSTGRES_PASSWORD || '').trim()
  );
};

let pool = null;

const getPostgresPool = () => {
  if (!hasPostgresConfig()) return null;
  if (!pool) {
    pool = new Pool({
      ...getPostgresConfig(),
      max: Number(process.env.POSTGRES_POOL_MAX || 10),
      idleTimeoutMillis: Number(process.env.POSTGRES_IDLE_TIMEOUT_MS || 30000),
      connectionTimeoutMillis: Number(process.env.POSTGRES_CONNECT_TIMEOUT_MS || 5000),
    });
  }
  return pool;
};

const query = async (text, params = []) => {
  const activePool = getPostgresPool();
  if (!activePool) {
    throw new Error('PostgreSQL is not configured. Set POSTGRES_ENABLED=1 and fill backend/.env values.');
  }
  return activePool.query(text, params);
};

const testPostgresConnection = async () => {
  if (!hasPostgresConfig()) {
    return {
      configured: false,
      ok: false,
      message: 'PostgreSQL disabled or missing env values',
    };
  }

  const startedAt = Date.now();
  const result = await query('select current_database() as database, current_user as user, version() as version');
  const row = result.rows[0] || {};
  return {
    configured: true,
    ok: true,
    database: row.database,
    user: row.user,
    version: row.version,
    latencyMs: Date.now() - startedAt,
  };
};

module.exports = {
  getPostgresPool,
  query,
  testPostgresConnection,
  hasPostgresConfig,
};
