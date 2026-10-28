/** Teste de saúde no caminho que as hospedagens costumam consultar: o mesmo retorno de /api/health, sem tocar no banco. */
export { GET } from "../api/health/route";

export const dynamic = "force-dynamic";
