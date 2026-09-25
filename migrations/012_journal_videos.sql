-- Journal videos: clips attached to a day's journal page, alongside photos.
--
-- A video shares the photos table so every surface that lists a day's pictures
-- (the journal, a plant's timeline, the share link, MJ, the rundown) lists its
-- videos with them, in the order they were added. The file itself lives in R2
-- under `r2_key`; `thumb` holds its poster frame and `data` stays empty.
--
-- Every existing row is a photo, which is what the default says. The worker
-- also self-heals these columns on first use - see worker/photos.js.
ALTER TABLE journal_photos ADD COLUMN kind TEXT NOT NULL DEFAULT 'photo';
ALTER TABLE journal_photos ADD COLUMN r2_key TEXT;
ALTER TABLE journal_photos ADD COLUMN mime TEXT;
ALTER TABLE journal_photos ADD COLUMN size_bytes INTEGER;
ALTER TABLE journal_photos ADD COLUMN duration_ms INTEGER;
