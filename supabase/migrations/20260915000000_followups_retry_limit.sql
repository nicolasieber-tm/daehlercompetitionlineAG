-- Behebt zwei Prüfer-Befunde im Modul "followups" (Posten 6, siehe
-- docs/architektur.md, Abschnitt "Follow-ups", und CLAUDE.md, Abschnitt
-- "Follow-ups (Posten 6)"):
--
-- Befund 1 (major): lib/followups/run.ts hatte kein Limit für
-- Wiederholungsversuche. Ein dauerhaft fehlschlagender Follow-up (z.B.
-- fehlendes RESEND_API_KEY, Resend-Fehler) wurde bei jedem Cron-Lauf erneut
-- versucht, unbegrenzt, mit je einer neuen outbound_emails-Zeile
-- (status failed). follow_ups bekommt deshalb `attempts` (Zähler,
-- atomar zusammen mit dem Claim erhöht über die neue Funktion
-- claim_follow_up()) und `last_error` (letzter Fehlertext) sowie
-- `failed_at` (gesetzt, sobald der dritte Versuch fehlschlägt: endgültig
-- aufgegeben, taucht danach nie mehr in der Fällig-Abfrage auf). Eine
-- Anfrage ganz ohne E-Mail-Adresse wird von lib/followups/run.ts weiterhin
-- über cancelled_at storniert (kein Versuch, kein attempts-Verbrauch), nicht
-- über failed_at: sie kann per Definition nie erfolgreich sein, das ist kein
-- Wiederholungsfall.
--
-- Befund 2 (major): lib/followups/schedule.ts prüfte max_count nicht atomar
-- (erst zählen, dann einfügen). Zwei gleichzeitige markReplied()-Aufrufe für
-- dieselbe Anfrage (Doppelklick im Admin, zwei Tabs) konnten dadurch mehr
-- follow_ups-Zeilen je Regel anlegen als max_count erlaubt. Die Planung
-- wandert deshalb in die neue, service_role-only Funktion
-- schedule_follow_ups(): sie sperrt zu Beginn per
-- pg_advisory_xact_lock(hashtext(inquiry_id)) und prüft/inseriert danach pro
-- Regel innerhalb derselben Transaktion, wodurch ein zweiter gleichzeitiger
-- Aufruf für dieselbe Anfrage blockiert, statt parallel zu zählen.
-- ---------------------------------------------------------------------------

alter table public.follow_ups
  add column attempts integer not null default 0,
  add column last_error text,
  add column failed_at timestamptz;

comment on column public.follow_ups.attempts is
  'Anzahl bisheriger Versandversuche (atomar erhöht über claim_follow_up()). Maximal 3, danach failed_at.';
comment on column public.follow_ups.last_error is
  'Fehlertext des letzten fehlgeschlagenen Versandversuchs, zur Einsicht im Admin.';
comment on column public.follow_ups.failed_at is
  'Gesetzt, sobald der dritte Versandversuch fehlgeschlagen ist: endgültig aufgegeben, taucht nicht mehr in der Fällig-Abfrage auf. Getrennt von cancelled_at (das steht für "Antwort erhalten" bzw. einen sonst nicht mehr sinnvollen Eintrag, siehe lib/followups/run.ts), damit beide Fälle im Admin unterscheidbar bleiben.';

-- Der Fällig-Index muss failed_at mit ausschliessen, sonst würde ein
-- endgültig aufgegebener Eintrag (sent_at weiterhin null) trotzdem als
-- "fällig" gelesen.
drop index public.follow_ups_scheduled_for_idx;
create index follow_ups_scheduled_for_idx on public.follow_ups (scheduled_for)
  where sent_at is null and cancelled_at is null and failed_at is null;

