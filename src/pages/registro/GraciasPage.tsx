import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, ArrowRight } from "lucide-react";

const GraciasPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="container mx-auto max-w-2xl">
        <Card className="border-2 border-green-200">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4 w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            <CardTitle className="text-3xl font-bold text-slate-900">
              Solicitud Recibida
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <p className="text-lg text-slate-700 mb-4">
                Recibimos tu información. En menos de 24 horas nuestro equipo de cumplimiento te contactará para agendar una sesión de diagnóstico gratuita de 30 minutos.
              </p>
            </div>

            <div className="bg-slate-50 rounded-lg p-6">
              <h3 className="font-semibold text-slate-900 mb-4">¿Qué sigue?</h3>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-blue-600 font-semibold text-sm">1</span>
                  </div>
                  <p className="text-slate-700">
                    Recibirás un correo con el resumen de tu solicitud.
                  </p>
                </li>
                <li className="flex items-start">
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-blue-600 font-semibold text-sm">2</span>
                  </div>
                  <p className="text-slate-700">
                    Nuestro equipo revisa tu operación y prepara el diagnóstico.
                  </p>
                </li>
                <li className="flex items-start">
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-blue-600 font-semibold text-sm">3</span>
                  </div>
                  <p className="text-slate-700">
                    Agendamos la sesión y te enviamos los datos de acceso una vez definidos los alcances.
                  </p>
                </li>
              </ul>
            </div>

            <div className="text-center pt-4">
              <Button 
                size="lg"
                onClick={() => window.location.href = "https://www.yoltik.mx"}
                className="w-full md:w-auto"
              >
                Volver a Yoltik
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            <div className="text-center text-sm text-slate-500 pt-4 border-t">
              <p>
                ¿Tienes preguntas? Contáctanos en{" "}
                <a href="mailto:contacto@yoltik.mx" className="text-blue-600 hover:underline">
                  contacto@yoltik.mx
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GraciasPage;
