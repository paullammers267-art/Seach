/* Supabase-Zugang für Konto & Cloud-Sync.
   Werte aus dem Supabase-Dashboard: Project Settings → API → „Project URL“ und „anon public“-Schlüssel.
   Der anon-Schlüssel ist öffentlich gedacht – die Daten schützt Row Level Security (siehe supabase/schema.sql).
   Bleibt beides leer, kann man die Werte auch in der App unter Mehr → Konto eintragen. */
window.ALLTAGSHELD_SUPABASE = {
  url: '',
  anonKey: '',
};
