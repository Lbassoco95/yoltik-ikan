import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { z } from "https://esm.sh/zod@3.22.4"

// Orígenes permitidos para el form público de registro
// (app propia + embed desde yoltik.mx + dev local).
const ALLOWED_ORIGINS = [
  'https://yoltik.mx',
  'https://www.yoltik.mx',
  'https://yoltik-regtech-hub.vercel.app',
  'http://localhost:8080',
]

function corsHeadersFor(req: Request) {
  const origin = req.headers.get('Origin')
  return {
    'Access-Control-Allow-Origin':
      origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

// Schema de validación con zod (igual al form del cliente)
const prospectIntakeSchema = z.object({
  razon_social: z.string().min(1, "Razón social requerida"),
  rfc: z.string().length(12).or(z.string().length(13)).transform(val => val.toUpperCase()),
  regimen_fiscal: z.string().optional(),
  actividad_vulnerable: z.array(z.string()).min(1, "Selecciona al menos una actividad vulnerable"),
  estado_operacion: z.string().optional(),
  volumen_ops_mes: z.number().int().min(0).optional().nullable(),
  clientes_activos: z.number().int().min(0).optional().nullable(),
  tiene_oc_designado: z.enum(["si", "no", "no_se"]).optional(),
  registrado_sppld: z.enum(["si", "no", "no_se"]).optional(),
  tiene_manual_pld: z.enum(["si", "no", "no_se"]).optional(),
  contacto_nombre: z.string().min(1, "Nombre de contacto requerido"),
  contacto_cargo: z.string().optional(),
  contacto_email: z.string().email("Email inválido"),
  contacto_telefono: z.string().optional(),
  ciudad: z.string().optional(),
  estado_republica: z.string().optional(),
  origen: z.string().min(1, "Origen requerido"),
  notas: z.string().max(500).optional(),
  extra_fedatario: z.object({
    matricula: z.string().optional(),
    entidad_federativa: z.string().optional(),
    tipo_fedatario: z.enum(["notario", "corredor", "facilitador"]).optional(),
  }).optional(),
  consentimiento_privacidad: z.literal(true, { errorMap: () => ({ message: "Debe aceptar el aviso de privacidad" }) }),
  consentimiento_contacto: z.literal(true, { errorMap: () => ({ message: "Debe aceptar el contacto" }) }),
})

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    
    // Validar payload con zod
    const validatedData = prospectIntakeSchema.parse(body)

    // Crear cliente Supabase con service_role (bypasea RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Insertar en prospect_intake
    const { data, error } = await supabase
      .from('prospect_intake')
      .insert({
        razon_social: validatedData.razon_social,
        rfc: validatedData.rfc,
        regimen_fiscal: validatedData.regimen_fiscal,
        actividad_vulnerable: validatedData.actividad_vulnerable,
        estado_operacion: validatedData.estado_operacion,
        volumen_ops_mes: validatedData.volumen_ops_mes,
        clientes_activos: validatedData.clientes_activos,
        tiene_oc_designado: validatedData.tiene_oc_designado === 'si',
        registrado_sppld: validatedData.registrado_sppld === 'si',
        tiene_manual_pld: validatedData.tiene_manual_pld === 'si',
        contacto_nombre: validatedData.contacto_nombre,
        contacto_cargo: validatedData.contacto_cargo,
        contacto_email: validatedData.contacto_email,
        contacto_telefono: validatedData.contacto_telefono,
        ciudad: validatedData.ciudad,
        estado_republica: validatedData.estado_republica,
        origen: validatedData.origen,
        notas: validatedData.notas,
        extra_fedatario: validatedData.extra_fedatario,
        consentimiento_privacidad: validatedData.consentimiento_privacidad,
        consentimiento_contacto: validatedData.consentimiento_contacto,
        status: 'nuevo',
      })
      .select()
      .single()

    if (error) {
      console.error('Error inserting prospect:', error)
      return new Response(JSON.stringify({ error: 'Error al procesar solicitud' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // TODO[email]: Enviar email a contacto@yoltik.mx con resumen del prospecto
    // Cuando Resend esté configurado, implementar aquí el envío de email
    console.log('TODO[email]: Enviar notificación a contacto@yoltik.mx para prospecto:', data.id)

    return new Response(JSON.stringify({ 
      ok: true, 
      id: data.id,
      session_hint: "Recibimos tu solicitud. Te contactamos en <24 horas."
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error in edge function:', error)
    
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ 
        error: 'Validación fallida', 
        details: error.errors 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
