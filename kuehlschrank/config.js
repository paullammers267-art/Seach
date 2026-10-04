/* Supabase-Zugang für Konto & Cloud-Sync.
   Werte aus dem Supabase-Dashboard: Project Settings → API → „Project URL“ und „anon public“-Schlüssel.
   Der anon-Schlüssel ist öffentlich gedacht – die Daten schützt Row Level Security (siehe supabase/schema.sql).
   Bleibt beides leer, kann man die Werte auch in der App unter Mehr → Konto eintragen. */
window.ALLTAGSHELD_SUPABASE = {
  url: 'https://mthtdwahlhxmtczczvbn.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10aHRkd2FobGh4bXRjemN6dmJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMjI2OTYsImV4cCI6MjEwNjY5ODY5Nn0.OYC3B1Tm187Vu5XFkpuYzqhrktzQlgHv-2yKbOPNhvQ',
};
