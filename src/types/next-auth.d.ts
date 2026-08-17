import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      squadId: string;
      role: string;
      isOwner: boolean;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
