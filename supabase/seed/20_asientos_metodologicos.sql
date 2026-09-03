-- =====================================================================
-- Seed · Asientos metodológicos en la bitácora de cada organización
-- =====================================================================
-- Las migrations corren ANTES que los seeds. Un bloque de migration que
-- recorre `organizations` para dejar constancia de una decisión metodológica no
-- encuentra ninguna organización en un proyecto recién creado: en producción el
-- asiento queda, en una base nueva no, y la diferencia no se ve hasta que
-- alguien pide la bitácora.
--
-- Este seed va al final, cuando las organizaciones ya existen, y vuelve a pedir
-- los asientos que sí están expuestos como función. Es idempotente: cada
-- función comprueba si el asiento ya está antes de escribirlo.
--
-- TODO[Sprint D-2]: quedan once migrations con el asiento todavía dentro de un
-- bloque `do $$` suelto (0036, 0038, 0039, 0041, 0044, 0046, 0047, 0048, 0049,
-- 0056 y 0058). En producción esos asientos existen porque las organizaciones
-- ya estaban; en un proyecto nuevo faltan. Se cierran igual que este —
-- extrayendo el cuerpo a una función y llamándola desde aquí— junto con los
-- siete asientos del Manual de la instrucción 48 de la Adenda 4.
-- =====================================================================

do $$
declare
  v_org uuid;
  v_n   int := 0;
begin
  for v_org in select id from organizations loop
    if public.asentar_adenda_5(v_org) then
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice 'Asientos de la Adenda 5 escritos: %', v_n;
end $$;
