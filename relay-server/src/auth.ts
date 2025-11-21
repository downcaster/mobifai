import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { query } from './db/index.js';

dotenv.config();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_GOOGLE_CLIENT_SECRET';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

// Serialize user to session
passport.serializeUser((user: any, done) => {
  done(null, user);
});

passport.deserializeUser((user: any, done) => {
  done(null, user);
});

passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: `${SERVER_URL}/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      // Create user object
      const user = {
        id: profile.id,
        email: profile.emails?.[0].value,
        name: profile.displayName,
        photo: profile.photos?.[0].value,
      };

      // Upsert into DB
      try {
        await query(
          `INSERT INTO users (id, email, name, photo) 
           VALUES ($1, $2, $3, $4) 
           ON CONFLICT (id) DO UPDATE SET 
           email = EXCLUDED.email, 
           name = EXCLUDED.name, 
           photo = EXCLUDED.photo,
           updated_at = CURRENT_TIMESTAMP`,
          [user.id, user.email, user.name, user.photo]
        );
        console.log(`💾 Saved user ${user.email} to DB`);
      } catch (e) {
        console.error('❌ Failed to save user to DB:', e);
        // Continue even if DB fails so login succeeds
      }

      return done(null, user);
    }
  )
);

export function generateToken(user: any) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

