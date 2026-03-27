// ============================================================
//  SUWE — feed.js
//  Supabase integration for the Community Feed page.
//
//  HOW TO USE:
//  1. Replace SUPABASE_URL and SUPABASE_ANON_KEY below
//  2. Add this to feed.html:
//     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//     <script src="feed.js"></script>
//  3. Remove the hardcoded `posts` array and `renderFeed()` call
//     from feed.html — this file takes over completely.
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ─── CONFIG ─────────────────────────────────────────────────
const SUPABASE_URL      = 'https://jqfmybadioqbmrkrsvbl.supabase.co;
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZm15YmFkaW9xYm1ya3JzdmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNjczMTIsImV4cCI6MjA4OTg0MzMxMn0.R58UVPxWfNoyOwKB3qIelhp35zcmNcVMhgWwSEpDkE4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// ============================================================
//  AUTH HELPERS
// ============================================================

/** Returns the currently logged-in user, or null */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Returns the full profile row for a given user id */
export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) { console.error('getProfile:', error); return null; }
  return data;
}


// ============================================================
//  FEED — FETCH POSTS
// ============================================================

/**
 * Fetch posts for the feed with optional filters.
 *
 * @param {object} opts
 * @param {string}   opts.market_slug  - 'all' | 'balogun' | 'mile12' | etc.
 * @param {string}   opts.category     - 'all' | 'food' | 'fabric' | 'general'
 * @param {boolean}  opts.following    - if true, only show posts by followed traders
 * @param {string}   opts.userId       - required when following=true
 * @param {number}   opts.limit        - default 20
 * @param {number}   opts.offset       - for pagination, default 0
 */
export async function fetchPosts({
  market_slug = 'all',
  category    = 'all',
  following   = false,
  userId      = null,
  limit       = 20,
  offset      = 0
} = {}) {

  let query = supabase
    .from('feed_posts')          // uses our helper view
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Market filter
  if (market_slug && market_slug !== 'all') {
    query = query.eq('market_slug', market_slug);
  }

  // Category filter
  if (category && category !== 'all') {
    query = query.eq('category', category);
  }

  // Following filter — fetch who the user follows first
  if (following && userId) {
    const followedIds = await getFollowingIds(userId);
    if (followedIds.length === 0) return []; // following nobody yet
    query = query.in('author_id', followedIds);
  }

  const { data, error } = await query;
  if (error) { console.error('fetchPosts:', error); return []; }
  return data;
}

/** Returns array of profile IDs that userId is following */
async function getFollowingIds(userId) {
  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);

  if (error) { console.error('getFollowingIds:', error); return []; }
  return data.map(r => r.following_id);
}


// ============================================================
//  FEED — FETCH COMMENTS FOR A POST
// ============================================================

export async function fetchComments(postId) {
  const { data, error } = await supabase
    .from('comments')
    .select(`
      id,
      body,
      created_at,
      author:profiles ( id, full_name, avatar_color, avatar_tc )
    `)
    .eq('post_id', postId)
    .eq('deleted', false)
    .order('created_at', { ascending: true });

  if (error) { console.error('fetchComments:', error); return []; }
  return data;
}


// ============================================================
//  FEED — CREATE A POST
// ============================================================

/**
 * Creates a new post.
 *
 * @param {object} post
 * @param {string} post.type     - 'update' | 'price' | 'bulk' | 'ajo'
 * @param {string} post.body     - main text
 * @param {string} post.market
 * @param {string} post.market_slug
 * @param {string} post.category - 'food' | 'fabric' | 'general'
 * @param {object} post.meta     - type-specific fields (see schema comments)
 */
export async function createPost(post) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Not logged in' };

  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id:   user.id,
      type:        post.type,
      body:        post.body,
      market:      post.market,
      market_slug: post.market_slug,
      category:    post.category,
      meta:        post.meta || {}
    })
    .select()
    .single();

  if (error) { console.error('createPost:', error); return { success: false, error }; }
  return { success: true, post: data };
}

