-- Photos taken inside the app are not in the phone's camera roll, so the
-- viewer offers a one-tap save. The worker also self-heals this column on
-- first use - see worker/photos.js.
ALTER TABLE journal_photos ADD COLUMN from_camera INTEGER NOT NULL DEFAULT 0;
