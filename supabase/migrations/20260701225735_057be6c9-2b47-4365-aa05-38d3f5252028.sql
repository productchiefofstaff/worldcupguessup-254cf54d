
SELECT cron.schedule(
  'refresh-cs-odds',
  '17 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--1abd5d8a-28e8-4c2a-8f87-104d70a651ad.lovable.app/api/public/hooks/refresh-cs-odds',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