/** Soft-deletes a post (sets deleted=true). Only works on your own posts. */
export async function deletePost(postId) {
  const { error } = await supabase
    .from('posts')
    .update({ deleted: true })
    .eq('id', postId);

  if (error) { console.error('deletePost:', error); return false; }
  return true;
}


// ============================================================
//  COMMENTS
// ============================================================

export async function createComment(postId, body) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Not logged in' };

  const { data, error } = await supabase
    .from('comments')
    .insert({ post_id: postId, author_id: user.id, body })
    .select(`
      id, body, created_at,
      author:profiles ( id, full_name, avatar_color, avatar_tc )
    `)
    .single();

  if (error) { console.error('createComment:', error); return { success: false, error }; }
  return { success: true, comment: data };
}

export async function deleteComment(commentId) {
  const { error } = await supabase
    .from('comments')
    .update({ deleted: true })
    .eq('id', commentId);

  if (error) { console.error('deleteComment:', error); return false; }
  return true;
}


// ============================================================
//  LIKES
// ============================================================

/** Toggle like on a post. Returns { liked: true/false, count: number } */
export async function toggleLike(postId) {
  const user = await getCurrentUser();
  if (!user) return null;

  // Check if already liked
  const { data: existing } = await supabase
    .from('likes')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    // Unlike
    await supabase.from('likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', user.id);
  } else {
    // Like
    await supabase.from('likes')
      .insert({ post_id: postId, user_id: user.id });
  }

  // Get fresh count
  const { count } = await supabase
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', postId);

  return { liked: !existing, count: count || 0 };
}

/** Returns set of post IDs that the current user has liked */
export async function getMyLikes() {
  const user = await getCurrentUser();
  if (!user) return new Set();

  const { data } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', user.id);

  return new Set((data || []).map(r => r.post_id));
}


// ============================================================
//  BULK BUY
// ============================================================

/** Join a bulk buy post. Returns { success, error? } */
export async function joinBulkBuy(postId) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Not logged in' };

  const { error } = await supabase
    .from('bulk_participants')
    .insert({ post_id: postId, user_id: user.id });

  // The DB trigger will block this if spots are full
  if (error) {
    const msg = error.message.includes('full')
      ? 'This bulk buy is already full.'
      : 'Could not join. Please try again.';
    return { success: false, error: msg };
  }
  return { success: true };
}

/** Leave / unjoin a bulk buy */
export async function leaveBulkBuy(postId) {
  const user = await getCurrentUser();
  if (!user) return false;

  const { error } = await supabase
    .from('bulk_participants')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', user.id);

  return !error;
}

/** Returns true if current user has already joined a bulk buy */
export async function hasJoinedBulk(postId) {
  const user = await getCurrentUser();
  if (!user) return false;

  const { data } = await supabase
    .from('bulk_participants')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .maybeSingle();

  return !!data;
}


// ============================================================
//  AJO REQUESTS
// ============================================================

/** Send a request to join an Ajo group from the feed */
export async function requestAjoJoin(postId, note = '') {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Not logged in' };

  const { error } = await supabase
    .from('ajo_requests')
    .insert({ post_id: postId, requester_id: user.id, note });

  if (error) {
    const msg = error.code === '23505'
      ? 'You already requested to join this group.'
      : 'Could not send request. Please try again.';
    return { success: false, error: msg };
  }
  return { success: true };
}

/** For group creators: fetch all pending requests for their post */
export async function fetchAjoRequests(postId) {
  const { data, error } = await supabase
    .from('ajo_requests')
    .select(`
      id, status, note, created_at,
      requester:profiles ( id, full_name, market, avatar_color, credit_score )
    `)
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) { console.error('fetchAjoRequests:', error); return []; }
  return data;
}

/** Approve or reject an Ajo join request */
export async function reviewAjoRequest(requestId, status) {
  if (!['approved','rejected'].includes(status)) return false;

  const { error } = await supabase
    .from('ajo_requests')
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq('id', requestId);

  return !error;
}


