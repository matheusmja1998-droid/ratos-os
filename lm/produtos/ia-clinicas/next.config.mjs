/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 e nativo e so e usado quando DB_DRIVER=sqlite (dev local).
  // Em producao (Vercel) usamos Supabase, entao marcamos como externo pra ele
  // nao ser empacotado no bundle serverless (evita erro de binario nativo).
  serverExternalPackages: ["better-sqlite3"],
  webpack: (config) => {
    // se o better-sqlite3 nao estiver instalado no ambiente serverless, ignora
    config.externals = config.externals || [];
    config.externals.push("better-sqlite3");
    return config;
  },
  eslint: {
    // nao trava o build de producao por lint (o codigo ja compila)
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
