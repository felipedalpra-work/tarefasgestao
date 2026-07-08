import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // força o root para o diretório do projeto (há outro package-lock.json na home do usuário local)
    root: path.join(__dirname),
  },
};

export default nextConfig;