// ============================================================
//  FOLLOWS
// ============================================================

export async function followTrader(targetId) {
  const user = await getCurrentUser();
  if (!user) return false;

  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: user.id, following_id: targetId });

  return !error;
}

export async function unfollowTrader(targetId) {
  const user = await getCurrentUser();
  if (!user) return false;

  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('following_id', targetId);

  return !error;
}

/** Returns true if current user follows targetId */
export async function isFollowing(targetId) {
  const user = await getCurrentUser();
  if (!user) return false;

  const { data } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('follower_id', user.id)
    .eq('following_id', targetId)
    .maybeSingle();

  return !!data;
}


// ============================================================
//  REAL-TIME SUBSCRIPTIONS
//  Call subscribeFeed() once when the feed page loads.
//  Pass callbacks that update your UI.
// ============================================================

/**
 * Subscribe to real-time feed updates.
 *
 * @param {object} callbacks
 * @param {function} callbacks.onNewPost      - called with the new post row
 * @param {function} callbacks.onNewComment   - called with { postId, comment }
 * @param {function} callbacks.onLikeChange   - called with { postId, count }
 * @param {function} callbacks.onBulkUpdate   - called with { postId, spotsFilled }
 *
 * @returns {function} unsubscribe — call this when leaving the page
 */
export function subscribeFeed({ onNewPost, onNewComment, onLikeChange, onBulkUpdate } = {}) {
  const channels = [];

  // ── New posts ──────────────────────────────────────────────
  if (onNewPost) {
    const postChannel = supabase
      .channel('feed-posts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        async (payload) => {
          // Fetch the full post with author info from the view
          const { data } = await supabase
            .from('feed_posts')
            .select('*')
            .eq('id', payload.new.id)
            .single();

          if (data) onNewPost(data);
        }
      )
      .subscribe();

    channels.push(postChannel);
  }

  // ── New comments ───────────────────────────────────────────
  if (onNewComment) {
    const commentChannel = supabase
      .channel('feed-comments')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments' },
        async (payload) => {
          // Fetch comment with author profile
          const { data } = await supabase
            .from('comments')
            .select(`
              id, body, created_at,
              author:profiles ( id, full_name, avatar_color, avatar_tc )
            `)
            .eq('id', payload.new.id)
            .single();

          if (data) onNewComment({ postId: payload.new.post_id, comment: data });
        }
      )
      .subscribe();

    channels.push(commentChannel);
  }

  // ── Like changes ───────────────────────────────────────────
  if (onLikeChange) {
    const likeChannel = supabase
      .channel('feed-likes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'likes' },
        async (payload) => {
          const postId = payload.new?.post_id || payload.old?.post_id;
          if (!postId) return;

          // Get fresh count
          const { count } = await supabase
            .from('likes')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', postId);

          onLikeChange({ postId, count: count || 0 });
        }
      )
      .subscribe();

    channels.push(likeChannel);
  }

  // ── Bulk buy spot updates ──────────────────────────────────
  if (onBulkUpdate) {
    const bulkChannel = supabase
      .channel('feed-bulk')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bulk_participants' },
        async (payload) => {
          const { data: post } = await supabase
            .from('posts')
            .select('id, meta')
            .eq('id', payload.new.post_id)
            .single();

          if (post) {
            onBulkUpdate({
              postId:      post.id,
              spotsFilled: post.meta?.spots_filled || 0
            });
          }
        }
      )
      .subscribe();

    channels.push(bulkChannel);
  }

  // Return unsubscribe function
  return () => {
    channels.forEach(ch => supabase.removeChannel(ch));
  };
}


// ============================================================
//  FEED PAGE BOOTSTRAP
//  Drop-in wiring for feed.html.
//  Replaces the static posts array and hardcoded renderFeed().
// ============================================================

// State
let currentUser    = null;
let currentProfile = null;
let myLikedPosts   = new Set();
let activeFilter   = { market_slug: 'all', category: 'all', following: false };
let unsubscribeFeed = null;

