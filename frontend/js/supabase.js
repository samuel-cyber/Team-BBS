// ══════════════════════════════════════════════════════════════
// SUWE — Supabase Client + All Helper Functions v4
// ══════════════════════════════════════════════════════════════
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL      = 'https://jqfmybadioqbmrkrsvbl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZm15YmFkaW9xYm1ya3JzdmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNjczMTIsImV4cCI6MjA4OTg0MzMxMn0.R58UVPxWfNoyOwKB3qIelhp35zcmNcVMhgWwSEpDkE4';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── AUTH PROVIDERS ────────────────────────────────────────────
// Teammate added this helper — kept, but redirectTo fixed to onboarding:
// New Google users get their profile set up first.
// Existing users: onboarding.html detects their profile and skips straight to dashboard.
export async function signInWithGoogle() {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/frontend/pages/onboarding.html'
      }
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── AUTH ──────────────────────────────────────────────────────
export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) return null;
    return user || null;
  } catch { return null; }
}

export async function getVendorProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('users').select('*').eq('id', userId).maybeSingle();
    if (error) { console.warn('getVendorProfile:', error.message); return null; }
    return data;
  } catch (err) { console.warn('getVendorProfile exception:', err.message); return null; }
}

export function isProfileComplete(profile) {
  return !!(profile && profile.phone && profile.phone.trim().length > 0);
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = '/frontend/index.html';
}

// ── SALES ─────────────────────────────────────────────────────
export async function logSale(userId, { itemName, quantity, unit, costPrice, sellPrice }) {
  const qty  = Number(quantity)  || 1;
  const sell = Number(sellPrice) || 0;
  const cost = Number(costPrice) || 0;
  const { data, error } = await supabase.from('sales').insert({
    user_id:       userId,
    item_name:     itemName,
    quantity:      qty,
    unit:          unit || 'units',
    selling_price: sell * qty,
    cost_price:    cost * qty,
    profit:        (sell - cost) * qty,
    sale_date:     new Date().toISOString().split('T')[0]
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getTodaySales(userId) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase.from('sales').select('*')
    .eq('user_id', userId).eq('sale_date', today)
    .order('created_at', { ascending: false });
  if (error) { console.warn('getTodaySales:', error.message); return []; }
  return data || [];
}

export async function getWeekSales(userId) {
  const ago = new Date(); ago.setDate(ago.getDate() - 7);
  const { data, error } = await supabase.from('sales').select('*')
    .eq('user_id', userId)
    .gte('sale_date', ago.toISOString().split('T')[0])
    .order('created_at', { ascending: false });
  if (error) { console.warn('getWeekSales:', error.message); return []; }
  return data || [];
}

export async function getThreeMonthSales(userId) {
  const ago = new Date(); ago.setMonth(ago.getMonth() - 3);
  const { data, error } = await supabase.from('sales').select('*')
    .eq('user_id', userId)
    .gte('sale_date', ago.toISOString().split('T')[0])
    .order('sale_date', { ascending: false });
  if (error) { console.warn('getThreeMonthSales:', error.message); return []; }
  return data || [];
}

export async function getAllSales(userId) {
  const { data, error } = await supabase.from('sales').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false });
  if (error) { console.warn('getAllSales:', error.message); return []; }
  return data || [];
}

// ── INVENTORY ─────────────────────────────────────────────────
export async function getInventory(userId) {
  const { data, error } = await supabase.from('inventory').select('*')
    .eq('user_id', userId).order('item_name');
  if (error) { console.warn('getInventory:', error.message); return []; }
  return data || [];
}

