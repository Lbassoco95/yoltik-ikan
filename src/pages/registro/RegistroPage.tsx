import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

const ESTADOS_MX = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", 
  "Chiapas", "Chihuahua", "Coahuila", "Colima", "Durango", "Guanajuato",
  "Guerrero", "Hidalgo", "Jalisco", "Estado de México", "Michoacán",
  "Morelos", "Nayarit", "Nuevo León", "Oaxaca", "Puebla", "Querétaro",
  "Quintana Roo", "San Luis Potosí", "Sinaloa", "Sonora", "Tabasco",
  "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán", "Zacatecas", "Ciudad de México"
];

const REGIMENES_FISCALES = [
  { value: "601", label: "601 - General de Ley Personas Morales" },
  { value: "603", label: "603 - Personas Morales con Fines no Lucrativos" },
  { value: "605", label: "605 - Sueldos y Salarios e Ingresos Asimilados" },
  { value: "606", label: "606 - Arrendamiento" },
  { value: "608", label: "608 - Demás ingresos" },
  { value: "612", label: "612 - Personas Físicas con Actividades Empresariales" },
  { value: "621", label: "621 - Incorporación Fiscal" },
  { value: "622", label: "622 - Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras" },
  { value: "626", label: "626 - Régimen Simplificado de Confianza" }
];

const ACTIVIDADES_VULNERABLES = [
  { value: "IV", label: "IV", descripcion: "Mutuo, préstamo, crédito con o sin garantía (SOFOMs, fintech de crédito)" },
  { value: "V", label: "V", descripcion: "Inmuebles (compraventa, corretaje)" },
  { value: "V_BIS", label: "V Bis", descripcion: "Desarrollo inmobiliario (nuevo 2026)" },
  { value: "VII", label: "VII", descripcion: "Metales preciosos, joyas, piedras" },
  { value: "VIII", label: "VIII", descripcion: "Vehículos aéreos, marítimos, terrestres" },
  { value: "IX", label: "IX", descripcion: "Blindaje" },
  { value: "X", label: "X", descripcion: "Traslado de valores" },
  { value: "XI", label: "XI", descripcion: "Servicios profesionales (despachos)" },
  { value: "XII", label: "XII", descripcion: "Fe pública (notarios, corredores, facilitadores MASC)" },
  { value: "XIII", label: "XIII", descripcion: "Donativos" },
  { value: "XIV", label: "XIV", descripcion: "Comercio exterior" },
  { value: "XV", label: "XV", descripcion: "Arrendamiento" },
  { value: "XVI", label: "XVI", descripcion: "Activos virtuales (exchanges, custodios)" }
];

const prospectSchema = z.object({
  razon_social: z.string().min(1, "Razón social requerida"),
  rfc: z.string().min(12, "RFC debe tener 12 caracteres").max(13, "RFC debe tener 13 caracteres"),
  regimen_fiscal: z.string().optional(),
  ciudad: z.string().optional(),
  estado_republica: z.string().optional(),
  actividad_vulnerable: z.array(z.string()).min(1, "Selecciona al menos una actividad vulnerable"),
  estado_operacion: z.string().optional(),
  volumen_ops_mes: z.coerce.number().int().min(0).optional().nullable(),
  clientes_activos: z.coerce.number().int().min(0).optional().nullable(),
  tiene_oc_designado: z.enum(["si", "no", "no_se"]).optional(),
  registrado_sppld: z.enum(["si", "no", "no_se"]).optional(),
  tiene_manual_pld: z.enum(["si", "no", "no_se"]).optional(),
  extra_fedatario: z.object({
    matricula: z.string().optional(),
    entidad_federativa: z.string().optional(),
    tipo_fedatario: z.enum(["notario", "corredor", "facilitador"]).optional(),
  }).optional(),
  contacto_nombre: z.string().min(1, "Nombre de contacto requerido"),
  contacto_cargo: z.string().optional(),
  contacto_email: z.string().email("Email inválido"),
  contacto_telefono: z.string().optional(),
  notas: z.string().max(500).optional(),
  consentimiento_privacidad: z.literal(true, { errorMap: () => ({ message: "Debe aceptar el aviso de privacidad" }) }),
  consentimiento_contacto: z.literal(true, { errorMap: () => ({ message: "Debe aceptar el contacto" }) }),
});

