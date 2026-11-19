-- Migration 031: "Request update" can be sent repeatedly (no 24-hour lock).
-- One row per reminder sent, so each item knows how many it has had and the
-- email / button can say "Second reminder", "Third reminder", and so on.
CREATE TABLE IF NOT EXISTS escalation_update_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id uuid REFERENCES escalations(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  note text
);
CREATE INDEX IF NOT EXISTS escalation_update_requests_entity_idx ON escalation_update_requests (entity_id, requested_at DESC);

-- Carry over requests already sent (recorded on the escalation row itself).
INSERT INTO escalation_update_requests (escalation_id, entity_type, entity_id, requested_by, requested_at)
SELECT e.id, e.entity_type, e.entity_id, e.update_requested_by, e.update_requested_at
FROM escalations e
WHERE e.update_requested_at IS NOT NULL;
