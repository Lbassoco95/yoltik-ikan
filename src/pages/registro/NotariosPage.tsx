import RegistroPage from "./RegistroPage";

const NotariosPage = () => {
  return (
    <RegistroPage
      defaultOrigen="form_notarios"
      defaultActividad={["XII"]}
      showFedatario={true}
      titulo="Ikán para Notarías, Corredurías y Facilitadores MASC"
      subtitulo="Diseñamos con notarios en ejercicio. Cubrimos el DeclaraNOT y los requerimientos de la reforma al Reglamento LFPIORPI de marzo 2026."
    />
  );
};

export default NotariosPage;
