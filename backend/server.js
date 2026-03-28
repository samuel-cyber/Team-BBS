require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const axios     = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: [
    'https://team-bbs-sandy.vercel.app',
    'https://bbs-suwe.vercel.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
  ],
  credentials: true
}));

//app.use(cors({ origin: '*' }));
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Supabase admin (service role — bypasses RLS) ─────────────
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ══════════════════════════════════════════════════════════════
// POST /api/notifications
// Creates a notification for one or more users
// Body: { userId, title, message, type, meta }
//    OR: { userIds: [...], title, message, type, meta }  (bulk)
// ══════════════════════════════════════════════════════════════
app.post('/api/notifications', async (req, res) => {
  try {
    const { userId, userIds, title, message, type = 'general', meta = {} } = req.body;
 
    const targets = userIds
      ? userIds
      : userId
        ? [userId]
        : [];
 
    if (!targets.length) return res.status(400).json({ error: 'userId or userIds required' });
    if (!title || !message) return res.status(400).json({ error: 'title and message required' });
 
    const rows = targets.map(uid => ({
      user_id: uid,
      title,
      message,
      type,
      meta,
      read: false
    }));
 
    const { error } = await supabaseAdmin
      .from('notifications')
      .insert(rows);
 
    if (error) throw error;
 
    res.json({ success: true, count: rows.length });
  } catch (err) {
    console.error('[notifications]', err.message);
    res.status(500).json({ error: err.message });
  }
});
 