/**
 * Call this once at the bottom of feed.html instead of renderFeed('all').
 * It handles auth check, initial load, and real-time wiring.
 */
export async function initFeedPage() {
  currentUser = await getCurrentUser();

  // Redirect to login if not authenticated
  if (!currentUser) {
    window.location.href = '/index.html';
    return;
  }

  currentProfile = await getProfile(currentUser.id);
  myLikedPosts   = await getMyLikes();

  // Initial load
  await loadAndRenderFeed();

  // Wire real-time
  unsubscribeFeed = subscribeFeed({

    onNewPost: (post) => {
      // Prepend new post to top of feed without full re-render
      prependPostCard(post);
    },

    onNewComment: ({ postId, comment }) => {
      // Append comment to the open comment thread if visible
      appendCommentToThread(postId, comment);
    },

    onLikeChange: ({ postId, count }) => {
      // Update like count badge on the card
      const el = document.getElementById(`like-count-${postId}`);
      if (el) el.textContent = count;
    },

    onBulkUpdate: ({ postId, spotsFilled }) => {
      // Update the spots progress bar live
      updateBulkSpots(postId, spotsFilled);
    }
  });

  // Cleanup on page leave
  window.addEventListener('beforeunload', () => {
    if (unsubscribeFeed) unsubscribeFeed();
  });
}

