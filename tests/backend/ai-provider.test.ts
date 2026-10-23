import { expect, it } from "vitest";
import { AiProvider } from "../../src/server/ai-provider";
import { validateEnvironment } from "../../src/server/security";

const base = { NEXO_ENCRYPTION_KEY: "ab".repeat(32), NEXO_SETUP_TOKEN: "setup-secret-long-enough", NEXO_APP_URL: "https://nexo.example.com", BITRIX_PORTAL_URL: "https://acme.bitrix24.com" };
const catalog = { templateId: "model1", templateVersion: 2, profile: "Vendedor", stages: [{ id: "s1", title: "Primeira semana" }], activities: [{ id: "a1", stageId: "s1", title: "Conhecer o CRM", description: "Apresentar o funil de vendas", competencies: ["CRM", "Processo comercial"], documents: ["Manual do CRM"] }] };
const response = { competencies: [{ name: "CRM", importance: "essential", activityIds: ["a1"] }], gaps: [], activities: [{ activityId: "a1", stageId: "s1", order: 0, offsetDays: 1, assigneeRole: "gestor", reason: "Apresenta a ferramenta usada no cargo." }] };

it("usa o provedor compatível com OpenAI só no servidor e devolve JSON estruturado", async () => {
  let requestUrl = "", authorization = "", payload = "";
  const env = validateEnvironment({ ...base, NEXO_AI_BASE_URL: "https://ai.example.com/v1", NEXO_AI_MODEL: "model-test", NEXO_AI_API_KEY: "private-api-key" });
  const provider = new AiProvider(env, async (input, init) => {
    requestUrl = String(input); authorization = new Headers(init?.headers).get("Authorization") ?? ""; payload = String(init?.body);
    return Response.json({ choices: [{ message: { content: JSON.stringify(response) } }] });
  });
  await expect(provider.suggestTrail({ description: "Vender soluções B2B", catalog })).resolves.toEqual(response);
  expect(requestUrl).toBe("https://ai.example.com/v1/chat/completions");
  expect(authorization).toBe("Bearer private-api-key");
  expect(payload).toContain("Vender soluções B2B");
  expect(payload).toContain("Conhecer o CRM");
  expect(payload).not.toContain("employeeId");
});

it("mantém a jornada manual e informa quando a integração de IA não foi configurada", async () => {
  const env = validateEnvironment(base);
  expect(env.aiConfigured).toBe(false);
  const provider = new AiProvider(env, async () => { throw new Error("não deve chamar rede"); });
  await expect(provider.suggestTrail({ description: "Descrição", catalog })).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED", status: 503 });
});

it("desabilita configuração parcial ou URL HTTP pública sem derrubar a instalação", () => {
  expect(validateEnvironment({ ...base, NEXO_AI_API_KEY: "partial" }).aiConfigured).toBe(false);
  expect(validateEnvironment({ ...base, NEXO_AI_BASE_URL: "http://ai.example.com/v1", NEXO_AI_MODEL: "model-test", NEXO_AI_API_KEY: "secret" }).aiConfigured).toBe(false);
});

it("rejeita resposta excessiva ou conteúdo inesperado do provedor sem expor a credencial", async () => {
  const env = validateEnvironment({ ...base, NEXO_AI_BASE_URL: "https://ai.example.com/v1", NEXO_AI_MODEL: "model-test", NEXO_AI_API_KEY: "private-api-key" });
  const provider = new AiProvider(env, async () => Response.json({ choices: [{ message: { content: "texto fora do JSON" } }] }));
  await expect(provider.suggestTrail({ description: "Descrição", catalog })).rejects.toMatchObject({ code: "AI_RESPONSE_INVALID" });
});

it("converte timeout e erros HTTP do provedor em mensagens seguras", async () => {
  const env = validateEnvironment({ ...base, NEXO_AI_BASE_URL: "https://ai.example.com/v1", NEXO_AI_MODEL: "model-test", NEXO_AI_API_KEY: "private-api-key" });
  const timedOut = new AiProvider(env, async () => { throw new Error("timeout private-api-key"); });
  await expect(timedOut.suggestTrail({ description: "Descrição profissional", catalog })).rejects.toMatchObject({ code: "AI_PROVIDER_UNAVAILABLE", status: 503 });
  const unavailable = new AiProvider(env, async () => new Response("private-api-key", { status: 429 }));
  await expect(unavailable.suggestTrail({ description: "Descrição profissional", catalog })).rejects.toMatchObject({ code: "AI_PROVIDER_UNAVAILABLE" });
});

it("limita o tamanho total da solicitação ao provedor", async () => {
  const env = validateEnvironment({ ...base, NEXO_AI_BASE_URL: "https://ai.example.com/v1", NEXO_AI_MODEL: "model-test", NEXO_AI_API_KEY: "private-api-key" });
  const provider = new AiProvider(env, async () => { throw new Error("não deve chamar rede"); });
  await expect(provider.suggestTrail({ description: "Descrição profissional", catalog: { ...catalog, activities: [{ ...catalog.activities[0]!, description: "x".repeat(65000) }] } })).rejects.toMatchObject({ code: "AI_PROMPT_TOO_LARGE", status: 413 });
});

it("não expõe configuração ou chave no status público", () => {
  const env = validateEnvironment({ ...base, NEXO_AI_BASE_URL: "https://ai.example.com/v1", NEXO_AI_MODEL: "private-model-name", NEXO_AI_API_KEY: "private-api-key" });
  expect({ aiConfigured: env.aiConfigured }).toEqual({ aiConfigured: true });
  expect(JSON.stringify({ aiConfigured: env.aiConfigured })).not.toContain("private-api-key");
});
