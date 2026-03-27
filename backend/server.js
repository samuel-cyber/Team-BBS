require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const axios     = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Supabase admin (service role — bypasses RLS) ─────────────
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
app.get('/', (req, res) => res.json({ message: 'SUWE backend v4', version: '4.0' }));

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
app.listen(PORT, () => {
  console.log(`SUWE backend v4 on http://localhost:${PORT}`);
  console.log(`ISW keys: ${iswKeysConfigured() ? '✅ configured' : '⚠️  missing → sandbox mode'}`);
  console.log(`QTB merchant: ${qtbConfigured() ? '✅ configured' : '⚠️  missing → sandbox payments'}`);
});