// ── Load posts and render ──────────────────────────────────
async function loadAndRenderFeed() {
  const container = document.getElementById('feed-container');
  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-soft)">Loading…</div>';

  const posts = await fetchPosts({
    ...activeFilter,
    userId: currentUser.id
  });

  container.innerHTML = '';

  if (posts.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px; color:var(--text-soft)">
        <div style="font-size:40px; margin-bottom:12px">📭</div>
        <div style="font-size:16px; font-weight:600">No posts yet in this filter.</div>
        <div style="font-size:13px; margin-top:6px">Be the first to post something!</div>
      </div>`;
    return;
  }

  posts.forEach(post => appendPostCard(post, false));
}

// ── Prepend a fresh post to the top ────────────────────────
function prependPostCard(post) {
  const container = document.getElementById('feed-container');
  const card = buildPostCard(post);
  card.style.opacity = '0';
  card.style.transform = 'translateY(-10px)';
  container.prepend(card);
  requestAnimationFrame(() => {
    card.style.transition = 'all 0.3s ease';
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
  });
}

// ── Append a post card ─────────────────────────────────────
function appendPostCard(post, animate = true) {
  const container = document.getElementById('feed-container');
  const card = buildPostCard(post, animate);
  container.appendChild(card);
}

// ── Build a post card DOM element ─────────────────────────
function buildPostCard(post, animate = true) {
  const card = document.createElement('div');
  card.className = `post-card type-${post.type}${animate ? ' fade-up' : ''}`;
  card.id = `post-${post.id}`;

  const initials = (post.author_name || '?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const isLiked  = myLikedPosts.has(post.id);
  const meta     = post.meta || {};

  const badgeLabel = {
    update: 'Update',
    price:  '🚨 Price Alert',
    bulk:   '🤝 Bulk Buy',
    ajo:    '🔄 Ajo Invite'
  }[post.type] || post.type;

  const badgeClass = {
    update: 'badge-update',
    price:  'badge-price',
    bulk:   'badge-bulk',
    ajo:    'badge-ajo'
  }[post.type];

  // Type-specific block
  let specialBlock = '';

  if (post.type === 'price') {
    const isUp  = meta.direction === 'up';
    const cls   = isUp ? 'price-up' : 'price-down';
    const arrow = isUp ? '↑' : '↓';
    specialBlock = `
      <div class="price-alert-box">
        <div class="price-alert-icon">${isUp ? '🚨' : '📉'}</div>
        <div class="price-alert-info">
          <div class="price-alert-item">${meta.item || ''}</div>
          <div class="price-alert-change ${cls}">${arrow} ${meta.pct_change || 0}% — now ${meta.new_price || ''}</div>
          <div class="price-alert-detail">${post.market} · ${timeAgo(post.created_at)}</div>
        </div>
      </div>`;
  }

  if (post.type === 'bulk') {
    const total  = meta.spots_total  || 0;
    const filled = meta.spots_filled || 0;
    const open   = Math.max(total - filled, 0);
    const pct    = total > 0 ? Math.round((filled / total) * 100) : 0;
    specialBlock = `
      <div class="bulk-box">
        <div class="bulk-product">📦 ${meta.item || ''}</div>
        <div class="bulk-details">
          <div class="bulk-stat"><span class="bulk-stat-label">Price</span><span class="bulk-stat-val">${meta.price_per_unit || ''}</span></div>
          <div class="bulk-stat"><span class="bulk-stat-label">Minimum</span><span class="bulk-stat-val">${meta.min_qty || ''}</span></div>
          <div class="bulk-stat"><span class="bulk-stat-label">Spots left</span><span class="bulk-stat-val" style="color:var(--blue)">${open} of ${total}</span></div>
        </div>
        <div class="bulk-spots">
          <div class="bulk-spots-track"><div class="bulk-spots-fill" id="bulk-bar-${post.id}" style="width:${pct}%"></div></div>
          <div class="bulk-spots-label" id="bulk-label-${post.id}">${filled} traders joined · ${open} spot${open!==1?'s':''} remaining</div>
        </div>
      </div>`;
  }

  if (post.type === 'ajo') {
    const total  = meta.spots_total  || 0;
    const filled = meta.spots_filled || 0;
    const open   = Math.max(total - filled, 0);
    let spots = '';
    for (let i = 0; i < total; i++) {
      spots += i < filled
        ? `<div class="ajo-spot filled">${String.fromCharCode(65+i)}</div>`
        : `<div class="ajo-spot open">?</div>`;
    }
    specialBlock = `
      <div class="ajo-box">
        <div class="ajo-box-name">🔄 ${meta.group_name || ''}</div>
        <div class="ajo-box-details">
          <div class="ajo-box-stat"><span class="ajo-box-label">Monthly</span><span class="ajo-box-val">${meta.monthly_amount || ''}</span></div>
          <div class="ajo-box-stat"><span class="ajo-box-label">Members</span><span class="ajo-box-val">${total} total</span></div>
          <div class="ajo-box-stat"><span class="ajo-box-label">Spots left</span><span class="ajo-box-val" style="color:var(--gold)">${open} open</span></div>
        </div>
        <div class="ajo-spots-row" id="ajo-spots-${post.id}">${spots}</div>
      </div>`;
  }

  const joinBtn = post.type === 'bulk'
    ? `<button class="join-btn bulk-join" onclick="handleJoinBulk('${post.id}')">Join Bulk Buy</button>`
    : post.type === 'ajo'
    ? `<button class="join-btn ajo-join"  onclick="handleJoinAjo('${post.id}')">Join Ajo Group</button>`
    : '';

  card.innerHTML = `
    <div class="post-inner">
      <div class="post-header">
        <div class="post-author">
          <div class="p-avatar" style="background:${post.avatar_color||'#1a6637'}; color:${post.avatar_tc||'#fff'}">${initials}</div>
          <div>
            <div class="p-name">${post.author_name || 'Trader'} <span class="p-verified">✓</span></div>
            <div class="p-meta">📍 ${post.author_market || post.market} <span class="dot">•</span> ${timeAgo(post.created_at)}</div>
          </div>
        </div>
        <div class="post-type-badge ${badgeClass}">${badgeLabel}</div>
      </div>
      ${specialBlock}
      <div class="post-body">${post.body}</div>
      <div class="post-footer">
        <button class="reaction-btn ${isLiked ? 'liked' : ''}" id="like-btn-${post.id}"
          onclick="handleLike('${post.id}')">
          <span class="r-icon">👍</span>
          <span class="r-count" id="like-count-${post.id}">${post.like_count || 0}</span>
        </button>
        <button class="reaction-btn" onclick="handleToggleComments('${post.id}')">
          <span class="r-icon">💬</span>
          <span class="r-count" id="comment-count-${post.id}">${post.comment_count || 0}</span>
        </button>
        <div class="spacer"></div>
        ${joinBtn}
      </div>
    </div>
    <div class="comments-section" id="comments-${post.id}">
      <div class="comments-list" id="comments-list-${post.id}"></div>
      <div class="comment-input-row">
        <div class="c-avatar-sm" style="background:${currentProfile?.avatar_color||'#1a6637'}; color:${currentProfile?.avatar_tc||'#fff'}">
          ${initials}
        </div>
        <input class="comment-input" placeholder="Write a reply…" id="comment-input-${post.id}"
          onkeydown="if(event.key==='Enter') handleSendComment('${post.id}')"/>
        <button class="comment-send" onclick="handleSendComment('${post.id}')">➤</button>
      </div>
    </div>`;

  return card;
}

// ── Real-time helpers ──────────────────────────────────────
function appendCommentToThread(postId, comment) {
  const list = document.getElementById(`comments-list-${postId}`);
  if (!list) return;
  const ci = (comment.author?.full_name || '?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const el = document.createElement('div');
  el.className = 'comment-item';
  el.innerHTML = `
    <div class="c-avatar-sm" style="background:${comment.author?.avatar_color||'#666'}; color:${comment.author?.avatar_tc||'#fff'}">${ci}</div>
    <div class="c-bubble">
      <div class="c-bubble-name">${comment.author?.full_name || 'Trader'}</div>
      <div class="c-bubble-text">${comment.body}</div>
    </div>`;
  list.appendChild(el);

  // Update comment count badge
  const countEl = document.getElementById(`comment-count-${postId}`);
  if (countEl) countEl.textContent = parseInt(countEl.textContent || '0') + 1;
}

function updateBulkSpots(postId, spotsFilled) {
  const bar   = document.getElementById(`bulk-bar-${postId}`);
  const label = document.getElementById(`bulk-label-${postId}`);
  if (!bar || !label) return;

  // Read total from the bar's parent track width (100%) — just update filled
  const card = document.getElementById(`post-${postId}`);
  if (!card) return;
  const meta = {}; // would come from data attribute in production
  // For now just animate the bar to a slightly wider fill
  const currentWidth = parseFloat(bar.style.width) || 0;
  bar.style.width = Math.min(currentWidth + 10, 100) + '%';
  label.textContent = `${spotsFilled} traders joined`;
}

// ── Utility: human-readable time ──────────────────────────
function timeAgo(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (seconds < 60)   return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds/60)}m ago`;
  if (seconds < 86400)return `${Math.floor(seconds/3600)}h ago`;
  return `${Math.floor(seconds/86400)}d ago`;
}


