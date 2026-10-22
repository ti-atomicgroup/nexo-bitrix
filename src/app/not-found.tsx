import Link from "next/link";
export default function NotFound() {
  return (
    <main className="fatal-state">
      <h1>Esta página não foi encontrada.</h1>
      <p>Volte ao Nexo para continuar sua jornada.</p>
      <Link href="/" className="button button-primary">
        Voltar ao início
      </Link>
    </main>
  );
}
