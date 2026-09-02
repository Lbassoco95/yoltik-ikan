-- =====================================================================
-- Seed 19 · Marcar las organizaciones de referencia
-- =====================================================================
-- La 0050 marca `es_referencia` sobre las dos organizaciones de demostración,
-- pero las migrations corren ANTES que los seeds: en un proyecto nuevo esas
-- organizaciones todavía no existen cuando la migration pasa, así que el update
-- no toca nada y la base acaba sin ninguna referencia.
--
-- La consecuencia no se ve hasta que hace falta: `provisionar_organizacion` se
-- niega con «no hay organización de referencia para el sector», y eso ocurre
-- justo cuando alguien intenta dar de alta la primera notaría real.
--
-- Se repite aquí en vez de mover la lógica, porque la migration sí tiene que
-- marcarlas en los proyectos que ya existían.
update organizations set es_referencia = true
 where id in (
   '11111111-1111-1111-1111-111111111111',  -- Ixim Pay, sector XVI
   '12121212-1212-1212-1212-121212121212'   -- Notaría Demo GDL, sector XII
 ) and not es_referencia;

do $$
declare v_n int;
begin
  select count(*) into v_n from organizations where es_referencia;
  if v_n = 0 then
    raise warning 'Ninguna organización quedó marcada como referencia. `provisionar_organizacion` '
      'se negará a dar de alta una organización nueva hasta que se marque una.';
  end if;
end $$;
