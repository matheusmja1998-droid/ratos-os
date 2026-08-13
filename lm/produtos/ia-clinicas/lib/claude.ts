// Client unico do Claude com dois providers, escolhido por env var:
//   IA_PROVIDER=anthropic (default) -> API direta da Anthropic (ANTHROPIC_API_KEY)
//   IA_PROVIDER=vertex              -> Google Cloud Vertex AI (billing no GCP)
//
// Vertex e a contingencia pra quando o billing/API da Anthropic estiver
// indisponivel: mesma superficie de messages.create, so muda o client e o
// formato do id do modelo (Vertex usa "@" na versao datada).
//
// Env vars do modo vertex (todas na Vercel):
//   GCP_VERTEX_PROJECT      id do projeto GCP
//   GCP_VERTEX_REGION       default "global"
//   GCP_VERTEX_CREDENTIALS  JSON da service account em UMA linha
//                           (role: Vertex AI User). Sem ela, cai no ADC.

import Anthropic from "@anthropic-ai/sdk";
import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";
import { GoogleAuth } from "google-auth-library";

const PROVIDER = (process.env.IA_PROVIDER || "anthropic").toLowerCase();

// Ids de modelo no formato da Vertex (snapshot datado usa "@").
const MODELOS_VERTEX: Record<string, string> = {
  "claude-haiku-4-5": "claude-haiku-4-5@20251001",
};

function criarClient(): Anthropic | AnthropicVertex {
  if (PROVIDER === "vertex") {
    const credsJson = process.env.GCP_VERTEX_CREDENTIALS;
    return new AnthropicVertex({
      projectId: process.env.GCP_VERTEX_PROJECT,
      region: process.env.GCP_VERTEX_REGION || "global",
      ...(credsJson
        ? {
            googleAuth: new GoogleAuth({
              credentials: JSON.parse(credsJson),
              scopes: "https://www.googleapis.com/auth/cloud-platform",
            }),
          }
        : {}),
    });
  }
  return new Anthropic(); // ANTHROPIC_API_KEY do ambiente
}

export const anthropic = criarClient();

const modeloBase = process.env.IA_MODELO || "claude-haiku-4-5";
export const MODELO =
  PROVIDER === "vertex" ? MODELOS_VERTEX[modeloBase] || modeloBase : modeloBase;
