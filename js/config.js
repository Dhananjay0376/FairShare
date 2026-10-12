/* FairShare config — Supabase project credentials.
   The anon key is PUBLIC by design (it ships inside every Supabase
   client app). Real security comes from the Row Level Security
   policies in schema.sql. Never put the service_role key here. */
window.FAIRSHARE_CONFIG = {
  SUPABASE_URL: 'https://ijbarnhnzpwqxjfyknuv.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqYmFybmhuenB3cXhqZnlrbnV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3Nzk3MDAsImV4cCI6MjEwNzM1NTcwMH0.9ZbMuld6C1FAwFIlQqZyPzC0eV-vgDCM8UC3LqaSdbQ',
  APP_NAME: 'FairShare'
};