// ============================================================
//  GLOBAL EVENT HANDLERS
//  These are called from inline onclick attributes in the card HTML.
//  They must be on window so the HTML can reach them.
// ============================================================

window.handleLike = async function(postId) {
  const result = await toggleLike(postId);
  if (!result) return;

  const btn = document.getElementById(`like-btn-${postId}`);
  if (btn) btn.classList.toggle('liked', result.liked);

  if (result.liked) myLikedPosts.add(postId);
  else              myLikedPosts.delete(postId);
  // Count updates via real-time subscription
};

window.handleToggleComments = async function(postId) {
  const section = document.getElementById(`comments-${postId}`);
  if (!section) return;
  const isOpen = section.classList.contains('open');

  if (!isOpen) {
    // Load comments from DB on first open
    const list = document.getElementById(`comments-list-${postId}`);
    if (list && list.children.length === 0) {
      list.innerHTML = '<div style="padding:8px 0;color:var(--text-soft);font-size:13px">Loading…</div>';
      const comments = await fetchComments(postId);
      list.innerHTML = '';
      comments.forEach(c => appendCommentToThread(postId, c));
    }
    section.classList.add('open');
    setTimeout(() => document.getElementById(`comment-input-${postId}`)?.focus(), 100);
  } else {
    section.classList.remove('open');
  }
};

