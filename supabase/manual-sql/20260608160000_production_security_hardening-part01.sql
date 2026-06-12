-- Production security hardening for Raddo.
-- This migration assumes the app uses RPCs for message writes/edits/deletes and view-once receipts.

alter table public.matches
  drop constraint if exists matches_users_pair_check;


alter table public.matches
  add constraint matches_users_pair_check
  check (cardinality(users) = 2 and users[1] <> users[2]);


alter table public.messages
  drop constraint if exists messages_message_type_check,
  drop constraint if exists messages_image_fields_check;


alter table public.messages
  add constraint messages_message_type_check
  check (message_type in ('text', 'image'));


alter table public.messages
  add constraint messages_image_fields_check
  check (
    (message_type = 'text' and image_url = '' and image_path = '' and view_once = false)
    or
    (message_type = 'image' and image_url <> '' and length(image_url) <= 2048 and length(image_path) <= 512)
  );


alter table public.map_event_messages
  drop constraint if exists map_event_messages_message_type_check,
  drop constraint if exists map_event_messages_image_fields_check;


alter table public.map_event_messages
  add constraint map_event_messages_message_type_check
  check (message_type in ('text', 'image'));


alter table public.map_event_messages
  add constraint map_event_messages_image_fields_check
  check (
    (message_type = 'text' and image_url = '' and image_path = '' and view_once = false)
    or
    (message_type = 'image' and image_url <> '' and length(image_url) <= 2048 and length(image_path) <= 512)
  );


alter table public.map_events
  drop constraint if exists map_events_description_length_check,
  drop constraint if exists map_events_cover_url_length_check,
  drop constraint if exists map_events_password_hash_check,
  drop constraint if exists map_events_lat_lng_check;


alter table public.map_events
  add constraint map_events_description_length_check check (length(description) <= 280),
  add constraint map_events_cover_url_length_check check (length(cover_url) <= 2048),
  add constraint map_events_password_hash_check check (
    (access_mode <> 'password' and password_hash = '')
    or
    (access_mode = 'password' and length(password_hash) >= 12)
  ),
  add constraint map_events_lat_lng_check check (lat between -90 and 90 and lng between -180 and 180);


alter table public.reports
  drop constraint if exists reports_reason_length_check,
  drop constraint if exists reports_recent_messages_array_check;


alter table public.reports
  add constraint reports_reason_length_check check (length(reason) <= 160),
  add constraint reports_recent_messages_array_check check (jsonb_typeof(recent_messages) = 'array' and jsonb_array_length(recent_messages) <= 20);


alter table public.image_moderation_reports
  drop constraint if exists image_moderation_reports_status_check,
  drop constraint if exists image_moderation_reports_recent_messages_array_check;


alter table public.image_moderation_reports
  add constraint image_moderation_reports_status_check
  check (status in ('pending_human_review', 'rejected', 'approved', 'removed')),
  add constraint image_moderation_reports_recent_messages_array_check
  check (jsonb_typeof(recent_messages) = 'array' and jsonb_array_length(recent_messages) <= 20);
