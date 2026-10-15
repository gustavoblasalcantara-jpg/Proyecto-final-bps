import { neon } from 'https://esm.sh/@neondatabase/serverless';

// Conexión oficial a tu base de datos en Neon
const DATABASE_URL = 'postgresql://neondb_owner:npg_gAWYfwn7u9cV@ep-tiny-pond-b482qkb9-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

export const sql = neon(DATABASE_URL);