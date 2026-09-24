const assert = require('assert');
const http = require('http');
const app = require('../src/server');
const bip47Service = require('../src/services/bip47.service');
const { scanForLeaks } = require('../src/middleware/privacyGuard');

let server;
const PORT = 4099;
const BASE_URL = `http://localhost:${PORT}`;

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, options);
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, headers: res.headers, body: json };
}

async function runTests() {
  console.log('🧪 Starting Silent Ledger Backend Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    return (async () => {
      try {
        await fn();
        console.log(`  ✅ ${name}`);
        passed++;
      } catch (err) {
        console.error(`  ❌ ${name}`);
        console.error(`     Error: ${err.message}`);
        failed++;
      }
    })();
  }

  // Start temporary test server
  await new Promise((resolve) => {
    server = app.listen(PORT, resolve);
  });

  try {
    // 1. Health Check
    await test('GET /api/health should return online status', async () => {
      const res = await request('/api/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'online');
      assert.strictEqual(res.body.project, 'Silent Ledger');
    });

    // 2. BIP47 Encoding & Decoding
    await test('BIP47 Service encodes and decodes payment codes correctly', async () => {
      const pair = bip47Service.createDemoPair();
      assert.ok(pair.alice.paymentCode.startsWith('PM8'), 'Alice payment code should start with PM8');
      
      const decoded = bip47Service.decodePaymentCode(pair.alice.paymentCode);
      assert.strictEqual(decoded.version, 1);
      assert.strictEqual(decoded.pubkey, pair.alice.pubkeyHex);
    });

    // 3. ECDH Address Derivation Parity
    await test('Alice & Bob derive identical one-time receiving addresses (ECDH parity)', async () => {
      const pair = bip47Service.createDemoPair();
      assert.strictEqual(pair.ecdh.secretsMatchParity, true, 'Shared secrets must match');
      assert.strictEqual(pair.derivedAddressesMatch, true, 'All derived addresses must match');
      assert.strictEqual(pair.addresses.length, 5);
      assert.ok(pair.addresses[0].address.startsWith('tb1q'), 'Default testnet address should be SegWit (tb1q)');
    });

    // 4. Crypto Route: POST /api/crypto/ecdh/derive-sequence
    await test('POST /api/crypto/ecdh/derive-sequence derives address list', async () => {
      const pair = bip47Service.createDemoPair();
      const res = await request('/api/crypto/ecdh/derive-sequence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverPaymentCode: pair.alice.paymentCode,
          sharedSecretHex: pair.ecdh.sharedSecretHex,
          count: 3
        })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.count, 3);
      assert.strictEqual(res.body.addresses[0].address, pair.addresses[0].address);
    });

    // 5. Zero-Knowledge Privacy Guard: Blocking xpub
    await test('Zero-Knowledge Guard blocks xpub from being sent to AI Coach', async () => {
      const res = await request('/api/ai/coach/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: 80,
          leakedXpub: 'tpubD6NzVbkrYhZ4XgiPtUmZFY4kQZ3Fv1k8YVq5jXWzK4v8G9k2R4j5L6m7N8P1q2w3e4r5t6y7u8i9o0'
        })
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.code, 'PRIVACY_GUARD_BLOCKED');
      assert.ok(res.body.message.includes('NEVER leave your browser'));
    });

    // 6. Zero-Knowledge Privacy Guard: Blocking WIF Private Key
    await test('Zero-Knowledge Guard blocks WIF private keys', async () => {
      const res = await request('/api/ai/coach/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: 80,
          privateKey: 'cT1k8YVq5jXWzK4v8G9k2R4j5L6m7N8P1q2w3e4r5t6y7u8i9o0p'
        })
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.code, 'PRIVACY_GUARD_BLOCKED');
    });

    // 7. AI Privacy Coach: POST /api/ai/coach/analyze with valid sanitized metrics
    await test('POST /api/ai/coach/analyze returns structured educational coaching', async () => {
      const res = await request('/api/ai/coach/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: 28,
          grade: 'CRITICAL LEAK',
          flags: [
            {
              type: 'ADDRESS_REUSE',
              severity: 'CRITICAL',
              penalty: 30,
              title: 'Address Reuse Detected',
              details: 'Address tb1q... received 3 separate deposits'
            },
            {
              type: 'DUST_ATTACK',
              severity: 'HIGH',
              penalty: 15,
              title: 'Dust Attack Deposits Detected',
              details: 'Found 1 output with 546 sats'
            }
          ]
        })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.analysis.includes('Address Reuse'));
      assert.ok(res.body.data.analysis.includes('Dust Attack'));
    });

    // 8. AI Privacy Coach: Interactive Chat
    await test('POST /api/ai/coach/chat responds to questions about Bitcoin leaks', async () => {
      const res = await request('/api/ai/coach/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Why is address reuse dangerous in Bitcoin?'
        })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.reply.length > 50);
      assert.ok(res.body.data.reply.toLowerCase().includes('reuse'));
    });

    // 9. Simulated Scenarios: Bad Wallet
    await test('GET /api/scenarios/simulated-wallet-bad flags all 4 privacy issues', async () => {
      const res = await request('/api/scenarios/simulated-wallet-bad');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.audit.score < 40, 'Vulnerable wallet score must be < 40');
      
      const flagTypes = res.body.audit.flags.map(f => f.type);
      assert.ok(flagTypes.includes('ADDRESS_REUSE'), 'Should detect address reuse');
      assert.ok(flagTypes.includes('DUST_ATTACK'), 'Should detect dust attack');
      assert.ok(flagTypes.includes('ADDRESS_TYPE_MIXING'), 'Should detect script mixing');
      assert.ok(flagTypes.includes('COMMON_INPUT_OWNERSHIP'), 'Should detect CIOH risk');
    });

    // 10. Simulated Scenarios: Clean Silent Ledger Wallet
    await test('GET /api/scenarios/simulated-wallet-clean has high privacy score (>=95)', async () => {
      const res = await request('/api/scenarios/simulated-wallet-clean');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.audit.score >= 95, 'Clean wallet score must be >= 95');
      assert.strictEqual(res.body.audit.flags.length, 0);
    });

    // 11. Nostr Event Templates
    await test('POST /api/nostr/template/payment-code generates kind 30078 event', async () => {
      const res = await request('/api/nostr/template/payment-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pubkeyHex: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          paymentCode: 'PM8TTestCode'
        })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.template.kind, 30078);
      assert.ok(res.body.template.tags.some(t => t[0] === 'bip47'));
    });

    // 12. Database Status Route
    await test('GET /api/db/status returns database health and configuration info', async () => {
      const res = await request('/api/db/status');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(typeof res.body.status, 'string');
      assert.strictEqual(typeof res.body.hasPlaceholder, 'boolean');
    });

    // 13. Privacy Guard protects DB contacts from xpub injection
    await test('Zero-Knowledge Guard blocks xpub from being saved to database routes', async () => {
      const res = await request('/api/db/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          npub: 'npub1test89234729384729384729384723948',
          paymentCode: 'PM8TTest',
          leakedXpub: 'tpubD6NzVbkrYhZ4XgiPtUmZFY4kQZ3Fv1k8YVq5jXWzK4v8G9k2R4j5L6m7N8P1q2w3e4r5t6y7u8i9o0'
        })
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.code, 'PRIVACY_GUARD_BLOCKED');
    });

    // 14. Sign-Up Route (Success - 201 Created)
    await test('POST /api/signup registers a new user with 201 Created', async () => {
      // First clean any prior test data
      await request('/api/users/clear-all', { method: 'DELETE' });

      const res = await request('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'testuser@bitcoinapp.com',
          password: 'securePassword123'
        })
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.user.email, 'testuser@bitcoinapp.com');
    });

    // 15. Sign-Up Route Duplicate Detection (400 Bad Request)
    await test('POST /api/signup duplicate email returns 400 Bad Request', async () => {
      const res = await request('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'testuser@bitcoinapp.com',
          password: 'securePassword123'
        })
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.toLowerCase().includes('already exists'));
    });

    // 16. Clear Data Route (Reset - 200 OK)
    await test('DELETE /api/users/clear-all wipes user records with 200 OK', async () => {
      const res = await request('/api/users/clear-all', { method: 'DELETE' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.deletedCount >= 1);

      // Verify sign-up works fresh again
      const freshRes = await request('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'testuser@bitcoinapp.com',
          password: 'securePassword123'
        })
      });
      assert.strictEqual(freshRes.status, 201);
    });

  } finally {
    server.close();
  }

  console.log(`\n=============================================`);
  console.log(`Test Results: ${passed} passed, ${failed} failed.`);
  console.log(`=============================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
