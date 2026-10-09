-- Storage: a private bucket for explanation videos and a public bucket for question diagrams.
--
-- videos   PRIVATE. Only teachers/admins can read, upload, replace or delete objects. Students never get a direct
--          path: the API checks entitlement and the finished tutor session, then hands out a short-lived signed URL.
-- diagrams PUBLIC read (students need the picture during the test). Staff-only writes. Object names are random UUIDs
--          so draft diagrams are not guessable.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('videos', 'videos', false, 209715200, array['video/mp4']),
  ('diagrams', 'diagrams', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy videos_staff_all on storage.objects for all to authenticated
  using (bucket_id = 'videos' and private.is_staff())
  with check (bucket_id = 'videos' and private.is_staff());

create policy diagrams_staff_write on storage.objects for all to authenticated
  using (bucket_id = 'diagrams' and private.is_staff())
  with check (bucket_id = 'diagrams' and private.is_staff());
-- Public bucket objects are served without a policy; the policy below also lets signed-in users list them via the API.
create policy diagrams_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'diagrams');
