import type { Metadata } from "next";

export const metadata: Metadata = { title: "Teste do link público", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// CSS inline: a página do colaborador precisa funcionar mesmo se só /j/* estiver liberado para fora da Onnira.
const css = `
.jt{min-height:100vh;background:#eef3ef;color:#0e2a21;font:400 16px/1.5 Barlow,system-ui,sans-serif;padding:24px}
.jt-card{max-width:520px;margin:0 auto;background:#fff;border:2px solid #0b3b2c;border-radius:6px;overflow:hidden}
.jt-head{background:#0b3b2c;color:#fff;padding:12px 16px;display:flex;justify-content:space-between;font-size:14px}
.jt-body{padding:16px;display:grid;gap:12px}
.jt-title{font:700 32px/1.05 "Barlow Condensed",Barlow,system-ui,sans-serif;margin:0}
.jt-ok{background:#dcf2e6;border-left:6px solid #00a651;padding:8px 12px}
.jt-btn{min-height:44px;padding:0 16px;border:0;border-radius:6px;background:#ffd200;color:#0e2a21;font:600 16px Barlow,system-ui,sans-serif;cursor:pointer}
`;

export default async function LinkPublicoTeste({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const enviado = params.enviado === "1";
  return (
    <main className="jt">
      <style>{css}</style>
      <div className="jt-card">
        <div className="jt-head">
          <span>nexo · link pessoal</span>
          <span>teste</span>
        </div>
        <div className="jt-body">
          <h1 className="jt-title">O link público funciona</h1>
          <p>Se você abriu esta página fora da Onnira (janela anônima ou celular), os colaboradores conseguirão abrir o link pessoal deles.</p>
          {enviado ? <p className="jt-ok" role="status">Envio recebido pelo servidor. Marcar como feito vai funcionar.</p> : null}
          <form method="post" action="/j/teste/feito">
            <button className="jt-btn" type="submit">
              Testar &quot;marcar como feito&quot;
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