-- ---------------------------------------------------------------------------
-- Funktion: schedule_follow_ups(p_inquiry_id, p_replied_at) — Befund 2.
-- Ersetzt das Zählen+Einfügen aus lib/followups/schedule.ts: sperrt die
-- Anfrage per Advisory-Lock für die Dauer der Transaktion, prüft und
-- inseriert danach pro aktiver Regel (Reihenfolge sort) atomar, sodass zwei
-- gleichzeitige Aufrufe für dieselbe Anfrage nacheinander statt parallel
-- laufen und max_count je Regel nie überschritten wird.
-- ---------------------------------------------------------------------------

create or replace function public.schedule_follow_ups(p_inquiry_id uuid, p_replied_at timestamptz)
returns setof public.follow_ups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule record;
  v_scheduled_for date;
  v_row public.follow_ups;
begin
  -- Pro Anfrage serialisieren: ein zweiter gleichzeitiger Aufruf für
  -- dieselbe p_inquiry_id wartet hier, bis die erste Transaktion committet
  -- (oder rollt zurück) und sieht danach den bereits eingefügten Stand.
  perform pg_advisory_xact_lock(hashtext(p_inquiry_id::text));

  for v_rule in
    select id, days_after_reply, max_count
    from public.follow_up_rules
    where active = true
    order by sort asc
  loop
    if (
      select count(*) from public.follow_ups
      where inquiry_id = p_inquiry_id and rule_id = v_rule.id
    ) < v_rule.max_count then
      -- Kalendertag in Europe/Zurich von p_replied_at, plus days_after_reply
      -- ganze Tage (date + integer addiert Kalendertage direkt, kein erneuter
      -- Zeitzonenbezug nötig): entspricht addDaysToZurichDate() in
      -- lib/followups/schedule.ts.
      v_scheduled_for := ((p_replied_at at time zone 'Europe/Zurich')::date) + v_rule.days_after_reply;

      insert into public.follow_ups (inquiry_id, rule_id, scheduled_for)
      values (p_inquiry_id, v_rule.id, v_scheduled_for)
      returning * into v_row;

      return next v_row;
    end if;
  end loop;
  return;
end;
$$;

comment on function public.schedule_follow_ups(uuid, timestamptz) is
  'Plant pro aktiver Regel (sort) einen follow_ups-Eintrag, max_count je Regel, race-sicher via pg_advisory_xact_lock auf die Anfrage. security definer, nur service_role (siehe lib/followups/schedule.ts, Befund 2).';

revoke execute on function public.schedule_follow_ups(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.schedule_follow_ups(uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Funktion: claim_follow_up(p_id) — Befund 1.
-- Beansprucht einen Eintrag für den Versand und erhöht attempts in
-- demselben atomaren UPDATE (kein Read-Modify-Write in der App-Schicht,
-- siehe lib/followups/run.ts). Claimt nur, wenn noch nicht gesendet, nicht
-- storniert, nicht endgültig aufgegeben (failed_at) und attempts < 3. Gibt
-- die aktualisierte Zeile zurück (leer, wenn keine dieser Bedingungen
-- zutraf), damit der Aufrufer die neue attempts-Zahl kennt, um nach einem
-- fehlgeschlagenen Versand zu entscheiden, ob es der dritte und damit
-- letzte Versuch war.
-- ---------------------------------------------------------------------------

create or replace function public.claim_follow_up(p_id uuid)
returns setof public.follow_ups
language sql
security definer
set search_path = public
as $$
  update public.follow_ups
  set sent_at = now(), attempts = attempts + 1
  where id = p_id
    and sent_at is null
    and cancelled_at is null
    and failed_at is null
    and attempts < 3
  returning *;
$$;

comment on function public.claim_follow_up(uuid) is
  'Beansprucht einen follow_ups-Eintrag für den Versand und erhöht attempts atomar im selben UPDATE (Guard: sent_at/cancelled_at/failed_at null, attempts < 3). security definer, nur service_role (siehe lib/followups/run.ts, Befund 1).';

revoke execute on function public.claim_follow_up(uuid) from public, anon, authenticated;
grant execute on function public.claim_follow_up(uuid) to service_role;
