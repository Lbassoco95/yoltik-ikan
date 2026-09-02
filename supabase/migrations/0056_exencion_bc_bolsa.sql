-- =====================================================================
-- 0056 · La excepción de bolsa se habilita; la de anexo se cierra
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 4 del 01/09/2026,
-- apartado 5 e instrucción 38.
--
-- ---------------------------------------------------------------------
-- Lo que está abierto hoy y no debería
-- ---------------------------------------------------------------------
-- El artículo 23 Quinquies 2 de las RCG exime de recabar los datos del
-- beneficiario controlador en dos supuestos, y la 0049 dejó los dos aceptados
-- por el check de la tabla. Pero sólo uno se puede comprobar:
--
--   Fracción I  · emisoras con valores inscritos en bolsa. La prueba es
--                 OBJETIVA y autocontenida: el cliente proporciona la clave de
--                 pizarra con la que puede localizarse. El check ya la exige.
--
--   Fracción II · las entidades de los Anexos 4 Bis, 6 Bis, 7-A y 7 Bis A. Dos
--                 de esos anexos son LISTAS CERRADAS de entidades y no las
--                 tenemos: la versión en HTML del Diario Oficial elide las
--                 tablas de los anexos.
--
-- Así que hoy `bc_exencion = 'anexo_regla'` se admite sin nada detrás que
-- comprobar. Eso no es una excepción: es un clic que exime de identificar al
-- beneficiario controlador, resuelto a criterio del capturista. Y la
-- identificación del beneficiario controlador es de lo que menos margen admite
-- en toda la Ley.
--
-- Se cierra hasta que existan los catálogos. Una excepción sin catálogo se
-- deshabilita, no se estima.
--
-- ---------------------------------------------------------------------
-- Por qué no se implementa aquí la rama por naturaleza jurídica
-- ---------------------------------------------------------------------
-- La instrucción 39 —no bloqueante— resuelve los Anexos 4 Bis y 6 Bis por
-- categoría: si el cliente es persona moral mexicana de derecho público, o
-- embajada, consulado u organismo internacional, la excepción aplica sin
-- necesidad de lista. Eso sí se puede construir ya, pero necesita un campo que
-- hoy no existe: `tipo_social` tiene los diez tipos mercantiles de la LGSM y
-- ninguno de ellos es un ente público. Añadirlo es una decisión de modelo, no
-- un check, y va aparte.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Cerrar la rama sin catálogo
-- ---------------------------------------------------------------------
-- Antes de estrechar el check hay que mirar si alguien ya la usó. Estrechar
-- una restricción sobre datos que la violan hace fallar el ALTER, y fallar
-- aquí sería lo correcto: significaría que hay expedientes exentos sin
-- fundamento comprobable y hay que resolverlos a mano, no arrasarlos.
do $$
declare v_n int;
begin
  select count(*) into v_n from client where bc_exencion = 'anexo_regla';
  if v_n > 0 then
    raise exception
      'Hay % cliente(s) con la excepción por anexo, que se está cerrando por no tener catálogo '
      'detrás. Resuélvelos uno por uno antes de aplicar esta migration: o son emisoras con clave '
      'de pizarra, o hay que identificarles el beneficiario controlador. No se cambian solos '
      'porque cada uno es una decisión de cumplimiento.', v_n;
  end if;
end $$;

alter table client drop constraint if exists client_bc_exencion_valida;
alter table client
  add constraint client_bc_exencion_valida
  check (
    bc_exencion is null
    -- Fracción I. La clave de pizarra NO es opcional: el texto condiciona la
    -- excepción a que el cliente la proporcione, y sin ella la excepción no
    -- aplica aunque la sociedad cotice.
    or (bc_exencion = 'bolsa_de_valores' and coalesce(btrim(clave_pizarra), '') <> '')
  );

comment on column client.bc_exencion is
  'Excepción del art. 23 Quinquies 2 para no recabar datos del beneficiario '
  'controlador. Hoy sólo se admite «bolsa_de_valores», y no de forma automática '
  'por cotizar: el texto la condiciona a que el cliente proporcione la clave de '
  'pizarra. La rama por anexo (fr. II) está CERRADA hasta que se carguen los '
  'Anexos 7-A y 7 Bis A: una excepción sin catálogo detrás no es una excepción, '
  'es un clic que exime de identificar al beneficiario controlador.';

-- ---------------------------------------------------------------------
-- Que se pueda saber si un cliente está exento, sin repetir la regla
-- ---------------------------------------------------------------------
-- La pantalla, el diagnóstico y cualquier validación futura tienen que
-- coincidir en qué cuenta como exento. Con la regla escrita en tres sitios, el
-- día que cambie el criterio dos de ellos se quedan viejos y nadie se entera.
create or replace function public.bc_exento(p_client uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from client c
     where c.id = p_client
       and c.bc_exencion = 'bolsa_de_valores'
       and coalesce(btrim(c.clave_pizarra), '') <> ''
  );
$$;

comment on function public.bc_exento(uuid) is
  'Si este cliente está exento de recabar datos del beneficiario controlador. '
  'La regla vive AQUÍ y en un solo sitio: repartida entre la pantalla y la base, '
  'el día que cambie el criterio una de las dos se queda vieja sin dar señal.';

revoke all on function public.bc_exento(uuid) from public, anon;
grant execute on function public.bc_exento(uuid) to authenticated;

do $$
declare v_org uuid;
begin
  for v_org in select id from organizations loop
    if exists (select 1 from evento_auditoria
                where organization_id = v_org and tipo = 'exencion_bc_acotada') then
      continue;
    end if;
    perform public.registrar_evento(
      v_org, 'exencion_bc_acotada', 'client', null,
      jsonb_build_object(
        'fuente', 'Kawiil Mx · Célula de Cumplimiento, Adenda 4 del 01/09/2026, apartado 5 e '
               || 'instrucción 38.',
        'habilitada', 'Fracción I del art. 23 Quinquies 2: emisoras con valores inscritos. La '
                   || 'prueba es objetiva y autocontenida, y la clave de pizarra es obligatoria: '
                   || 'sin ella la excepción no aplica aunque la sociedad cotice.',
        'cerrada', 'Fracción II, la rama por anexo. Dos de los cuatro anexos son listas cerradas '
                || 'de entidades y no las tenemos: la versión en HTML del DOF elide las tablas. '
                || 'Admitirla sin catálogo detrás es un clic que exime de identificar al '
                || 'beneficiario controlador, resuelto a criterio del capturista.',
        'pendiente', 'Instrucción 39: la rama por naturaleza jurídica —persona moral mexicana de '
                  || 'derecho público, embajadas, consulados y organismos internacionales— sí se '
                  || 'puede resolver por categoría sin lista, pero necesita un campo que no '
                  || 'existe: tipo_social tiene los diez tipos mercantiles de la LGSM y ninguno '
                  || 'es un ente público.',
        'no_alcanza', 'La excepción es una prueba de CATEGORÍA, no de nombre: no alcanza a '
                   || 'empresas privadas, por grandes o conocidas que sean.'
      ),
      'sistema', null
    );
  end loop;
end $$;
