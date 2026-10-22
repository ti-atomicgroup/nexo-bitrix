"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="fatal-state">
      <h1>Não foi possível abrir esta página.</h1>
      <p>
        Tente novamente. Se o problema continuar, consulte os registros de
        execução na Onnira.
      </p>
      <button onClick={reset} className="button button-primary">
        Tentar novamente
      </button>
    </main>
  );
}
