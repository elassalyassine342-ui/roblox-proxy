const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const RBX = 'https://users.roblox.com';
const THB = 'https://thumbnails.roblox.com';
const FRD = 'https://friends.roblox.com';
const GMS = 'https://games.roblox.com';
const BGS = 'https://badges.roblox.com';

async function rbx(url) {
  const r = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

app.get('/api/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const search = await fetch(`${RBX}/v1/usernames/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
    }).then(r => r.json());

    if (!search.data || !search.data.length)
      return res.status(404).json({ error: 'المستخدم غير موجود' });

    const userId = search.data[0].id;

    const [details, friends, followers, following, avatar, badges] =
      await Promise.allSettled([
        rbx(`${RBX}/v1/users/${userId}`),
        rbx(`${FRD}/v1/users/${userId}/friends/count`),
        rbx(`${FRD}/v1/users/${userId}/followers/count`),
        rbx(`${FRD}/v1/users/${userId}/followings/count`),
        rbx(`${THB}/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`),
        rbx(`${BGS}/v1/users/${userId}/badges?limit=100`),
      ]);

    const d   = details.value   || {};
    const avH = avatar.value?.data?.[0]?.imageUrl || null;
    const bdgs = badges.value?.data || [];

    let games = [];
    try {
      const g = await rbx(`${GMS}/v2/users/${userId}/games?accessFilter=2&limit=6`);
      if (g.data) {
        games = g.data.map(x => ({ id: x.id, name: x.name, plays: x.visits || 0, thumbUrl: null }));
        if (games.length) {
          const ids = games.map(x => x.id).join(',');
          const th  = await rbx(`${THB}/v1/games/multiget/thumbnails?universeIds=${ids}&size=768x432&format=Webp`);
          th.data?.forEach(t => {
            const gm = games.find(x => x.id == t.universeId);
            if (gm) gm.thumbUrl = t.thumbnails?.[0]?.imageUrl || null;
          });
        }
      }
    } catch {}

    res.json({
      id: userId,
      name: d.name,
      displayName: d.displayName,
      description: d.description || '',
      created: d.created,
      isBanned: d.isBanned,
      hasVerified: d.hasVerifiedBadge,
      friends: friends.value?.count ?? '—',
      followers: followers.value?.count ?? '—',
      following: following.value?.count ?? '—',
      badges: bdgs.length,
      avatarHead: avH,
      games,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (_, res) => res.json({ status: '🎮 Running' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Port ${PORT}`));
