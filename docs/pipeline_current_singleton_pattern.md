# Pipeline Current Singleton Pattern Documentation

## Overview

The `afbp.pipeline_current` table implements a **singleton pattern** to store the current pipeline analysis state. This document explains the pattern, its trade-offs, and potential alternatives.

## Current Implementation

**Location**: `supabase/migrations/006_create_current_pipeline.sql` (moved to afbp schema in migration 009)

**Table Structure**:
```sql
CREATE TABLE afbp.pipeline_current (
    id TEXT PRIMARY KEY,
    pipeline_data JSONB NOT NULL,
    picksheet_text TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT single_row_check CHECK (id = 'current')
);
```

**Key Features**:
- Primary key: `id TEXT` (always set to 'current')
- Singleton enforcement: `CHECK (id = 'current')` constraint
- Single row guarantee: Only one row with id='current' can exist
- In-place updates: Each pipeline run updates the same row

## Singleton Pattern Mechanics

### How It Works

1. **Single Row Guarantee**: The CHECK constraint ensures `id = 'current'`
2. **Upsert Operation**: Application uses UPSERT to replace the row:
   ```sql
   INSERT INTO afbp.pipeline_current (id, pipeline_data, picksheet_text)
   VALUES ('current', $1, $2)
   ON CONFLICT (id) DO UPDATE
   SET pipeline_data = EXCLUDED.pipeline_data,
       picksheet_text = EXCLUDED.picksheet_text,
       updated_at = NOW();
   ```
3. **Simple Queries**: No WHERE clause needed: `SELECT * FROM afbp.pipeline_current`

### RLS Policies

**Current Policy** (migration 011):
```sql
CREATE POLICY "Allow all operations on pipeline_current"
  ON afbp.pipeline_current
  FOR ALL
  TO anon, authenticated
  USING (id = 'current')
  WITH CHECK (id = 'current');
```

**Access Control**:
- Anonymous users: Full access (SELECT, INSERT, UPDATE, DELETE)
- Authenticated users: Full access
- Service role: Full access

**Security Note**: This is intentionally permissive because:
- Only one row exists
- Application controls the content
- Public read access is desired for current state
- Write access allows pipeline updates

## Pros and Cons

### ✅ Advantages

1. **Simplicity**: No complex queries or row selection logic
2. **Performance**: Single row lookup is extremely fast
3. **Atomic Updates**: UPSERT guarantees consistency
4. **Space Efficient**: No historical data accumulation
5. **Clear Intent**: Explicitly models "current state" concept

### ⚠️ Disadvantages

1. **No History**: Previous states are lost on each update
2. **Fragile Pattern**: CHECK constraint can be confusing
3. **Migration Complexity**: Special handling during schema changes
4. **Testing Challenges**: Can't easily test parallel states
5. **Audit Trail**: No record of when/why state changed

## Alternative Approaches

### Alternative 1: Boolean Flag Pattern

**More Robust Singleton**:
```sql
CREATE TABLE afbp.pipeline_current (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pipeline_data JSONB NOT NULL,
    picksheet_text TEXT,
    is_current BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Partial unique index ensures only one is_current=true
CREATE UNIQUE INDEX idx_pipeline_current_singleton
  ON afbp.pipeline_current (is_current)
  WHERE is_current = true;
```

**Advantages**:
- Allows historical rows with `is_current = false`
- More flexible for future audit trail
- Standard PostgreSQL pattern

**Migration Path**: See migration template below

### Alternative 2: Separate History Table

**Keep Current + Add History**:
```sql
-- Current state (singleton as-is)
CREATE TABLE afbp.pipeline_current (...);

-- Historical snapshots
CREATE TABLE afbp.pipeline_history (
    id UUID PRIMARY KEY,
    pipeline_data JSONB NOT NULL,
    picksheet_text TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    metadata JSONB
);
```

**Advantages**:
- Preserves current singleton simplicity
- Adds audit trail capability
- No changes to current application code

### Alternative 3: Versioned Rows

**Full Historical Tracking**:
```sql
CREATE TABLE afbp.pipeline_states (
    id UUID PRIMARY KEY,
    version INTEGER NOT NULL,
    pipeline_data JSONB NOT NULL,
    picksheet_text TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    created_by TEXT,
    metadata JSONB
);

CREATE UNIQUE INDEX idx_latest_version
  ON afbp.pipeline_states (version DESC)
  LIMIT 1;
```

**Advantages**:
- Complete audit trail
- Version rollback capability
- Better testing/debugging

**Disadvantages**:
- More complex queries
- Storage overhead
- Application code changes required

## Recommendations

### Short Term (Current - 6 months)

**Status**: ✅ **Keep Current Singleton Pattern**