window.handleSendComment = async function(postId) {
  const input = document.getElementById(`comment-input-${postId}`);
  const body  = input?.value.trim();
  if (!body) return;

  input.value = '';
  input.disabled = true;

  const result = await createComment(postId, body);

  input.disabled = false;
  if (!result.success) {
    alert('Could not send comment. Please try again.');
    return;
  }
  // Real-time subscription will auto-append the comment
};

window.handleJoinBulk = async function(postId) {
  const result = await joinBulkBuy(postId);
  if (!result.success) {
    alert(`⚠️ ${result.error}`);
    return;
  }
  alert('✅ You joined the bulk buy!\nThe post creator will contact you with supplier details.');
};

window.handleJoinAjo = async function(postId) {
  const result = await requestAjoJoin(postId);
  if (!result.success) {
    alert(`⚠️ ${result.error}`);
    return;
  }
  alert('✅ Request sent!\nThe group admin will check your SUWE credit score and confirm your spot.');
};

window.handleFilter = async function(el, market_slug, category, following) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');

  activeFilter = {
    market_slug: market_slug || 'all',
    category:    category    || 'all',
    following:   following   || false
  };
  await loadAndRenderFeed();
};

window.handleOpenModal = function(type) {
  openModal(type); // calls the existing modal function in feed.html
};


// ============================================================
//  POST SUBMISSION (replaces submitPost() in feed.html)
// ============================================================
window.submitPostToSupabase = async function() {
  const body = document.getElementById('post-text')?.value.trim();
  if (!body) { document.getElementById('post-text')?.focus(); return; }

  const marketSelect = document.getElementById('post-market');
  const market = (marketSelect?.value || 'All Lagos').replace('📍 ','').replace('🌍 ','');
  const market_slug = market.toLowerCase().replace(/\s+/g,'').replace('market','') || 'all';

  const type = window._selectedPostType || 'update';
  let meta = {};

  if (type === 'price') {
    meta = {
      item:       document.getElementById('price-item')?.value || '',
      new_price:  document.getElementById('price-new')?.value  || '',
      direction:  document.getElementById('price-dir')?.value  || 'up',
      pct_change: parseFloat(document.getElementById('price-pct')?.value) || 0
    };
  }
  if (type === 'bulk') {
    meta = {
      item:           document.getElementById('bulk-item')?.value  || '',
      price_per_unit: document.getElementById('bulk-price')?.value || '',
      min_qty:        document.getElementById('bulk-qty')?.value   || '',
      spots_total:    parseInt(document.getElementById('bulk-spots')?.value) || 5,
      spots_filled:   0
    };
  }
  if (type === 'ajo') {
    meta = {
      group_name:     document.getElementById('ajo-name')?.value   || '',
      monthly_amount: document.getElementById('ajo-amount')?.value || '',
      spots_total:    parseInt(document.getElementById('ajo-spots')?.value) || 5,
      spots_filled:   0,
      visibility:     document.getElementById('ajo-open')?.value   || 'Anyone on SUWE'
    };
  }

  const btn = document.querySelector('.btn-post');
  if (btn) { btn.disabled = true; btn.textContent = 'Posting…'; }

  const result = await createPost({ type, body, market, market_slug, category: 'general', meta });

  if (btn) { btn.disabled = false; btn.textContent = 'Post ✓'; }

  if (!result.success) {
    alert('Could not post. Please try again.');
    return;
  }

  // Clear form and close modal
  document.getElementById('post-text').value = '';
  document.querySelectorAll('#modal .form-input').forEach(i => i.value = '');
  closeModal();
  // Real-time will prepend the new post automatically
};