type ProspectFormValues = z.infer<typeof prospectSchema>;

interface RegistroPageProps {
  defaultOrigen?: string;
  defaultActividad?: string[];
  showFedatario?: boolean;
  titulo?: string;
  subtitulo?: string;
}

const RegistroPage = ({ 
  defaultOrigen = "form_general",
  defaultActividad = [],
  showFedatario = false,
  titulo = "Empieza tu diagnóstico Ikán",
  subtitulo = "30 minutos con nuestro equipo de cumplimiento para entender tu operación y configurar la plataforma a tu medida. Sin tarjeta, sin compromiso."
}: RegistroPageProps) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ProspectFormValues>({
    resolver: zodResolver(prospectSchema),
    defaultValues: {
      razon_social: "",
      rfc: "",
      regimen_fiscal: "",
      ciudad: "",
      estado_republica: "",
      actividad_vulnerable: defaultActividad,
      estado_operacion: "",
      volumen_ops_mes: null,
      clientes_activos: null,
      tiene_oc_designado: undefined,
      registrado_sppld: undefined,
      tiene_manual_pld: undefined,
      extra_fedatario: {
        matricula: "",
        entidad_federativa: "",
        tipo_fedatario: undefined,
      },
      contacto_nombre: "",
      contacto_cargo: "",
      contacto_email: "",
      contacto_telefono: "",
      notas: "",
      consentimiento_privacidad: false,
      consentimiento_contacto: false,
    },
  });

  const actividadVulnerable = form.watch("actividad_vulnerable");
  const showFedatarioForm = showFedatario || actividadVulnerable.includes("XII");

  const onSubmit = async (values: ProspectFormValues) => {
    setIsSubmitting(true);
    
    try {
      const payload = {
        ...values,
        rfc: values.rfc.toUpperCase(),
        origen: defaultOrigen,
        extra_fedatario: showFedatarioForm ? values.extra_fedatario : undefined,
      };

      const { error } = await supabase.functions.invoke("on-prospect-intake", {
        body: payload,
      });

      if (error) {
        let message = "No se pudo enviar la solicitud. Intenta de nuevo.";
        if (error instanceof FunctionsHttpError) {
          try {
            const body: unknown = await error.context.json();
            if (
              typeof body === "object" &&
              body !== null &&
              "error" in body &&
              typeof body.error === "string"
            ) {
              message = body.error;
            }
          } catch {
            // respuesta sin cuerpo JSON: se conserva el mensaje genérico
          }
        }
        throw new Error(message);
      }

      toast.success("Solicitud enviada correctamente");
      navigate("/registro/gracias");
    } catch (error) {
      console.error("Error submitting form:", error);
      toast.error(error instanceof Error ? error.message : "No se pudo enviar la solicitud. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = async () => {
    const fieldsToValidate = currentStep === 0 
      ? ["razon_social", "rfc", "regimen_fiscal", "ciudad", "estado_republica"]
      : currentStep === 1
      ? ["actividad_vulnerable", "estado_operacion"]
      : [];

    const isValid = await form.trigger(fieldsToValidate as (keyof ProspectFormValues)[]);
    
    if (isValid) {
      setCurrentStep((prev) => Math.min(prev + 1, 2));
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <Button 
            variant="ghost" 
            onClick={() => window.location.href = "https://www.yoltik.mx"}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a yoltik.mx
          </Button>
          
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">{titulo}</h1>
            <p className="text-lg text-slate-600">{subtitulo}</p>
          </div>

          <div className="flex justify-center mb-8">
            <div className="flex items-center space-x-2">
              {[0, 1, 2].map((step) => (
                <div key={step} className="flex items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      step <= currentStep
                        ? "bg-blue-600 text-white"
                        : "bg-slate-200 text-slate-400"
                    }`}
                  >
                    {step < currentStep ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <span className="text-sm font-medium">{step + 1}</span>
                    )}
                  </div>
                  {step < 2 && (
                    <div
                      className={`w-16 h-1 mx-2 ${
                        step < currentStep ? "bg-blue-600" : "bg-slate-200"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                {currentStep === 0 && (
                  <div className="space-y-4">
                    <h2 className="text-2xl font-semibold mb-4">Sujeto Obligado</h2>
                    
                    <FormField
                      control={form.control}
                      name="razon_social"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Razón Social *</FormLabel>
                          <FormControl>
                            <Input placeholder="Ej: Empresa S.A. de C.V." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="rfc"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>RFC *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Ej: ABCD123456XYZ" 
                              maxLength={13}
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            />
                          </FormControl>
                          <FormDescription>12 o 13 caracteres (personas morales o físicas)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="regimen_fiscal"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Régimen Fiscal</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona tu régimen fiscal" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {REGIMENES_FISCALES.map((regimen) => (
                                <SelectItem key={regimen.value} value={regimen.value}>
                                  {regimen.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="ciudad"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Ciudad</FormLabel>
                            <FormControl>
                              <Input placeholder="Ej: Monterrey" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="estado_republica"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Estado</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona estado" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {ESTADOS_MX.map((estado) => (
                                <SelectItem key={estado} value={estado}>
                                  {estado}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                      />
                    </div>
                  </div>
                )}

                {currentStep === 1 && (
                  <div className="space-y-4">
                    <h2 className="text-2xl font-semibold mb-4">Actividad Vulnerable</h2>
                    
                    <FormField
                      control={form.control}
                      name="actividad_vulnerable"
                      render={() => (
                        <FormItem>
                          <div className="mb-4">
                            <FormLabel className="text-base">Selecciona las actividades que aplican a tu operación *</FormLabel>
                            <FormDescription>Puedes seleccionar múltiples opciones</FormDescription>
                          </div>
                          <div className="space-y-3">
                            {ACTIVIDADES_VULNERABLES.map((actividad) => (
                              <FormField
                                key={actividad.value}
                                control={form.control}
                                name="actividad_vulnerable"
                                render={({ field }) => {
                                  return (
                                    <FormItem
                                      key={actividad.value}
                                      className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-lg hover:bg-slate-50"
                                    >
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(actividad.value)}
                                          onCheckedChange={(checked) => {
                                            return checked
                                              ? field.onChange([...field.value, actividad.value])
                                              : field.onChange(
                                                  field.value?.filter(
                                                    (value) => value !== actividad.value
                                                  )
                                                );
                                          }}
                                          disabled={defaultActividad.includes(actividad.value)}
                                        />
                                      </FormControl>
                                      <div className="space-y-1 leading-none">
                                        <FormLabel className="font-medium">{actividad.label}</FormLabel>
                                        <FormDescription className="text-xs">
                                          {actividad.descripcion}
                                        </FormDescription>
                                      </div>
                                    </FormItem>
                                  );
                                }}
                              />
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="estado_operacion"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estado de Operación</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona estado de operación" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="operando">Operando</SelectItem>
                              <SelectItem value="por_iniciar">Por iniciar</SelectItem>
                              <SelectItem value="en_pausa">En pausa</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {showFedatarioForm && (
                      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <h3 className="font-semibold text-blue-900 mb-4">Información de Fedatario</h3>
                        <div className="space-y-4">
                          <FormField
                            control={form.control}
                            name="extra_fedatario.matricula"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Matrícula</FormLabel>
                                <FormControl>
                                  <Input placeholder="Ej: 12345" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="extra_fedatario.entidad_federativa"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Entidad Federativa donde ejerce</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Selecciona entidad" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {ESTADOS_MX.map((estado) => (
                                      <SelectItem key={estado} value={estado}>
                                        {estado}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="extra_fedatario.tipo_fedatario"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Tipo de Fedatario</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Selecciona tipo" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="notario">Notario</SelectItem>
                                    <SelectItem value="corredor">Corredor</SelectItem>
                                    <SelectItem value="facilitador">Facilitador MASC</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="space-y-4">
                    <h2 className="text-2xl font-semibold mb-4">Operación y Contacto</h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="volumen_ops_mes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Volumen aproximado de operaciones/mes</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                placeholder="Ej: 100" 
                                {...field}
                                onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="clientes_activos"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Clientes Activos</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                placeholder="Ej: 50" 
                                {...field}
                                onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="tiene_oc_designado"
                        render={({ field }) => (
                          <FormItem className="space-y-3">
                            <FormLabel>¿Tiene OC designado?</FormLabel>
                            <FormControl>
                              <RadioGroup
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                className="flex flex-col space-y-1"
                              >
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <RadioGroupItem value="si" />
                                  </FormControl>
                                  <FormLabel className="font-normal">Sí</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <RadioGroupItem value="no" />
                                  </FormControl>
                                  <FormLabel className="font-normal">No</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <RadioGroupItem value="no_se" />
                                  </FormControl>
                                  <FormLabel className="font-normal">No sé</FormLabel>
                                </FormItem>
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="registrado_sppld"
                        render={({ field }) => (
                          <FormItem className="space-y-3">
                            <FormLabel>¿Registrado en SPPLD?</FormLabel>
                            <FormControl>
                              <RadioGroup
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                className="flex flex-col space-y-1"
                              >
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <RadioGroupItem value="si" />
                                  </FormControl>
                                  <FormLabel className="font-normal">Sí</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <RadioGroupItem value="no" />
                                  </FormControl>
                                  <FormLabel className="font-normal">No</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <RadioGroupItem value="no_se" />
                                  </FormControl>
                                  <FormLabel className="font-normal">No sé</FormLabel>
                                </FormItem>
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="tiene_manual_pld"
                        render={({ field }) => (
                          <FormItem className="space-y-3">
                            <FormLabel>¿Tiene manual PLD vigente?</FormLabel>
                            <FormControl>
                              <RadioGroup
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                className="flex flex-col space-y-1"
                              >
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <RadioGroupItem value="si" />
                                  </FormControl>
                                  <FormLabel className="font-normal">Sí</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <RadioGroupItem value="no" />
                                  </FormControl>
                                  <FormLabel className="font-normal">No</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <RadioGroupItem value="no_se" />
                                  </FormControl>
                                  <FormLabel className="font-normal">No sé</FormLabel>
                                </FormItem>
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="border-t pt-4 mt-4">
                      <h3 className="font-semibold mb-4">Información de Contacto</h3>
                      
                      <FormField
                        control={form.control}
                        name="contacto_nombre"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nombre Completo *</FormLabel>
                            <FormControl>
                              <Input placeholder="Ej: Juan Pérez López" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="contacto_cargo"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cargo</FormLabel>
                            <FormControl>
                              <Input placeholder="Ej: Director General" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="contacto_email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email *</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder="ejemplo@empresa.com" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="contacto_telefono"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Teléfono</FormLabel>
                              <FormControl>
                                <Input placeholder="Ej: +52 55 1234 5678" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="notas"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Notas / Preguntas</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Alguna pregunta o comentario adicional..." 
                                className="resize-none"
                                maxLength={500}
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>Máximo 500 caracteres</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="border-t pt-4 mt-4 space-y-4">
                      <FormField
                        control={form.control}
                        name="consentimiento_privacidad"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>
                                He leído y acepto el{" "}
                                <a 
                                  href="https://www.yoltik.mx/aviso-de-privacidad" 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline"
                                >
                                  aviso de privacidad
                                </a> *
                              </FormLabel>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="consentimiento_contacto"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>
                                Acepto que Kawiil me contacte para agendar sesión de diagnóstico *
                              </FormLabel>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={prevStep}
                disabled={currentStep === 0}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Anterior
              </Button>

              {currentStep < 2 ? (
                <Button type="button" onClick={nextStep}>
                  Siguiente
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Enviando..." : "Enviar Solicitud"}
                </Button>
              )}
            </div>
          </form>
        </Form>

        <div className="mt-8 text-center text-sm text-slate-500">
          <p>
            Al continuar, aceptas nuestros{" "}
            <a href="https://www.yoltik.mx/terminos-y-condiciones" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              términos y condiciones
            </a>{" "}
            y{" "}
            <a href="https://www.yoltik.mx/aviso-de-privacidad" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              política de privacidad
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegistroPage;
