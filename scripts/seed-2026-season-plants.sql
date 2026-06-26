-- One-time data fix: seed the per-plant roster for the legacy "2026 Season" grow.
-- This grow was migrated from the old single-user plan_config, so it has a date
-- `config` but no `survey`, leaving the Plants section empty. Here we write the
-- 3 plants (1x Grandaddy Purp + 2x Strawberry Haze) into survey.strains so they
-- appear in both the Plants section and the garden map.
--
-- Idempotent: the WHERE clause only matches while the roster is still empty, so
-- running this twice will not duplicate plants. flowerWeeks/type are editable
-- in-app afterward; the calendar schedule itself comes from `config`, not these.
UPDATE grows
SET
  survey = json_object(
    'strains', json_array(
      json_object('id', 'p_gdp1',  'name', 'Grandaddy Purp',  'type', 'indica', 'photo', json('true'), 'flowerWeeks', 8,  'status', 'growing'),
      json_object('id', 'p_haze1', 'name', 'Strawberry Haze', 'type', 'sativa', 'photo', json('true'), 'flowerWeeks', 11, 'status', 'growing'),
      json_object('id', 'p_haze2', 'name', 'Strawberry Haze', 'type', 'sativa', 'photo', json('true'), 'flowerWeeks', 11, 'status', 'growing')
    )
  ),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = '1g9v3ivsmq5istnx'
  AND user_id = 1
  AND status = 'active'
  AND (survey IS NULL OR json_extract(survey, '$.strains') IS NULL);
