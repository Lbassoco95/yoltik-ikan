-- =====================================================================
-- 0080 · Corrección revisión PR #25: plazo 24h inmutable + incumplido
-- =====================================================================
-- 1.2: fecha_conocimiento / plazo_limite_24h no se reescri tras generado.
-- 1.3: estado `incumplido` (acuse rechazo con plazo vencido).
-- =====================================================================

alter type estado_aviso add value if not exists 'incumplido';

create or replace function public.proteger_plazo_24h_aviso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- Una vez pasado listo_firma, el reloj queda anclado.
    if old.estado not in ('borrador', 'validado', 'listo_firma') then
      if new.fecha_conocimiento is distinct from old.fecha_conocimiento
         or new.plazo_limite_24h is distinct from old.plazo_limite_24h then
        raise exception
          'El plazo de 24 h es inmutable tras generar el aviso (estado %).',
          old.estado
          using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_plazo_24h_aviso on aviso;
create trigger trg_proteger_plazo_24h_aviso
  before update on aviso
  for each row execute function public.proteger_plazo_24h_aviso();

comment on function public.proteger_plazo_24h_aviso() is
  'Impide reescribir fecha_conocimiento/plazo_limite_24h cuando el aviso ya no está en borrador/validado/listo_firma.';
