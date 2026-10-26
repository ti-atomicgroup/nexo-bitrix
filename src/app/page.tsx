import { RootRedirect } from "@/features/access/root-redirect";

/** `/`: decide entre instalar, entrar ou abrir o painel. A sonda de ambiente continua em `/diagnostico`. */
export default function Home() {
  return <RootRedirect />;
}
