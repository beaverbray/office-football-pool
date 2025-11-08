-- Check if afbp schema exists
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'afbp';

-- Check what tables exist in afbp schema
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'afbp'
ORDER BY table_name;

-- Check what's in public schema
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE'
ORDER BY table_name;
