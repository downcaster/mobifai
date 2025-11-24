import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import jwt from "jsonwebtoken";
import prisma from "./prisma.js";
import { config } from "./config.js";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  photo?: string;
}

// Serialize user to session
passport.serializeUser((user: Express.User, done) => {
  done(null, user);
});

passport.deserializeUser((user: Express.User, done) => {
  done(null, user);
});

passport.use(
  new GoogleStrategy(
    {
      clientID: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      callbackURL: `${config.SERVER_URL}/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      // Upsert user into DB using Prisma
      try {
        const user = await prisma.user.upsert({
          where: { id: profile.id },
          update: {
            email: profile.emails?.[0].value || "",
            name: profile.displayName,
            photo: profile.photos?.[0].value,
          },
          create: {
            id: profile.id,
            email: profile.emails?.[0].value || "",
            name: profile.displayName,
            photo: profile.photos?.[0].value,
          },
        });

        console.log(`💾 Saved user ${user.email} to DB`);

        return done(null, {
          id: user.id,
          email: user.email,
          name: user.name || "",
          photo: user.photo || undefined,
        });
      } catch (e) {
        console.error("❌ Failed to save user to DB:", e);
        // Return user data even if DB fails so login succeeds
        return done(null, {
          id: profile.id,
          email: profile.emails?.[0].value || "",
          name: profile.displayName || "",
          photo: profile.photos?.[0].value,
        });
      }
    }
  )
);

export function generateToken(user: Express.User | AuthUser) {
  return jwt.sign(user as object, config.JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch (error) {
    return null;
  }
}
