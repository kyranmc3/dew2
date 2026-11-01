-- When the event was last edited in Notion. Its closest thing to "when was the price last checked".
alter table public.events add column notion_edited_at timestamptz;
