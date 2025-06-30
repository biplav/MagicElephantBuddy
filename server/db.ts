import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// CockroachDB connection string
const COCKROACH_DB_URL = 'postgresql://biplav:LTZ95Qg4fWSYtJ6saL7nrg@exotic-crane-12796.j77.aws-ap-south-1.cockroachlabs.cloud:26257/defaultdb?sslmode=require';

// Ensure all database operations use CockroachDB
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('cockroachlabs.cloud')) {
  console.log('Configuring CockroachDB as the primary database...');
  process.env.DATABASE_URL = COCKROACH_DB_URL;
}

export const pool = new Pool({ 
  connectionString: COCKROACH_DB_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export const db = drizzle(pool, { schema });