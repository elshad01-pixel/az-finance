-- Auto-compute next_due_date for recurring expenses on INSERT
-- Matches the logic in lib/categories.ts calcNextDue (first of next period).
-- Runs even when inserting directly via API (bypassing the frontend).

CREATE OR REPLACE FUNCTION expenses_set_next_due()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_recurring AND NEW.next_due_date IS NULL AND NEW.date IS NOT NULL THEN
    NEW.next_due_date := CASE NEW.frequency
      WHEN 'monthly'   THEN date_trunc('month',   NEW.date::date + interval '1 month')::date
      WHEN 'quarterly' THEN date_trunc('quarter', NEW.date::date + interval '3 months')::date
      WHEN 'annual'    THEN (NEW.date::date + interval '1 year')::date
      ELSE NULL
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER expenses_next_due_trigger
  BEFORE INSERT ON expenses
  FOR EACH ROW EXECUTE FUNCTION expenses_set_next_due();