export async function upsertInventoryItem(userId, itemName, quantity, unit = 'units') {
  const { error } = await supabase.from('inventory').upsert({
    user_id:    userId,
    item_name:  itemName,
    quantity:   Math.max(0, Number(quantity)),
    unit,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,item_name' });
  if (error) throw new Error(error.message);
}

export async function reduceInventory(userId, itemName, quantitySold) {
  const { data: existing } = await supabase.from('inventory').select('quantity')
    .eq('user_id', userId).eq('item_name', itemName).maybeSingle();
  if (!existing) return;
  await upsertInventoryItem(userId, itemName, Math.max(0, existing.quantity - Number(quantitySold)));
}

export async function getLowStockItems(userId) {
  const { data, error } = await supabase.from('inventory').select('*').eq('user_id', userId);
  if (error) { console.warn('getLowStockItems:', error.message); return []; }
  return (data || []).filter(item => item.quantity <= (item.reorder_level || 5));
}

export async function hasInventory(userId) {
  const { data, error } = await supabase.from('inventory').select('id').eq('user_id', userId).limit(1);
  if (error) { console.warn('hasInventory:', error.message); return false; }
  return (data || []).length > 0;
}

// ── AJO ───────────────────────────────────────────────────────
export async function getAjoGroupsForUser(userId) {
  const { data: memberships, error: mErr } = await supabase
    .from('ajo_members').select('*').eq('user_id', userId);
  if (mErr || !memberships?.length) return [];
  const groupIds = memberships.map(m => m.group_id);
  const { data: groups, error: gErr } = await supabase
    .from('ajo_groups').select('*').in('id', groupIds);
  if (gErr || !groups) return [];
  return groups.map(g => ({ ...g, membership: memberships.find(m => m.group_id === g.id) || {} }));
}

export async function getUserAjoGroupCount(userId) {
  const { data, error } = await supabase.from('ajo_members').select('id').eq('user_id', userId);
  if (error) { console.warn('getUserAjoGroupCount:', error.message); return 0; }
  return (data || []).length;
}

/**
 * Fetch all members of a group with profile data.
 * Uses the backend (service role) so RLS does not block cross-user reads.
 * Falls back gracefully if backend is unreachable.
 */
export async function getGroupMembers(groupId, backendUrl = 'https://team-bbs-sandy.vercel.app') {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${backendUrl}/api/group-members/${groupId}`, {
      headers: { 'Authorization': `Bearer ${session?.access_token || ''}` }
    });
    if (res.ok) {
      const json = await res.json();
      return json.members || [];
    }
  } catch (err) {
    console.warn('getGroupMembers backend failed:', err.message);
  }
  // Fallback: own row only
  const { data, error } = await supabase.from('ajo_members').select('*')
    .eq('group_id', groupId).order('payout_position', { ascending: true });
  if (error) return [];
  return data || [];
}

export async function getOpenAjoGroups(filters = {}) {
  let query = supabase.from('ajo_groups').select('*')
    .eq('visibility', 'public').neq('status', 'dissolved');
  if (filters.maxContribution) query = query.lte('contribution_amount', filters.maxContribution);
  if (filters.minContribution) query = query.gte('contribution_amount', filters.minContribution);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(20);
  if (error) { console.warn('getOpenAjoGroups:', error.message); return []; }
  return (data || []).filter(g => (g.current_members || 0) < g.max_members);
}

export async function getGroupsNearUser(userState, limit = 5) {
  if (userState) {
    const { data } = await supabase.from('ajo_groups').select('*')
      .eq('visibility', 'public').eq('state', userState)
      .neq('status', 'dissolved').limit(limit);
    const near = (data || []).filter(g => (g.current_members || 0) < g.max_members);
    if (near.length >= 2) return near.slice(0, limit);
  }
  const { data } = await supabase.from('ajo_groups').select('*')
    .eq('visibility', 'public').neq('status', 'dissolved')
    .order('created_at', { ascending: false }).limit(limit);
  return (data || []).filter(g => (g.current_members || 0) < g.max_members).slice(0, limit);
}

export async function createAjoGroup(userId, { groupName, contributionAmount, maxMembers, visibility, category, state }) {
  const max = Math.min(Math.max(Number(maxMembers) || 8, 3), 8);
  const { data: group, error: gErr } = await supabase.from('ajo_groups').insert({
    group_name:          groupName,
    created_by:          userId,
    contribution_amount: Number(contributionAmount),
    frequency:           'monthly',
    max_members:         max,
    current_members:     1,
    minimum_bcs:         0,
    status:              'forming',
    visibility:          visibility || 'public',
    category:            category || 'General',
    state:               state || null
  }).select().single();
  if (gErr) throw new Error(gErr.message);
  const { score: bcs } = await computeBCS(userId, false);
  await supabase.from('ajo_members').insert({
    group_id:        group.id,
    user_id:         userId,
    bcs_at_join:     bcs,
    payment_status:  'pending',
    paid_this_cycle: false
  });
  return group;
}

export async function joinAjoGroup(userId, groupId) {
  const count = await getUserAjoGroupCount(userId);
  if (count >= 2) throw new Error('You are already in 2 ajo groups.');
  const { data: group } = await supabase.from('ajo_groups').select('*').eq('id', groupId).maybeSingle();
  if (!group) throw new Error('Group not found.');
  if ((group.current_members || 0) >= group.max_members) throw new Error('This group is full.');
  if (group.status === 'active') throw new Error('Cannot join a group mid-cycle.');
  const { score: bcs } = await computeBCS(userId, false);
  const { error } = await supabase.from('ajo_members').insert({
    group_id:        groupId,
    user_id:         userId,
    bcs_at_join:     bcs,
    payment_status:  'pending',
    paid_this_cycle: false
  });
  if (error) throw new Error(error.message);
  await supabase.from('ajo_groups')
    .update({ current_members: (group.current_members || 0) + 1 }).eq('id', groupId);
  return true;
}

export async function getAjoPayments(userId, groupId = null) {
  let query = supabase.from('ajo_payments')
    .select('*, ajo_groups(group_name, contribution_amount, category)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (groupId) query = query.eq('group_id', groupId);
  const { data, error } = await query;
  if (error) { console.warn('getAjoPayments:', error.message); return []; }
  return data || [];
}

// ── NOTIFICATIONS ─────────────────────────────────────────────
export async function getNotifications(userId) {
  const { data, error } = await supabase.from('notifications').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(30);
  if (error) { console.warn('getNotifications:', error.message); return []; }
  return data || [];
}

export async function getUnreadCount(userId) {
  const { count, error } = await supabase.from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId).eq('read', false);
  if (error) return 0;
  return count || 0;
}

export async function markAllRead(userId) {
  await supabase.from('notifications')
    .update({ read: true }).eq('user_id', userId).eq('read', false);
}

export async function markNotificationRead(notifId) {
  await supabase.from('notifications').update({ read: true }).eq('id', notifId);
}

// ── COMMUNITY ─────────────────────────────────────────────────
export async function getCommunityPosts(limit = 5) {
  const { data, error } = await supabase.from('trade_posts')
    .select('*, users(full_name, market_location)')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) { console.warn('getCommunityPosts:', error.message); return []; }
  return data || [];
}

export async function createTradePost(userId, { postType, title, description, location, whatsappNumber }) {
  const { data, error } = await supabase.from('trade_posts').insert({
    user_id:         userId,
    post_type:       postType,
    title,
    description,
    location,
    whatsapp_number: whatsappNumber
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// ── BCS ───────────────────────────────────────────────────────
export async function computeBCS(userId, identityVerified) {
  try {
    const { data: allSales } = await supabase
      .from('sales').select('sale_date, profit').eq('user_id', userId);
    if (!allSales?.length) {
      const score = identityVerified ? 25 : 0;
      await supabase.from('users').update({ bcs_score: score, bcs_tier: 'Bronze' }).eq('id', userId);
      return { score, tier: 'Bronze' };
    }
    const uniqueDays = new Set(allSales.map(s => s.sale_date)).size;
    const daysScore  = Math.min(uniqueDays / 30, 1) * 25;
    const freqScore  = Math.min(allSales.length / 50, 1) * 25;
    const profitable = allSales.filter(s => (s.profit || 0) > 0).length;
    const trendScore = (profitable / allSales.length) * 25;
    const idScore    = identityVerified ? 25 : 0;
    const total      = Math.round(daysScore + freqScore + trendScore + idScore);
    const tier       = total >= 80 ? 'Platinum' : total >= 60 ? 'Gold' : total >= 40 ? 'Silver' : 'Bronze';
    await supabase.from('users').update({ bcs_score: total, bcs_tier: tier }).eq('id', userId);
    return { score: total, tier };
  } catch { return { score: 0, tier: 'Bronze' }; }
}

// ── DATE HELPERS ──────────────────────────────────────────────
export function daysUntilNextFirst() {
  const now  = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.max(0, Math.ceil((next - now) / 86400000));
}

export function nextFirstLabel() {
  const now = new Date();
  const d   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function getContributionDueInfo(group, userPayments) {
  const now       = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const paidThisMonth = (userPayments || []).some(p => {
    if (!['completed', 'paid'].includes(p.status)) return false;
    if (p.group_id !== group.id && p.group_id !== undefined) return false;
    const pd = new Date(p.paid_at || p.created_at);
    const pm = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`;
    return pm === thisMonth;
  });
  const targetMonth = paidThisMonth
    ? new Date(now.getFullYear(), now.getMonth() + 2, 1)
    : new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysLeft = Math.max(0, Math.ceil((targetMonth - now) / 86400000));
  return {
    label:       targetMonth.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    daysLeft,
    paidAlready: paidThisMonth
  };
}
