-- Plant photos: journal photos can belong to one plant. The worker also
-- self-heals this column on first use - see worker/photos.js.
ALTER TABLE journal_photos ADD COLUMN plant_id TEXT;