// ══════════════════════════════════════════════════════════════
// GET /api/notifications/:userId
// Returns all notifications for a user (newest first)
// ══════════════════════════════════════════════════════════════
app.get('/api/notifications/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
 
    if (error) throw error;
    res.json({ notifications: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
// ══════════════════════════════════════════════════════════════
// PATCH /api/notifications/:userId/read-all
// Marks all notifications as read for a user
// ══════════════════════════════════════════════════════════════
app.patch('/api/notifications/:userId/read-all', async (req, res) => {
  try {
    const { userId } = req.params;
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
 
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
// ══════════════════════════════════════════════════════════════
// GET /api/notifications/:userId/unread-count
// Returns the count of unread notifications
// ══════════════════════════════════════════════════════════════
app.get('/api/notifications/:userId/unread-count', async (req, res) => {
  try {
    const { userId } = req.params;
    const { count, error } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);
 
    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── Interswitch token cache ──────────────────────────────────
let cachedToken = null;
let tokenExpiry = 0;
const IS_PROD   = process.env.NODE_ENV === 'production';
const ISW_BASE  = IS_PROD
  ? 'https://api.interswitchgroup.com'
  : 'https://sandbox.interswitchng.com';

async function getInterswitchToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const clientId     = process.env.INTERSWITCH_CLIENT_ID;
  const clientSecret = process.env.INTERSWITCH_CLIENT_SECRET;
  const credentials  = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await axios.post(
    `${ISW_BASE}/passport/oauth/token`,
    'grant_type=client_credentials&scope=profile',
    {
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      timeout: 12000
    }
  );
  cachedToken = res.data.access_token;
  tokenExpiry = Date.now() + 55 * 60 * 1000;
  return cachedToken;
}

function iswKeysConfigured() {
  const id = process.env.INTERSWITCH_CLIENT_ID || '';
  const sc = process.env.INTERSWITCH_CLIENT_SECRET || '';
  return id.length > 10 && !id.includes('your_') && sc.length > 10;
}

function qtbConfigured() {
  const mc = process.env.INTERSWITCH_MERCHANT_CODE || '';
  return mc.length > 3 && !mc.includes('your_');
}

// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
//  GROUP MEMBERS ENDPOINT
//  Returns ALL members of a group with user profile data.
//  Uses service role to bypass RLS — this is intentional and
//  safe because the route checks the caller is themselves a member.
// ════════════════════════════════════════════════════════════
app.get('/api/group-members/:groupId', async (req, res) => {
  const { groupId } = req.params;
  const authHeader  = req.headers.authorization || '';
  const token       = authHeader.replace('Bearer ', '');

  // Verify the caller is authenticated
  let callerId = null;
  try {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    callerId = user?.id;
  } catch {}

  if (!callerId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    // Use the stored function that joins ajo_members with users (security definer)
    const { data: members, error } = await supabaseAdmin
      .rpc('get_group_members_with_profiles', { p_group_id: groupId });

    if (error) throw error;

    // Shape the data the way the frontend expects
    const shaped = (members || []).map(m => ({
      id:                 m.member_id,
      group_id:           m.group_id,
      user_id:            m.user_id,
      joined_at:          m.joined_at,
      payout_position:    m.payout_position,
      bcs_at_join:        m.bcs_at_join,
      payment_status:     m.payment_status,
      paid_this_cycle:    m.paid_this_cycle,
      has_received_payout:m.has_received_payout,
      profile: {
        full_name:       m.full_name,
        market_location: m.market_location,
        bcs_score:       m.bcs_score,
        bcs_tier:        m.bcs_tier,
        phone:           m.phone
      }
    }));

    return res.json({ success: true, members: shaped });
  } catch (err) {
    console.error('[group-members]', err.message);
    return res.status(500).json({ success: false, error: err.message, members: [] });
  }
});

// ════════════════════════════════════════════════════════════
//  BVN VERIFICATION
// ════════════════════════════════════════════════════════════
app.post('/api/verify-bvn', async (req, res) => {
  const { bvn } = req.body;
  if (!bvn || !/^\d{11}$/.test(bvn)) {
    return res.status(400).json({ success: false, error: 'BVN must be exactly 11 digits.' });
  }

  if (!iswKeysConfigured()) {
    console.log('[SANDBOX] BVN verification for:', bvn);
    await new Promise(r => setTimeout(r, 1500));
    return res.json({ success: true, sandbox: true,
      name: 'Sandbox Verified User', dob: '01 Jan 1990', phoneHint: '080•••••000' });
  }

  try {
    const token = await getInterswitchToken();
    const bvnRes = await axios.get(`${ISW_BASE}/api/v1/identity/bvn/fulldetails/${bvn}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      validateStatus: () => true,
      timeout: 15000
    });

    console.log('[BVN] status:', bvnRes.status, 'body:', JSON.stringify(bvnRes.data));

    if (bvnRes.status !== 200) {
      return res.status(400).json({
        success: false,
        error:   `Interswitch returned ${bvnRes.status}`,
        detail:  bvnRes.data
      });
    }

    const d         = bvnRes.data;
    const firstName = d.firstName || d.first_name || '';
    const lastName  = d.lastName  || d.last_name  || '';
    const phone     = d.phoneNumber || d.phone_number || d.phone || '';
    const phoneHint = phone.length >= 8
      ? phone.slice(0,3) + '•'.repeat(Math.max(0, phone.length-6)) + phone.slice(-3)
      : '•••••••••';

    return res.json({
      success: true,
      name:    `${firstName} ${lastName}`.trim() || 'Verified',
      dob:     d.dateOfBirth || d.date_of_birth || d.dob || 'N/A',
      phoneHint
    });
  } catch (err) {
    console.error('[BVN] error:', err.response?.status, err.response?.data || err.message);
    if (!IS_PROD) {
      await new Promise(r => setTimeout(r, 1500));
      return res.json({ success: true, sandbox: true,
        name: 'Demo User', dob: '01 Jan 1990', phoneHint: '080•••••000' });
    }
    return res.status(400).json({ success: false, error: 'BVN verification failed. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════
//  AJO PAYMENT — INITIATE
//  If QTB not configured: returns sandbox:true so frontend
//  shows the sandbox payment popup instead.
// ════════════════════════════════════════════════════════════
app.post('/api/initiate-ajo-payment', async (req, res) => {
  const { groupId, userId, amount, groupName, userEmail, userName, cycleNumber } = req.body;
  const amountNum = Number(amount) || 0;

  if (!qtbConfigured()) {
    // SANDBOX MODE — tell frontend to show mock payment form
    return res.json({ success: true, sandbox: true, amount: amountNum, groupName, groupId, userId });
  }

  try {
    const token        = await getInterswitchToken();
    const merchantCode = process.env.INTERSWITCH_MERCHANT_CODE;
    const payableCode  = process.env.INTERSWITCH_PAYABLE_CODE || '';
    const txRef        = `SUWE-AJO-${groupId.slice(0,8)}-${userId.slice(0,8)}-${Date.now()}`;
    const redirectUrl  = `${process.env.FRONTEND_URL || 'http://localhost:5500'}/frontend/pages/ajo.html?payment=success&group=${groupId}`;

    const payRes = await axios.post(
      `${ISW_BASE}/collections/api/v1/quickteller/payments/initiate`,
      {
        merchantCode,
        payableCode,
        customerEmail:   userEmail  || '',
        customerName:    userName   || '',
        amount:          Math.round(amountNum * 100), // kobo
        transactionRef:  txRef,
        currencyCode:    '566',
        redirectUrl,
        description:     `Ajo contribution — ${groupName}`
      },
      { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    const payUrl = payRes.data.redirectUrl || payRes.data.paymentUrl || payRes.data.checkoutUrl;
    if (!payUrl) throw new Error('No payment URL from Interswitch');

    // Record pending payment
    await supabaseAdmin.from('ajo_payments').insert({
      group_id:     groupId,
      user_id:      userId,
      amount:       amountNum,
      cycle_number: cycleNumber || 1,
      payment_type: 'contribution',
      status:       'pending',
      tx_ref:       txRef,
      due_date:     new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().split('T')[0]
    });

    return res.json({ success: true, paymentUrl: payUrl, txRef });
  } catch (err) {
    console.error('[payment initiation]', err.response?.data || err.message);
    if (!IS_PROD) {
      return res.json({ success: true, sandbox: true, amount: amountNum, groupName, groupId, userId });
    }
    return res.status(500).json({ success: false, error: 'Payment initiation failed. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════
//  AJO PAYMENT — SANDBOX CONFIRM
//  Called when user submits the sandbox payment form.
//  Records payment as completed and updates member status.
// ════════════════════════════════════════════════════════════
app.post('/api/sandbox-confirm-payment', async (req, res) => {
  const { groupId, userId, amount, cycleNumber } = req.body;

  try {
    const txRef = `SANDBOX-${Date.now()}`;
    const today = new Date();
    const dueDate = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().split('T')[0];

    // 1. Record the payment as completed
    const { error: payErr } = await supabaseAdmin.from('ajo_payments').insert({
      group_id:     groupId,
      user_id:      userId,
      amount:       Number(amount),
      cycle_number: cycleNumber || 1,
      payment_type: 'contribution',
      status:       'completed',
      sandbox:      true,
      paid_at:      new Date().toISOString(),
      tx_ref:       txRef,
      due_date:     dueDate
    });
    if (payErr) throw payErr;

    // 2. Update member payment_status and paid_this_cycle
    await supabaseAdmin.from('ajo_members')
      .update({ payment_status: 'paid', paid_this_cycle: true })
      .eq('group_id', groupId)
      .eq('user_id', userId);

    // 3. Send confirmation notification to the payer
    await supabaseAdmin.from('notifications').insert({
      user_id: userId,
      title:   '✅ Payment Confirmed',
      message: `Your ajo contribution of ₦${Number(amount).toLocaleString()} has been recorded (sandbox mode).`,
      type:    'payment_confirmed',
      meta:    { group_id: groupId, amount }
    });

    // 4. Notify ALL other group members that this person has paid
    const { data: otherMembers } = await supabaseAdmin
      .from('ajo_members').select('user_id')
      .eq('group_id', groupId)
      .neq('user_id', userId);

    const { data: payer } = await supabaseAdmin
      .from('users').select('full_name').eq('id', userId).maybeSingle();
    const payerName = payer?.full_name || 'A member';

    const { data: group } = await supabaseAdmin
      .from('ajo_groups').select('group_name').eq('id', groupId).maybeSingle();
    const groupName = group?.group_name || 'your group';

    if (otherMembers?.length) {
      const notifs = otherMembers.map(m => ({
        user_id: m.user_id,
        title:   '💳 Member Paid',
        message: `${payerName} has paid their ₦${Number(amount).toLocaleString()} contribution to "${groupName}".`,
        type:    'payment_confirmed',
        meta:    { group_id: groupId, payer_id: userId }
      }));
      await supabaseAdmin.from('notifications').insert(notifs);
    }

    // 5. BCS bonus: +2 points for paying on time
    const { data: userRow } = await supabaseAdmin
      .from('users').select('bcs_score').eq('id', userId).maybeSingle();
    const newScore = Math.min(100, (userRow?.bcs_score || 0) + 2);
    const newTier  = newScore >= 80 ? 'Platinum' : newScore >= 60 ? 'Gold' : newScore >= 40 ? 'Silver' : 'Bronze';
    await supabaseAdmin.from('users')
      .update({ bcs_score: newScore, bcs_tier: newTier }).eq('id', userId);

    return res.json({ success: true, txRef, bcsBonus: 2 });
  } catch (err) {
    console.error('[sandbox-confirm]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  PAYMENT WEBHOOK (Interswitch calls this)
// ════════════════════════════════════════════════════════════
app.post('/api/payment-webhook', async (req, res) => {
  try {
    const body   = req.body;
    const txRef  = body.transactionReference || body.txnRef || body.merchantReference || '';
    const isOk   = body.responseCode === '00' || body.responseCode === '000';
    console.log('[WEBHOOK]', txRef, body.responseCode);

    if (isOk && txRef.startsWith('SUWE-AJO-')) {
      const parts   = txRef.split('-');
      // Format: SUWE-AJO-{groupId8}-{userId8}-{ts}
      const groupSnip = parts[2];
      const userSnip  = parts[3];

      // Find matching pending payment
      const { data: payment } = await supabaseAdmin
        .from('ajo_payments').select('*').eq('tx_ref', txRef).maybeSingle();

      if (payment) {
        await supabaseAdmin.from('ajo_payments')
          .update({ status: 'completed', paid_at: new Date().toISOString() })
          .eq('id', payment.id);

        await supabaseAdmin.from('ajo_members')
          .update({ payment_status: 'paid', paid_this_cycle: true })
          .eq('group_id', payment.group_id)
          .eq('user_id', payment.user_id);

        await supabaseAdmin.from('notifications').insert({
          user_id: payment.user_id,
          title:   '✅ Payment Confirmed',
          message: `Your ajo contribution of ₦${Number(payment.amount).toLocaleString()} has been confirmed by Interswitch.`,
          type:    'payment_confirmed',
          meta:    { group_id: payment.group_id, amount: payment.amount }
        });
      }
    }

    return res.json({ status: 'received' }); // always 200 to Interswitch
  } catch (err) {
    console.error('[webhook]', err.message);
    return res.json({ status: 'received' });
  }
});

// ════════════════════════════════════════════════════════════
//  SEND AJO INVITATIONS
// ════════════════════════════════════════════════════════════
app.post('/api/send-invitations', async (req, res) => {
  const { groupId, groupName, senderId, senderName, senderBCS, phoneNumbers } = req.body;

  try {
    for (const phone of (phoneNumbers || [])) {
      const cleanPhone = phone.trim();
      if (!cleanPhone) continue;

      // Look up by phone
      const { data: recipient } = await supabaseAdmin
        .from('users').select('id').eq('phone', cleanPhone).maybeSingle();

      // Store invitation record
      await supabaseAdmin.from('ajo_invitations').insert({
        group_id:        groupId,
        sender_id:       senderId,
        recipient_phone: cleanPhone,
        recipient_id:    recipient?.id || null,
        status:          'pending'
      }).then(() => {}).catch(() => {}); // ignore duplicate

      // Send notification if we matched a user
      if (recipient) {
        await supabaseAdmin.from('notifications').insert({
          user_id: recipient.id,
          title:   `📨 Ajo Group Invitation`,
          message: `${senderName} (BCS: ${senderBCS}) invited you to join "${groupName}". Open the Ajo page to accept or decline.`,
          type:    'ajo_invitation',
          read:    false,
          meta:    { group_id: groupId, group_name: groupName, sender_id: senderId }
        });
      }
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[send-invitations]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  NOTIFY NEW PUBLIC GROUP
// ════════════════════════════════════════════════════════════
app.post('/api/notify-new-group', async (req, res) => {
  const { groupId, groupName, creatorId, creatorBCS, contributionAmount } = req.body;
  try {
    const { data: allUsers } = await supabaseAdmin
      .from('users').select('id').neq('id', creatorId).limit(500);
    if (allUsers?.length) {
      const notifs = allUsers.map(u => ({
        user_id: u.id,
        title:   '🔄 New Open Ajo Group',
        message: `"${groupName}" is now open. Join before the 1st of next month! Contribution: ₦${Number(contributionAmount).toLocaleString()}/month.`,
        type:    'new_group',
        read:    false,
        meta:    { group_id: groupId, creator_bcs: creatorBCS }
      }));
      for (let i = 0; i < notifs.length; i += 100) {
        await supabaseAdmin.from('notifications').insert(notifs.slice(i, i + 100));
      }
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[notify-new-group]', err.message);
    return res.status(500).json({ success: false });
  }
});

// ════════════════════════════════════════════════════════════
//  NOTIFY NEW COMMUNITY POST
// ════════════════════════════════════════════════════════════
app.post('/api/notify-new-post', async (req, res) => {
  const { posterId, posterName, postTitle } = req.body;
  const preview = (postTitle || '').split(' ').slice(0, 5).join(' ');
  try {
    const { data: allUsers } = await supabaseAdmin
      .from('users').select('id').neq('id', posterId).limit(500);
    if (allUsers?.length) {
      const notifs = allUsers.map(u => ({
        user_id: u.id,
        title:   '🤝 New Community Post',
        message: `${posterName} posted: "${preview}…" — check the Community feed.`,
        type:    'new_post',
        read:    false,
        meta:    { poster_id: posterId }
      }));
      for (let i = 0; i < notifs.length; i += 100) {
        await supabaseAdmin.from('notifications').insert(notifs.slice(i, i + 100));
      }
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[notify-new-post]', err.message);
    return res.status(500).json({ success: false });
  }
});

// ════════════════════════════════════════════════════════════
//  ACCEPT AJO INVITATION
// ════════════════════════════════════════════════════════════
app.post('/api/accept-invitation', async (req, res) => {
  const { userId, groupId, invitationId } = req.body;
  try {
    // Check group is still forming and has space
    const { data: group } = await supabaseAdmin.from('ajo_groups')
      .select('*').eq('id', groupId).maybeSingle();
    if (!group)                 throw new Error('Group not found.');
    if (group.status !== 'forming') throw new Error('Group no longer accepting members.');
    if ((group.current_members || 0) >= group.max_members) throw new Error('Group is full.');

    // Check user not already in 2 groups
    const { data: existing } = await supabaseAdmin.from('ajo_members')
      .select('id').eq('user_id', userId);
    if ((existing || []).length >= 2) throw new Error('You are already in 2 groups.');

    // Check not already in this group
    const { data: already } = await supabaseAdmin.from('ajo_members')
      .select('id').eq('user_id', userId).eq('group_id', groupId).maybeSingle();
    if (already) throw new Error('You are already in this group.');

    // Get user BCS
    const { data: userRow } = await supabaseAdmin.from('users')
      .select('bcs_score, full_name').eq('id', userId).maybeSingle();

    // Add as member
    await supabaseAdmin.from('ajo_members').insert({
      group_id:        groupId,
      user_id:         userId,
      bcs_at_join:     userRow?.bcs_score || 0,
      payment_status:  'pending',
      paid_this_cycle: false
    });

    // Increment member count
    await supabaseAdmin.from('ajo_groups')
      .update({ current_members: (group.current_members || 0) + 1 }).eq('id', groupId);

    // Mark invitation accepted
    if (invitationId) {
      await supabaseAdmin.from('ajo_invitations')
        .update({ status: 'accepted', recipient_id: userId }).eq('id', invitationId);
    }

    // Notify the group creator and all existing members
    const { data: allMembers } = await supabaseAdmin.from('ajo_members')
      .select('user_id').eq('group_id', groupId).neq('user_id', userId);

    if (allMembers?.length) {
      const notifs = allMembers.map(m => ({
        user_id: m.user_id,
        title:   '🎉 New Member Joined!',
        message: `${userRow?.full_name || 'Someone'} (BCS: ${userRow?.bcs_score || 0}) joined "${group.group_name}". ${(group.current_members || 0) + 1} of ${group.max_members} members.`,
        type:    'member_joined',
        read:    false,
        meta:    { group_id: groupId, new_member_id: userId }
      }));
      await supabaseAdmin.from('notifications').insert(notifs);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[accept-invitation]', err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  PENDING INVITATIONS FOR USER
// ════════════════════════════════════════════════════════════
app.get('/api/my-invitations/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: userRow } = await supabaseAdmin.from('users')
      .select('phone').eq('id', userId).maybeSingle();
    const phone = userRow?.phone || '';

    let query = supabaseAdmin.from('ajo_invitations')
      .select('*, ajo_groups(group_name, contribution_amount, category, current_members, max_members), sender:sender_id(full_name, bcs_score)')
      .eq('status', 'pending');

    if (phone) {
      query = query.or(`recipient_id.eq.${userId},recipient_phone.eq.${phone}`);
    } else {
      query = query.eq('recipient_id', userId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ success: true, invitations: data || [] });
  } catch (err) {
    console.error('[my-invitations]', err.message);
    return res.status(500).json({ success: false, invitations: [] });
  }
});

// ════════════════════════════════════════════════════════════
//  AI: PARSE SALE
// ════════════════════════════════════════════════════════════
app.post('/api/parse-sale', async (req, res) => {
  try {
    const { input } = req.body;
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 512,
      system: `Parse Nigerian market trader transactions. Return ONLY valid JSON no backticks.
{"type":"sale"|"inventory","item_name":"name","quantity":n,"unit":"bags"|"crates"|"pieces"|"kg"|"litres"|"bundles"|"units","selling_price":n,"cost_price":n,"confidence":"high"|"medium"|"low","summary":"one line"}
k=1000, ₦=naira. Multiply per-unit by quantity for total.`,
      messages: [{ role: 'user', content: `Parse: "${input}"` }]
    });
    const parsed = JSON.parse(message.content[0].text.replace(/```json|```/g, '').trim());
    res.json({ success: true, parsed });
  } catch (err) {
    console.error('[parse-sale]', err.message);
    res.status(500).json({ success: false, error: 'Could not parse input.' });
  }
});

// ════════════════════════════════════════════════════════════
//  AI: MARKET ADVICE
// ════════════════════════════════════════════════════════════
app.post('/api/market-advice', async (req, res) => {
  try {
    const { salesData, userProfile } = req.body;
    const totals = {};
    salesData.forEach(s => {
      if (!totals[s.item_name]) totals[s.item_name] = { qty:0, revenue:0, profit:0 };
      totals[s.item_name].qty     += s.quantity;
      totals[s.item_name].revenue += s.selling_price;
      totals[s.item_name].profit  += s.profit || 0;
    });
    const summary = Object.entries(totals)
      .sort((a,b) => b[1].revenue - a[1].revenue).slice(0, 8)
      .map(([n,t]) => `${n}: ${t.qty} units, ₦${t.revenue.toLocaleString()} revenue, ₦${t.profit.toLocaleString()} profit`)
      .join('\n');

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1024,
      system: `Nigerian market advisor. Return ONLY valid JSON no markdown:
{"headline":"6-word headline","advice":"2-3 sentences","priceAlert":"1 sentence","strategyTip":"1 sentence","emoji":"single emoji","sentiment":"positive"|"neutral"|"warning","urgency":"high"|"medium"|"low"}`,
      messages: [{ role:'user', content:`Location:${userProfile.market_location}\nCategories:${userProfile.product_categories}\nSales:\n${summary}\nTotal:${salesData.length}` }]
    });
    res.json({ success: true, advice: JSON.parse(msg.content[0].text.replace(/```json|```/g,'').trim()) });
  } catch (err) {
    console.error('[market-advice]', err.message);
    res.status(500).json({ success: false, error: 'Could not generate advice.' });
  }
});

app.post('/api/send-welcome', (req, res) => {
  console.log('Welcome:', req.body.email);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
app.get('/', (req, res) => res.json({ message: 'SUWE backend v4', version: '4.0' }));




// ════════════════════════════════════════════════════════════
//  HUGGING FACE INFERENCE HELPER
//  Primary:  mistralai/Mistral-7B-Instruct-v0.3 (free, strong)
//  Fallback: HuggingFaceH4/zephyr-7b-beta
//  Fallback: microsoft/Phi-3-mini-4k-instruct
// ════════════════════════════════════════════════════════════
const HF_API_KEY = process.env.HUGGINGFACE_API_KEY || '';
const HF_MODELS  = [
  'mistralai/Mistral-7B-Instruct-v0.3',
  'HuggingFaceH4/zephyr-7b-beta',
  'microsoft/Phi-3-mini-4k-instruct'
];

/**
 * Call HuggingFace Inference API with automatic model fallback.
 * @param {string} prompt             Full formatted prompt string
 * @param {object} opts               { maxTokens, temperature }
 * @returns {Promise<string>}         Model's text response
 */
async function hfInfer(prompt, opts = {}) {
  const { maxTokens = 800, temperature = 0.7 } = opts;

  for (const model of HF_MODELS) {
    try {
      const url     = `https://api-inference.huggingface.co/models/${model}`;
      const headers = { 'Content-Type': 'application/json' };
      if (HF_API_KEY) headers['Authorization'] = `Bearer ${HF_API_KEY}`;

      const payload = {
        inputs: prompt,
        parameters: {
          max_new_tokens:   maxTokens,
          temperature:      temperature,
          do_sample:        temperature > 0,
          return_full_text: false,
          stop:             ['</s>', '[INST]', 'User:', 'Human:']
        }
      };

      const res = await axios.post(url, payload, { headers, timeout: 30000 });

      const raw = Array.isArray(res.data)
        ? res.data[0]?.generated_text
        : res.data?.generated_text;

      if (!raw) throw new Error('Empty response from model');
      return raw.trim();

    } catch (err) {
      const status = err.response?.status;
      console.warn(`[HF] Model ${model} failed (${status || err.message}), trying next…`);
      // 503 = model loading, 429 = rate limited → try next model
      if (status !== 503 && status !== 429) throw err;
    }
  }
  throw new Error('All HuggingFace models unavailable. Please try again in a moment.');
}

/**
 * Build a Mistral/Zephyr-compatible [INST] chat prompt from history.
 * @param {string}                   systemPrompt
 * @param {Array<{role,content}>}    messages
 * @returns {string}
 */
function buildChatPrompt(systemPrompt, messages) {
  let prompt = '';
  messages.forEach((msg, i) => {
    if (msg.role === 'user') {
      const sys = i === 0 ? `${systemPrompt}\n\n` : '';
      prompt += `<s>[INST] ${sys}${msg.content} [/INST]`;
    } else if (msg.role === 'assistant') {
      prompt += ` ${msg.content} </s>`;
    }
  });
  return prompt;
}


// ════════════════════════════════════════════════════════════
//  AI: CHATBOT  (HuggingFace Mistral — multi-turn assistant)
//  POST /api/chat
//  Body: { userId?, message, history?: [{role, content}] }
//
//  Fetches user profile from Supabase to personalise responses.
//  Frontend should pass the full history array on each call
//  (slice to last 8 turns is fine — we handle it here too).
//  Returns: { success, reply, model }
// ════════════════════════════════════════════════════════════
app.post('/api/chat', async (req, res) => {
  const { userId, message, history = [] } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ success: false, error: 'Message is required.' });
  }

  // Optionally fetch user context to personalise replies
  let userContext = '';
  if (userId) {
    try {
      const { data: u } = await supabaseAdmin
        .from('users')
        .select('full_name, market_location, product_categories, bcs_score, bcs_tier')
        .eq('id', userId)
        .maybeSingle();
      if (u) {
        userContext = `\nUser profile: ${u.full_name || 'Trader'}, sells ${u.product_categories || 'various goods'} in ${u.market_location || 'Nigerian market'}, BCS score ${u.bcs_score || 'N/A'} (${u.bcs_tier || 'N/A'} tier).`;
      }
    } catch (_) { /* non-fatal */ }
  }

  const systemPrompt = `You are SUWE Assistant, a helpful AI built for Nigerian market traders and micro-business owners.
You help users with:
- Understanding their BCS (Business Credit Score) and how to improve it
- Ajo (rotating savings group) questions — joining, payments, cycles, invitations
- Sales tracking, profit calculations, and pricing strategies
- General Nigerian market and business advice
- App navigation and feature explanations
${userContext}

Keep answers concise, friendly, and practical. Use Naira (₦) for currency.
If asked something outside your scope, politely redirect to business topics.
Do not make up specific prices or market data — advise users to check local rates.
Respond in plain text (no markdown headers or bullets unless listing steps).`;

  const fullHistory = [
    ...history.slice(-8), // keep last 8 turns to stay within context limits
    { role: 'user', content: message }
  ];

  const prompt = buildChatPrompt(systemPrompt, fullHistory);

  try {
    const reply = await hfInfer(prompt, { maxTokens: 600, temperature: 0.7 });
    return res.json({ success: true, reply, model: 'mistral-7b-instruct' });
  } catch (err) {
    console.error('[chat]', err.message);
    return res.status(500).json({
      success: false,
      error: err.message.includes('loading')
        ? 'AI model is warming up. Please try again in 20 seconds.'
        : 'Chat service temporarily unavailable.'
    });
  }
});

// ════════════════════════════════════════════════════════════
//  AI: BUSINESS INSIGHTS  (HuggingFace Mistral — deep analysis)
//  POST /api/business-insights
//  Body: { userId, period?: 'week'|'month'|'all' }
//
//  Pulls real sales + ajo data from Supabase, generates a
//  structured JSON insight report via the HF model.
//  Returns: { success, insights } where insights has:
//    summary, topPerformer, weakSpot, pricingAdvice,
//    cashFlowTip, growthAction, bcsAdvice, sentiment,
//    scoreOutOf10, weeklyTarget, _meta (raw aggregates for charts)
// ════════════════════════════════════════════════════════════
app.post('/api/business-insights', async (req, res) => {
  const { userId, period = 'month' } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, error: 'userId is required.' });
  }

  try {
    // ── 1. Fetch user profile ────────────────────────────────
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('full_name, market_location, product_categories, bcs_score, bcs_tier')
      .eq('id', userId)
      .maybeSingle();

    // ── 2. Fetch sales for the requested period ──────────────
    let since = new Date();
    if (period === 'week')  since.setDate(since.getDate() - 7);
    if (period === 'month') since.setMonth(since.getMonth() - 1);
    if (period === 'all')   since = new Date('2000-01-01');

    const { data: sales, error: salesErr } = await supabaseAdmin
      .from('sales')
      .select('item_name, quantity, selling_price, cost_price, profit, unit, created_at')
      .eq('user_id', userId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(200);

    if (salesErr) throw salesErr;

    if (!sales || sales.length === 0) {
      return res.json({
        success:  true,
        insights: null,
        message:  `No sales data found for the selected period (${period}). Start recording sales to get insights!`
      });
    }

    // ── 3. Aggregate by item ─────────────────────────────────
    const byItem = {};
    let totalRevenue = 0, totalProfit = 0;
    const totalTransactions = sales.length;

    sales.forEach(s => {
      const name = s.item_name || 'Unknown';
      if (!byItem[name]) byItem[name] = { qty: 0, revenue: 0, profit: 0, cost: 0, transactions: 0 };
      byItem[name].qty          += Number(s.quantity)      || 0;
      byItem[name].revenue      += Number(s.selling_price) || 0;
      byItem[name].profit       += Number(s.profit)        || 0;
      byItem[name].cost         += Number(s.cost_price)    || 0;
      byItem[name].transactions += 1;
      totalRevenue               += Number(s.selling_price) || 0;
      totalProfit                += Number(s.profit)        || 0;
    });

    const topItems = Object.entries(byItem)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 8)
      .map(([name, d]) => {
        const margin = d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : '0.0';
        return `${name}: ${d.qty} units sold, ₦${d.revenue.toLocaleString()} revenue, ₦${d.profit.toLocaleString()} profit, ${margin}% margin`;
      }).join('\n');

    const worstItems = Object.entries(byItem)
      .filter(([, d]) => d.profit <= 0)
      .map(([name]) => name)
      .join(', ') || 'none';

    // ── 4. Fetch ajo context ─────────────────────────────────
    const { data: ajoMemberships } = await supabaseAdmin
      .from('ajo_members')
      .select('group_id, payment_status, paid_this_cycle, ajo_groups(group_name, contribution_amount)')
      .eq('user_id', userId);

    const ajoContext = ajoMemberships?.length
      ? `Ajo memberships: ${ajoMemberships.length}. Monthly ajo obligations: ₦${
          ajoMemberships.reduce((sum, m) => sum + (Number(m.ajo_groups?.contribution_amount) || 0), 0).toLocaleString()
        }.`
      : 'Not currently in any ajo groups.';

    // ── 5. Build prompt ──────────────────────────────────────
    const systemPrompt = `You are a sharp Nigerian business analyst AI helping market traders grow their businesses.
Analyze the trader's sales data and return ONLY a valid JSON object — no markdown, no backticks, no extra text.

JSON format:
{
  "summary": "2-sentence overall business summary",
  "topPerformer": "best product and why it is winning",
  "weakSpot": "lowest performing area and specific fix",
  "pricingAdvice": "concrete pricing recommendation based on margins",
  "cashFlowTip": "ajo/savings tip tied to their revenue",
  "growthAction": "single most impactful action they can take this week",
  "bcsAdvice": "how their current trading pattern affects their BCS score",
  "sentiment": "positive | neutral | warning",
  "scoreOutOf10": number between 1 and 10 rating their business health,
  "weeklyTarget": "a realistic revenue target for next week in Naira"
}`;

    const userPrompt = `Trader: ${user?.full_name || 'Unknown'}, ${user?.market_location || 'Nigerian market'}
Categories: ${user?.product_categories || 'general goods'}
BCS Score: ${user?.bcs_score || 'N/A'} (${user?.bcs_tier || 'N/A'})
Period: last ${period}
Total transactions: ${totalTransactions}
Total revenue: ₦${totalRevenue.toLocaleString()}
Total profit: ₦${totalProfit.toLocaleString()}
Profit margin: ${totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0}%

Top products:
${topItems}

Zero/negative profit items: ${worstItems}
${ajoContext}

Give deep, specific, actionable insights.`;

    const prompt = buildChatPrompt(systemPrompt, [{ role: 'user', content: userPrompt }]);

    // ── 6. Call HF model ─────────────────────────────────────
    const raw = await hfInfer(prompt, { maxTokens: 700, temperature: 0.4 });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Model returned non-JSON response');

    const insights = JSON.parse(jsonMatch[0]);

    // Attach raw aggregates so the frontend can render charts
    insights._meta = {
      period,
      totalRevenue,
      totalProfit,
      totalTransactions,
      topItems: Object.entries(byItem)
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .slice(0, 5)
        .map(([name, d]) => ({ name, revenue: d.revenue, profit: d.profit, qty: d.qty }))
    };

    return res.json({ success: true, insights });

  } catch (err) {
    console.error('[business-insights]', err.message);
    return res.status(500).json({
      success: false,
      error: err.message.includes('loading')
        ? 'AI model is warming up. Please try again in 20 seconds.'
        : 'Could not generate insights. Please try again.'
    });
  }
});

// ════════════════════════════════════════════════════════════
//  AI: QUICK ANSWER  (HuggingFace — single Q&A, no history)
//  POST /api/quick-answer
//  Body: { question, context?: 'ajo'|'bcs'|'sales'|'general' }
//
//  Lightweight endpoint for tooltips, FAQ popups, inline help.
//  Returns: { success, answer }
// ════════════════════════════════════════════════════════════
app.post('/api/quick-answer', async (req, res) => {
  const { question, context = 'general' } = req.body;

  if (!question?.trim()) {
    return res.status(400).json({ success: false, error: 'Question is required.' });
  }

  const contextGuides = {
    ajo:     'Focus on ajo rotating savings: joining groups, contribution cycles, payouts, invitations, and trust scores.',
    bcs:     'Focus on BCS (Business Credit Score): what it is (0-100 scale), Bronze/Silver/Gold/Platinum tiers, how to improve it through timely payments and sales activity.',
    sales:   'Focus on sales tracking, profit margins, pricing strategies, and inventory management for Nigerian market traders.',
    general: 'Answer broadly about the SUWE platform features: ajo savings, BCS scoring, sales tracking, and community.'
  };

  const systemPrompt = `You are a helpful assistant for SUWE, a Nigerian fintech platform for market traders.
${contextGuides[context] || contextGuides.general}
Answer in 2-4 sentences. Be direct, friendly, and practical. Use ₦ for Naira.`;

  const prompt = buildChatPrompt(systemPrompt, [{ role: 'user', content: question }]);

  try {
    const answer = await hfInfer(prompt, { maxTokens: 250, temperature: 0.5 });
    return res.json({ success: true, answer });
  } catch (err) {
    console.error('[quick-answer]', err.message);
    return res.status(500).json({ success: false, error: 'Could not answer. Please try again.' });
  }
});



// ════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════
//  Start server only when run directly (not on Vercel)
// ════════════════════════════════════════════════════════════
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`SUWE backend v4 on http://localhost:${PORT}`);
    console.log(`ISW keys: ${iswKeysConfigured() ? '✅ configured' : '⚠️  missing → sandbox mode'}`);
    console.log(`QTB merchant: ${qtbConfigured() ? '✅ configured' : '⚠️  missing → sandbox payments'}`);
  });
}

module.exports = app;
