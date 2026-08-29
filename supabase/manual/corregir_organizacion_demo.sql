-- ============================================================
-- Corrección · Razón social de la organización demo XVI
-- ============================================================
-- El seed 01 se aplicó al remoto ANTES del rename a Ixim Pay
-- (commit 6fd706a), y como los seeds sólo actualizan si se
-- vuelven a correr, el remoto se quedó con el nombre anterior.
--
-- Se corrige por ID, no por RFC: el UUID es un invariante
-- documentado en CLAUDE.md y no cambia; el RFC sí podría.
--
-- Idempotente: correrlo dos veces no hace nada la segunda.
-- ============================================================

-- Antes
select 'ANTES' as momento, id, rfc, razon_social
from organizations
where id = '11111111-1111-1111-1111-111111111111';

update organizations
   set razon_social = 'IXIM PAY, S.A. DE C.V.'
 where id = '11111111-1111-1111-1111-111111111111'
   and razon_social is distinct from 'IXIM PAY, S.A. DE C.V.';

-- Después: debe decir IXIM PAY
select 'DESPUES' as momento, id, rfc, razon_social
from organizations
where id = '11111111-1111-1111-1111-111111111111';
