import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      id: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) return null;
          const user = await prisma.user.findUnique({
            where: { email: credentials.email as string },
          });
          if (!user?.password) return null;
          const valid = await bcrypt.compare(credentials.password as string, user.password);
          if (!valid) return null;
          return { id: user.id, name: user.name, email: user.email, image: user.image };
        } catch (e) {
          console.error("[auth] error:", e);
          return null;
        }
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
      // "Adicionar membro" (Configurações → Equipe / POST /api/users) cria a linha em User
      // sem senha — é assim que se convida alguém novo pro squad, esperando que a pessoa
      // entre direto com o Google. Sem essa flag, o NextAuth recusa o primeiro login porque
      // já existe um User com esse email mas nenhuma Account do Google ainda vinculada
      // (erro "OAuthAccountNotLinked", que a tela de login mostra como "sem acesso").
      // Seguro aqui porque o callback signIn abaixo já funciona como allowlist: só libera
      // e-mails que já têm uma linha em User — ninguém entra só por ter uma conta Google.
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) token.id = user.id;

      // squadId/role vêm do banco (não do provider) — refeito em TODA chamada (não só
      // no login) pra sessão já aberta sentir na hora se o perfil mudar (ex.: alguém
      // virou admin/membro na aba Equipe) sem precisar deslogar e logar de novo.
      const userId = (token.id as string | undefined) ?? token.sub;
      if (userId) {
        const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { squadId: true, role: true } });
        if (dbUser) {
          token.id = userId;
          token.squadId = dbUser.squadId;
          token.role = dbUser.role;
        }
      }
      // quando conecta Google, salva o token no banco
      if (account?.provider === "google" && token.id) {
        await prisma.account.upsert({
          where: { provider_providerAccountId: { provider: "google", providerAccountId: account.providerAccountId } },
          update: {
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            expires_at: account.expires_at,
          },
          create: {
            userId: token.id as string,
            type: account.type,
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            expires_at: account.expires_at,
            token_type: account.token_type,
            scope: account.scope,
            id_token: account.id_token,
          },
        });
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.id) session.user.id = token.id as string;
      if (token?.squadId) session.user.squadId = token.squadId as string;
      if (token?.role) session.user.role = token.role as string;
      return session;
    },
    async signIn({ account, profile }) {
      // Google: só permite emails do squad
      if (account?.provider === "google") {
        const exists = await prisma.user.findUnique({ where: { email: profile?.email! } });
        return !!exists;
      }
      return true;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
});
