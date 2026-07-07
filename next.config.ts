import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // força o root para o diretório do projeto (há outro package-lock.json na home do usuário)
    root: "C:\\Users\\Felipe Dalpra\\tarefasgestao",
  },
};

export default nextConfig;