**Rationale**:
- Production system is stable
- Pattern is working as designed
- No immediate business need for history
- Changing pattern introduces risk

**Action Items**:
1. ✅ Document pattern (this file)
2. ✅ Add comments to schema
3. Monitor for issues

### Medium Term (6-12 months)

**Consider**: **Alternative 2 (Separate History Table)**

**If**:
- Need audit trail for compliance
- Want to analyze pipeline changes over time
- Need debugging/rollback capability

**Migration Path**:
1. Create `afbp.pipeline_history` table
2. Add trigger to archive current state on update
3. Keep current singleton pattern intact
4. Zero application code changes

### Long Term (12+ months)

**Consider**: **Alternative 1 (Boolean Flag Pattern)**

**If**:
- Multiple users creating parallel pipelines
- Need comprehensive version control
- Want standard PostgreSQL patterns

**Migration Path**: See template below

## Migration Template (Future)

**If migrating to Boolean Flag Pattern**:

```sql
-- Migration: XXX_refactor_pipeline_current_to_boolean_flag.sql

BEGIN;

-- 1. Add is_current column
ALTER TABLE afbp.pipeline_current
  ADD COLUMN is_current BOOLEAN NOT NULL DEFAULT true;

-- 2. Drop old singleton constraint
ALTER TABLE afbp.pipeline_current
  DROP CONSTRAINT single_row_check;

-- 3. Change id to UUID
ALTER TABLE afbp.pipeline_current
  ALTER COLUMN id TYPE UUID USING uuid_generate_v4(),
  ALTER COLUMN id SET DEFAULT uuid_generate_v4();

-- 4. Create partial unique index
CREATE UNIQUE INDEX idx_pipeline_current_singleton
  ON afbp.pipeline_current (is_current)
  WHERE is_current = true;

-- 5. Update RLS policies
DROP POLICY IF EXISTS "Allow all operations on pipeline_current" ON afbp.pipeline_current;

CREATE POLICY "Allow read current pipeline"
  ON afbp.pipeline_current
  FOR SELECT
  TO anon, authenticated
  USING (is_current = true);

CREATE POLICY "Allow update current pipeline"
  ON afbp.pipeline_current
  FOR UPDATE
  TO authenticated
  USING (is_current = true)
  WITH CHECK (is_current = true);

COMMIT;
```

## Security Considerations

### Current Security Posture

**RLS Policy Analysis**:
- ✅ Anonymous read access: Appropriate for public dashboard
- ⚠️ Anonymous write access: Acceptable because:
  - Application controls content via API
  - Only single row affected
  - No sensitive data stored
  - Pipeline data is public-facing

**Risk Assessment**: **LOW**
- Data loss risk: Minimal (pipeline can be regenerated)
- Data corruption risk: Low (application validates before write)
- Unauthorized access risk: None (data is public)

### Future Security Enhancements

**If adding history table**:
1. Restrict DELETE operations
2. Add created_by tracking
3. Implement soft deletes
4. Add row-level timestamps

**If requiring authentication**:
1. Change RLS to require `authenticated` role
2. Add API key validation
3. Implement rate limiting
4. Add audit logging

## Monitoring and Maintenance

### Key Metrics to Track

1. **Update Frequency**: How often is current state replaced?
2. **Data Size**: Is pipeline_data JSONB growing unbounded?
3. **Query Performance**: Is single-row lookup still fast?
4. **RLS Policy Hits**: Are policies being applied correctly?

### Health Checks

```sql
-- Verify singleton constraint
SELECT COUNT(*) as row_count
FROM afbp.pipeline_current;
-- Expected: 1

-- Check data freshness
SELECT id, updated_at,
       NOW() - updated_at as age
FROM afbp.pipeline_current;
-- Expected: Recent timestamp

-- Verify RLS policies
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'pipeline_current'
  AND schemaname = 'afbp';
-- Expected: Single "Allow all operations" policy
```

## References

- **Creation Migration**: `supabase/migrations/006_create_current_pipeline.sql`
- **Schema Move**: `supabase/migrations/009_afbp_schema_migration.sql`
- **RLS Simplification**: `supabase/migrations/011_simplify_pipeline_current_rls.sql`
- **Task 1 Design Review**: `.taskmaster/reports/task-complexity-report.json`

## Conclusion

The current singleton pattern is **appropriate for the use case** and should be maintained in the short term. The pattern is simple, performant, and aligns with the application's need for a single "current state" representation.

**Future enhancements** should focus on adding historical tracking via a separate table rather than replacing the singleton pattern, preserving current simplicity while gaining audit trail capabilities.

**Last Updated**: 2025-11-15
**Status**: ✅ Documented, No Changes Required
