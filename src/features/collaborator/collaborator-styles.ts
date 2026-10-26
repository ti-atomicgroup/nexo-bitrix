/**
 * CSS da página do colaborador, injetado num `<style>` dentro da própria página.
 * Fora da Onnira só `/j/*` pode estar liberado: `/_next/*` (fontes, CSS dos módulos, globals.css) pode não
 * chegar. Por isso tudo aqui é autossuficiente: as cores repetem os tokens do sistema "Linhas" como variáveis
 * locais em `.cp`, as fontes têm alternativas do sistema e todas as classes começam com `cp-` (a mesma
 * página aparece como prévia dentro do console sem vazar estilo).
 */
export const COLLABORATOR_CSS = `
.cp{--cp-forest:#0b3b2c;--cp-forest-line:#23614d;--cp-on-forest-muted:#b8d3c7;--cp-ink:#0e2a21;--cp-muted:#4a5a52;--cp-canvas:#eef3ef;--cp-paper:#fff;--cp-line:#d3ddd7;--cp-field:#6b7d74;--cp-green:#00a651;--cp-green-strong:#00843d;--cp-green-tint:#dcf2e6;--cp-green-pending:#bfe6d0;--cp-orange:#ff6a13;--cp-orange-pending:#ffd3b8;--cp-yellow:#ffd200;--cp-yellow-hover:#ffdf40;--cp-yellow-tint:#fff6cc;--cp-yellow-edge:#b89600;--cp-red:#d7261e;--cp-red-tint:#fde8e7;--cp-red-ink:#8f1610;--cp-blue:#0066cc;--cp-ui:Barlow,"Segoe UI",Roboto,"Helvetica Neue",Arial,system-ui,sans-serif;--cp-display:"Barlow Condensed","Roboto Condensed","Arial Narrow",Barlow,system-ui,sans-serif;--cp-line-color:var(--cp-green);--cp-line-pending:var(--cp-green-pending);box-sizing:border-box;min-height:100vh;background:var(--cp-canvas);color:var(--cp-ink);font:400 16px/1.5 var(--cp-ui);font-variant-numeric:tabular-nums;-webkit-text-size-adjust:100%;text-size-adjust:100%}
body:has(> .cp),body:has(> main.cp){margin:0}
.cp *,.cp *::before,.cp *::after{box-sizing:border-box}
.cp--offboarding{--cp-line-color:var(--cp-orange);--cp-line-pending:var(--cp-orange-pending)}
.cp--preview{min-height:0}
.cp h1,.cp h2,.cp h3,.cp p,.cp dl,.cp dd,.cp ul,.cp ol,.cp figure{margin:0}
.cp ul,.cp ol{padding:0;list-style:none}
.cp a{color:var(--cp-blue);text-underline-offset:.18em}
.cp ::selection{background:var(--cp-yellow);color:var(--cp-ink)}
.cp :focus-visible{outline:none;box-shadow:0 0 0 3px var(--cp-yellow),0 0 0 5px var(--cp-forest);border-radius:4px}
.cp-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.cp-top{background:var(--cp-forest);color:#fff}
.cp-top-in{max-width:560px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.cp-brand{display:inline-flex;align-items:center;gap:8px;font:400 20px/1 "Archivo Black",var(--cp-ui);letter-spacing:-.02em}
.cp-company{color:var(--cp-on-forest-muted);font-size:14px;font-weight:600;text-align:right;overflow-wrap:anywhere}
.cp-body{max-width:560px;margin:0 auto;padding:16px 16px 48px;display:grid;gap:28px}
.cp-h2{font:700 28px/1.05 var(--cp-display)}
.cp-h3{font:700 22px/1.1 var(--cp-display);overflow-wrap:anywhere}
.cp-section{display:grid;gap:14px;min-width:0}
.cp-lead{color:var(--cp-muted)}
.cp-flash{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:1px solid var(--cp-green);border-radius:6px;background:var(--cp-green-tint);font-weight:600}
.cp-flash svg{flex:none;margin-top:2px;color:var(--cp-green-strong)}
.cp-flash--err{border-color:var(--cp-red);background:var(--cp-red-tint);color:var(--cp-red-ink)}
.cp-flash--err svg{color:var(--cp-red-ink)}
.cp-pass{--stub:124px;--notch:13px;display:grid;grid-template-rows:auto auto minmax(0,1fr) var(--stub);border:2px solid var(--cp-forest);border-radius:6px;background:var(--cp-paper);-webkit-mask:radial-gradient(circle var(--notch) at 0 calc(100% - var(--stub)),transparent calc(var(--notch) - .5px),black var(--notch)),radial-gradient(circle var(--notch) at 100% calc(100% - var(--stub)),transparent calc(var(--notch) - .5px),black var(--notch));-webkit-mask-composite:source-in;mask:radial-gradient(circle var(--notch) at 0 calc(100% - var(--stub)),transparent calc(var(--notch) - .5px),black var(--notch)),radial-gradient(circle var(--notch) at 100% calc(100% - var(--stub)),transparent calc(var(--notch) - .5px),black var(--notch));mask-composite:intersect}
.cp-pass-strip{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 16px;background:var(--cp-forest);color:#fff;font-size:14px;font-weight:600}
.cp-pass-strip span:last-child{color:var(--cp-on-forest-muted);text-align:right;overflow-wrap:anywhere}
.cp-pass-line{height:6px;background:var(--cp-line-color)}
.cp-pass-main{display:grid;gap:18px;padding:20px 20px 16px;min-width:0}
.cp-pass-greet{color:var(--cp-muted);font-weight:600}
.cp-pass-name{font:700 clamp(40px,13vw,56px)/.95 var(--cp-display);overflow-wrap:anywhere}
.cp-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px}
.cp-fields dt{color:var(--cp-muted);font-size:13px;font-weight:600}
.cp-fields dd{margin-top:2px;font:700 20px/1.15 var(--cp-display);overflow-wrap:break-word;hyphens:auto}
.cp-stub{display:grid;align-content:center;justify-items:center;gap:2px;margin:0 16px;border-top:2px dashed var(--cp-field);text-align:center}
.cp-count{font:700 52px/.95 var(--cp-display)}
.cp-count-cap{color:var(--cp-muted);font-weight:600}
.cp-farewell{display:grid;gap:14px;padding:20px;border-radius:6px;background:var(--cp-orange);color:var(--cp-ink)}
.cp-farewell-title{font:700 clamp(36px,11vw,52px)/.95 var(--cp-display);overflow-wrap:anywhere}
.cp-farewell-date{font-weight:600}
.cp-farewell-count{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px;padding-top:14px;border-top:2px dashed var(--cp-ink)}
.cp-farewell-count .cp-count{font-size:44px}
.cp-farewell-count .cp-count-cap{color:var(--cp-ink)}
.cp-msg{padding:16px;border:1px solid var(--cp-line);border-radius:6px;background:var(--cp-paper);white-space:pre-line;overflow-wrap:anywhere}
.cp-progress{display:grid;gap:8px}
.cp-progress-text{font-weight:600}
.cp-progress-text strong{font:700 24px/1 var(--cp-display)}
.cp-bar{height:8px;border-radius:4px;background:var(--cp-line-pending);overflow:hidden}
.cp-bar span{display:block;height:100%;border-radius:4px;background:var(--cp-forest)}
.cp-stations{display:grid}
.cp-station{position:relative;display:grid;grid-template-columns:28px minmax(0,1fr);column-gap:14px;padding-bottom:28px}
.cp-station:last-child{padding-bottom:0}
.cp-station:not(:last-child)::before{content:"";position:absolute;top:14px;bottom:-14px;left:11px;width:6px;background:var(--cp-line-pending)}
.cp-station--done:not(:last-child)::before{background:var(--cp-line-color)}
.cp-dot{position:relative;z-index:1;width:20px;height:20px;margin:4px;border:3px solid var(--cp-line-color);border-radius:50%;background:var(--cp-paper);display:grid;place-items:center;color:var(--cp-ink)}
.cp-station--done .cp-dot{background:var(--cp-line-color)}
.cp-station--current .cp-dot{width:28px;height:28px;margin:0;border-color:var(--cp-forest);background:var(--cp-yellow)}
.cp-station-body{display:grid;gap:12px;min-width:0}
.cp-station-head{display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;min-height:28px}
.cp-station--upcoming .cp-h3{color:var(--cp-muted)}
.cp-here{display:inline-flex;align-items:center;padding:2px 8px;border:2px solid var(--cp-forest);border-radius:4px;background:var(--cp-yellow);color:var(--cp-ink);font-size:14px;font-weight:700;white-space:nowrap}
.cp-acts{display:grid;gap:10px}
.cp-act{display:grid;gap:10px;min-width:0;padding:14px;border:1px solid var(--cp-line);border-radius:6px;background:var(--cp-paper)}
.cp-act--mine{border:2px solid var(--cp-forest)}
.cp-act--done{border-color:var(--cp-line)}
.cp-act--theirs{border-style:dashed;background:transparent}
.cp-act-head{display:flex;align-items:flex-start;gap:12px}
.cp-tile{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:6px;background:var(--cp-forest);color:#fff}
.cp-act--theirs .cp-tile{background:var(--cp-canvas);color:var(--cp-forest);box-shadow:inset 0 0 0 1px var(--cp-line)}
.cp-act-text{display:grid;gap:2px;min-width:0}
.cp-act-title{font-weight:600;overflow-wrap:anywhere}
.cp-act-meta{color:var(--cp-muted);font-size:14px}
.cp-act-body{white-space:pre-line;overflow-wrap:anywhere}
.cp-badge{display:inline-flex;align-items:center;gap:6px;justify-self:start;min-height:28px;padding:2px 10px;border:1px solid var(--cp-line);border-radius:4px;background:var(--cp-canvas);font-size:14px;font-weight:600}
.cp-badge--done{border-color:var(--cp-green);background:var(--cp-green-tint)}
.cp-badge--done svg{color:var(--cp-green-strong)}
.cp-badge--wait{border-color:var(--cp-yellow-edge);background:var(--cp-yellow-tint)}
.cp-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:48px;padding:0 16px;border:2px solid var(--cp-yellow);border-radius:6px;background:var(--cp-yellow);color:var(--cp-ink);font:600 16px/1.2 var(--cp-ui);cursor:pointer}
.cp-btn:hover{background:var(--cp-yellow-hover);border-color:var(--cp-yellow-hover)}
.cp-btn[disabled]{opacity:.6;cursor:not-allowed}
.cp-form{margin:0}
.cp-links{display:grid}
.cp-links li{border-bottom:1px solid var(--cp-line)}
.cp-links li:last-child{border-bottom:0}
.cp-links a{display:flex;align-items:center;gap:10px;min-height:48px;padding:6px 0;font-weight:600;overflow-wrap:anywhere}
.cp-links svg{flex:none}
.cp-people{display:grid;gap:12px}
.cp-person{display:flex;align-items:center;gap:12px}
.cp-avatar{flex:none;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:var(--cp-forest);color:#fff;font:700 18px/1 var(--cp-display)}
.cp-person-name{font-weight:600;overflow-wrap:anywhere}
.cp-person-role{color:var(--cp-muted);font-size:14px}
.cp-contacts{display:grid;gap:10px}
.cp-contacts div{display:grid;gap:2px;padding:12px 14px;border:1px solid var(--cp-line);border-radius:6px;background:var(--cp-paper)}
.cp-contacts dt{color:var(--cp-muted);font-size:14px;font-weight:600}
.cp-contacts dd{font-weight:600;overflow-wrap:anywhere}
.cp-faq{display:grid;border-top:1px solid var(--cp-line)}
.cp-faq details{border-bottom:1px solid var(--cp-line)}
.cp-faq summary{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:52px;padding:10px 0;font-weight:600;cursor:pointer;list-style:none}
.cp-faq summary::-webkit-details-marker{display:none}
.cp-faq summary svg{flex:none;transition:transform .15s ease}
.cp-faq details[open] summary svg{transform:rotate(180deg)}
.cp-faq p{padding:0 0 14px;white-space:pre-line;overflow-wrap:anywhere}
.cp-foot{display:grid;gap:4px;padding-top:20px;border-top:1px solid var(--cp-line);color:var(--cp-muted);font-size:14px}
.cp-preview-note{display:flex;gap:8px;align-items:flex-start;padding:10px 12px;border:1px dashed var(--cp-field);border-radius:6px;background:var(--cp-paper);color:var(--cp-muted);font-size:14px}
@media (min-width:480px){.cp-btn{width:auto}}
@media (prefers-reduced-motion:reduce){.cp *{transition:none!important;animation:none!important}}
`;
