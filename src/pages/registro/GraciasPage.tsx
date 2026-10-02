import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, ArrowRight } from "lucide-react";
import { MarcaIkan } from "@/components/estela/MarcaIkan";
import { FondoFluido } from "@/components/estela/FondoFluido";

const GraciasPage = () => {
  return (
    <div className="relative flex min-h-screen flex-col">
      <FondoFluido className="fixed" />
      <div className="relative z-10 flex flex-1 items-center justify-center p-4">
      <div className="container mx-auto max-w-2xl">
        <Card className="estela-filo border-t-success">
          <CardHeader className="pb-4 text-center">
            <div className="mb-5 flex justify-center">
              <MarcaIkan size={40} />
            </div>
            <div className="mx-auto mb-4 w-20 h-20 bg-success/10 rounded-full flex items-center justify-center">
              <CheckCircle className="h-12 w-12 text-success" />
            </div>
            <CardTitle className="text-3xl font-bold text-foreground">
              Solicitud Recibida
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <p className="text-lg text-foreground mb-4">
                Recibimos tu información. En menos de 24 horas nuestro equipo de cumplimiento te contactará para agendar una sesión de diagnóstico gratuita de 30 minutos.
              </p>
            </div>

            <div className="bg-muted rounded-md p-6">
              <h3 className="font-semibold text-foreground mb-4">¿Qué sigue?</h3>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <div className="flex-shrink-0 w-6 h-6 bg-accent/10 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-accent font-semibold text-sm">1</span>
                  </div>
                  <p className="text-foreground">
                    Recibirás un correo con el resumen de tu solicitud.
                  </p>
                </li>
                <li className="flex items-start">
                  <div className="flex-shrink-0 w-6 h-6 bg-accent/10 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-accent font-semibold text-sm">2</span>
                  </div>
                  <p className="text-foreground">
                    Nuestro equipo revisa tu operación y prepara el diagnóstico.
                  </p>
                </li>
                <li className="flex items-start">
                  <div className="flex-shrink-0 w-6 h-6 bg-accent/10 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-accent font-semibold text-sm">3</span>
                  </div>
                  <p className="text-foreground">
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

            <div className="text-center text-sm text-muted-foreground pt-4 border-t">
              <p>
                ¿Tienes preguntas? Contáctanos en{" "}
                <a href="mailto:contacto@yoltik.mx" className="text-accent hover:underline">
                  contacto@yoltik.mx
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
};

export default GraciasPage;
