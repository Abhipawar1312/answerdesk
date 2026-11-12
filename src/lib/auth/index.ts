import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { env } from '@/lib/env';
import { connectDB } from '@/lib/db/mongoose';
import { User } from '@/models/User';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (account && user) {
        await connectDB();
        const email = user.email!;
        
        let dbUser = await User.findOne({ email });
        if (!dbUser) {
          dbUser = await User.create({
            email,
            name: user.name || 'User',
            image: user.image || '',
            googleId: account.providerAccountId,
          });
        }
        token.id = dbUser._id.toString();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});

