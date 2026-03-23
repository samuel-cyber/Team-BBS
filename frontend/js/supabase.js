import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'your_supabase_project_url_here';
const SUPABASE_ANON_KEY = 'your_supabase_anon_key_here';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── GOOGLE AUTH ─────────────────────────────────────────────
// Triggers the Google OAuth popup and redirects to onboarding
// after Google confirms the user's identity
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/frontend/pages/onboarding.html'
    }
  });

  if (error) {
    console.error('Google sign in error:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

// ─── FACEBOOK AUTH ───────────────────────────────────────────
// Triggers the Facebook OAuth popup — works exactly the same
// way as Google under the hood, Supabase handles both identically
// The only difference is provider: 'facebook'
export async function signInWithFacebook() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'facebook',
    options: {
      // Same redirect destination as Google — onboarding checks
      // whether the user needs to fill in their profile or can
      // skip straight to the dashboard
      redirectTo: window.location.origin + '/frontend/pages/onboarding.html',

      // These are the pieces of information we are asking Facebook
      // to share with us about the user after they confirm login
      // email is needed to identify them, public_profile gives us
      // their name and profile picture
      scopes: 'email,public_profile'
    }
  });

  if (error) {
    console.error('Facebook sign in error:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

// ─── GET CURRENT USER ────────────────────────────────────────
// Works for both Google and Facebook sessions — Supabase treats
// all OAuth providers the same after the initial login
// Returns the user object if logged in, null if not
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ─── SIGN OUT ────────────────────────────────────────────────
// Signs out from whichever provider the user logged in with
// Clears the Supabase session completely and sends them home
export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Sign out error:', error.message);
    return { success: false };
  }

  window.location.href = '/frontend/index.html';
  return { success: true };
}

// ─── GET VENDOR PROFILE ──────────────────────────────────────
// Checks your custom users table for this person's vendor profile
// This is separate from Supabase's internal auth table —
// it is the profile they fill in during onboarding with their
// phone, market location, product categories and BVN
// Returns the profile object if found, null if not found
export async function getVendorProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) return null;
  return data;
}

// ─── SAVE VENDOR PROFILE ─────────────────────────────────────
// Writes the onboarding form data to your users table
// upsert means: insert this row if the user doesn't exist yet,
// update it if they do — so calling this twice never creates duplicates
// identity_verified starts as false and only becomes true after
// the Interswitch BVN check passes on the onboarding page
export async function saveVendorProfile(userId, profileData) {
  const { data, error } = await supabase
    .from('users')
    .upsert({
      id: userId,
      full_name: profileData.fullName,
      email: profileData.email,
      phone: profileData.phone,
      market_location: profileData.marketLocation,
      product_categories: profileData.productCategories,
      identity_verified: false
    });

  if (error) {
    console.error('Profile save error:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

// ─── REQUIRE AUTH ────────────────────────────────────────────
// This is the security guard for every protected page
// Paste one line at the top of dashboard, ajo and community pages:
// const session = await requireAuth();
// It handles three scenarios automatically:
// 1. Not logged in at all → sends to landing page
// 2. Logged in but no vendor profile → sends to onboarding
// 3. Fully set up → returns user and profile so the page can use them
export async function requireAuth() {
  const user = await getCurrentUser();

  if (!user) {
    window.location.href = '/frontend/index.html';
    return null;
  }

  const profile = await getVendorProfile(user.id);

  if (!profile) {
    window.location.href = '/frontend/pages/onboarding.html';
    return null;
  }

  return { user, profile };
}