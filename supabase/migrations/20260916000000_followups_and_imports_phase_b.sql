-- Behebt drei Prüfer-Befunde aus der Phase-B-Prüfung des Backends:
--
-- Befund 1 (lib/followups/run.ts): claim_follow_up() erzwang das
-- Versuchslimit bisher hart codiert ("attempts < 3"), während
-- lib/followups/run.ts dieselbe Zahl als TS-Konstante MAX_FOLLOW_UP_ATTEMPTS
-- pflegt (supabase/migrations/20260915000000_followups_retry_limit.sql).
-- Zwei Quellen für dasselbe Limit laufen bei einer künftigen Änderung
-- leicht auseinander. claim_follow_up() bekommt deshalb einen Parameter
-- p_max_attempts; die App übergibt MAX_FOLLOW_UP_ATTEMPTS bei jedem Aufruf
-- (siehe lib/followups/run.ts claimFollowUp()), das TS-Modul bleibt die
-- einzige Quelle für den konkreten Wert. Ein Default (3) bleibt für
-- direkte SQL-Aufrufe ausserhalb der App bestehen.
--
-- Befund 2 (lib/followups/schedule.ts): schedule_follow_ups() prüfte pro
-- Regel nur die GESAMTZAHL bisheriger Einträge gegen max_count, nicht ob
-- bereits ein OFFENER Eintrag (sent_at/cancelled_at/failed_at alle null)
-- existiert. Ein zweiter markReplied()-Aufruf für dieselbe Anfrage (z.B.
-- Antwort im Admin nochmals gesendet, bevor der erste Follow-up fällig
-- war) konnte dadurch, solange max_count noch nicht erreicht war, eine
-- zweite, parallele Planung derselben Regel anlegen. Ein bereits offener
-- Eintrag je Regel und Anfrage wird jetzt übersprungen statt dupliziert.
--
-- Befund 3 (lib/pricelist/imports.ts): applyPendingImport() markierte
-- einen Import immer als "applied", auch wenn applyImport() für einzelne
-- Familien Fehler gesammelt hatte (ApplyResult.errors). pricelist_imports
-- bekommt den Status "failed" (Fehler beim Übernehmen, Diff blieb
-- teilweise oder ganz unangewendet; siehe lib/pricelist/imports.ts).
-- ---------------------------------------------------------------------------

alter table public.pricelist_imports
  drop constraint pricelist_imports_status_check,
  add constraint pricelist_imports_status_check
    check (status in ('pending', 'applied', 'discarded', 'failed'));

comment on table public.pricelist_imports is
  'Ein Excel-Upload im Admin. pending = Diff angezeigt, applied = übernommen, discarded = verworfen, failed = beim Übernehmen sind Fehler aufgetreten (siehe summary.errors).';

create or replace function public.claim_follow_up(p_id uuid, p_max_attempts integer default 3)
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
    and attempts < p_max_attempts
  returning *;
$$;

comment on function public.claim_follow_up(uuid, integer) is
  'Beansprucht einen follow_ups-Eintrag für den Versand und erhöht attempts atomar im selben UPDATE (Guard: sent_at/cancelled_at/failed_at null, attempts < p_max_attempts). p_max_attempts wird von lib/followups/run.ts (MAX_FOLLOW_UP_ATTEMPTS) übergeben, damit das Limit nur an einer Stelle gepflegt wird. security definer, nur service_role.';

revoke execute on function public.claim_follow_up(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_follow_up(uuid, integer) to service_role;

-- Die alte Zwei-Parameter-lose Signatur wird durch die neue mit Default
-- ersetzt (PostgREST/Supabase erlauben mehrere überladene Funktionen mit
-- demselben Namen; die alte Signatur bliebe sonst als totes, verwirrendes
-- Duplikat stehen, das mit p_max_attempts=3 fest verdrahtet weiterliefe).
drop function if exists public.claim_follow_up(uuid);

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
    -- Befund 2: keine zweite offene Planung derselben Regel für dieselbe
    -- Anfrage. "offen" = weder gesendet, noch storniert, noch endgültig
    -- fehlgeschlagen (sent_at/cancelled_at/failed_at alle null).
    continue when exists (
      select 1 from public.follow_ups
      where inquiry_id = p_inquiry_id
        and rule_id = v_rule.id
        and sent_at is null
        and cancelled_at is null
        and failed_at is null
    );

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
  'Plant pro aktiver Regel (sort) einen follow_ups-Eintrag, max_count je Regel, race-sicher via pg_advisory_xact_lock auf die Anfrage. Überspringt eine Regel, für die bereits ein offener Eintrag existiert (kein Duplikat bei einem erneuten Aufruf für dieselbe Anfrage). security definer, nur service_role.';
