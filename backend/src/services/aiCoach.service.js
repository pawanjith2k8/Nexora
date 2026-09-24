const config = require('../config');

/**
 * System prompt setting the AI Coach persona and domain expertise.
 */
const COACH_SYSTEM_PROMPT = `You are the Silent Ledger AI Privacy Coach — an expert Bitcoin on-chain privacy tutor.
Your mission is to examine a user's privacy score and flagged heuristics and explain their privacy leaks in plain, conversational English.
Tone:
- Warm, educational, and empowering (like a supportive coach or mentor, NOT an emotionless log file or sterile report).
- Explain *why* chain surveillance firms (like Chainalysis or Elliptic) target these specific patterns.
- Teach them how Silent Ledger (BIP47 payment codes + NIP-17 Nostr handshakes) eliminates these issues forever.
- Always provide 3-4 concrete, numbered actionable suggestions.
Strict Constraint:
- Never ask for or mention private keys, seed phrases, or xpubs. All analysis is zero-knowledge.`;

/**
 * Built-in intelligent privacy coaching engine (zero external API key required).
 * Provides deep, dynamic, contextual coaching for any privacy audit score & flags.
 */
function generateFallbackCoaching({ score, grade, flags = [], summary = {}, userMessage = null }) {
  if (userMessage) {
    return generateConversationalReply({ score, grade, flags, summary, userMessage });
  }

  const sections = [];

  // Opening summary
  let opening = '';
  if (score >= 90) {
    opening = `🌟 **Fantastic Privacy Hygiene! Your Privacy Score is ${score}/100 (${grade})**.\n` +
      `Your wallet shows zero or negligible metadata leakage. Coins are cleanly separated, and you're avoiding the common pitfalls that chain surveillance tools look for.`;
  } else if (score >= 60) {
    opening = `⚠️ **Heads up! Your Privacy Score is ${score}/100 (${grade})**.\n` +
      `While some of your UTXOs are safe, there are noticeable cryptographic leaks that allow outside observers to map your financial connections. Let's walk through what happened and how to fix it.`;
  } else {
    opening = `🚨 **Critical Privacy Alert: Your Privacy Score is ${score}/100 (${grade})**.\n` +
      `Your on-chain habits have inadvertently broadcast your wallet cluster to public blockchain observers. The good news: privacy on Bitcoin is a practice, not a permanent sentence. Let's unpack the leaks right now.`;
  }
  sections.push(opening);

  // Breakdown of each detected flag
  if (flags.length === 0) {
    sections.push(`### 🛡️ What went right:\n` +
      `- **Zero Address Reuse:** Every incoming payment received its own fresh address.\n` +
      `- **No Unsolicited Dust:** No tracking probes detected.\n` +
      `- **Consistent Script Types:** Fingerprint profiling is minimized.`);
  } else {
    sections.push(`### 🔍 Leak Breakdown & Why It Matters:`);
    flags.forEach((flag, idx) => {
      let explanation = '';
      if (flag.type === 'ADDRESS_REUSE') {
        explanation = `**${idx + 1}. Address Reuse (${flag.severity} RISK - Deducted ${flag.penalty} pts)**\n` +
          `• *What happened:* An address was used more than once to receive funds (${flag.details}).\n` +
          `• *How chain analysis exploits this:* Reusing a static address is like writing your real name on public receipts. Clustering algorithms link all incoming and outgoing payments together into a single entity dossier, permanently stripping away Bitcoin's pseudonymity.\n` +
          `• *How Silent Ledger fixes this:* Instead of giving people your static Bitcoin address, you share your BIP47 Payment Code over Nostr. Bob and Alice derive a brand-new, unlinkable address for every single transaction via ECDH math without manual coordination.`;
      } else if (flag.type === 'DUST_ATTACK') {
        explanation = `**${idx + 1}. Dust Attack Deposits (${flag.severity} RISK - Deducted ${flag.penalty} pts)**\n` +
          `• *What happened:* You received tiny unsolicited payments (${flag.details}).\n` +
          `• *How chain analysis exploits this:* Attackers broadcast micro-transactions (often 546 sats) to thousands of addresses. When your wallet attempts to spend your total balance, it bundles this dust with your clean coins, revealing your unlinked addresses to the attacker's surveillance node.\n` +
          `• *The Fix:* Freeze or quarantine these dust UTXOs in your wallet's coin control panel. Never spend them alongside your personal funds.`;
      } else if (flag.type === 'COMMON_INPUT_OWNERSHIP') {
        explanation = `**${idx + 1}. Common-Input-Ownership Heuristic (CIOH) Risk (${flag.severity} RISK - Deducted ${flag.penalty} pts)**\n` +
          `• *What happened:* Multiple unlinked UTXOs are residing in your wallet without coin control isolation (${flag.details}).\n` +
          `• *How chain analysis exploits this:* Under CIOH (the #1 rule of blockchain surveillance), whenever a transaction spends 2 or more inputs, analysts assume with 99% certainty that both inputs belong to the same person. Spending them together irreversibly merges your separate financial lives.\n` +
          `• *The Fix:* Use coin control to spend single UTXOs individually, or use Silent Ledger's isolated receiving channels.`;
      } else if (flag.type === 'ADDRESS_TYPE_MIXING') {
        explanation = `**${idx + 1}. Address Script-Type Mixing (${flag.severity} RISK - Deducted ${flag.penalty} pts)**\n` +
          `• *What happened:* Your wallet holds a mix of script types (${flag.details}).\n` +
          `• *How chain analysis exploits this:* Different wallet software defaults to different script standards (e.g. Legacy P2PKH vs Native SegWit P2WPKH vs Taproot P2TR). Mixing these gives surveillance firms a software fingerprint that narrows down your identity.\n` +
          `• *The Fix:* Standardize on modern SegWit (P2WPKH) or Taproot (P2TR) addresses.`;
      } else {
        explanation = `**${idx + 1}. ${flag.title} (${flag.severity})**\n• ${flag.details}\n• Risk: ${flag.chainAnalysisRisk}`;
      }
      sections.push(explanation);
    });
  }

  // Concrete Action Plan
  sections.push(`### 🎯 4 Steps to Restore Maximum Privacy:\n` +
    `1. **Switch to BIP47 Silent Handshakes:** Share your BIP47 Payment Code on Nostr (` + '`PM8T...`' + `) rather than an on-chain address. Every payment will arrive at a unique one-time address.\n` +
    `2. **Quarantine Flagged Dust UTXOs:** Lock any UTXO under 1,000 sats so your wallet never selects it as an input.\n` +
    `3. **Practice Strict Coin Control:** Never consolidate small UTXOs into a single large transaction unless routing through a privacy-preserving mechanism.\n` +
    `4. **Send via NIP-17 Metadata-Hidden Handshake:** Eliminate the on-chain notification transaction that legacy BIP47 required by negotiating the handshake securely over encrypted Nostr relays.`);

  return sections.join('\n\n');
}

/**
 * Handles conversational queries to the AI Coach.
 */
function generateConversationalReply({ score, grade, flags = [], userMessage }) {
  const msg = (userMessage || '').toLowerCase();

  if (msg.includes('dust') || msg.includes('tiny')) {
    return `### 💡 Understanding Dust Attacks\n\n` +
      `A **dust attack** is an on-chain tracing technique where an attacker sends tiny fractions of Bitcoin (typically 546 sats, the minimum relayable amount) to addresses observed on the blockchain.\n\n` +
      `**Why do they do it?**\n` +
      `The attacker doesn't care about the coins — they want to tag your wallet. When your wallet later constructs a transaction, it automatically consolidates that tiny dust output with your other coins, revealing that all those addresses belong to the same person.\n\n` +
      `**What should you do?**\n` +
      `• Use your wallet's **Coin Control** feature.\n` +
      `• Mark the dust UTXO as **"Frozen"** or **"Do Not Spend"**.\n` +
      `• In Silent Ledger, payment discovery happens privately over Nostr, so your main public identity is never mapped to a single on-chain target address.`;
  }

  if (msg.includes('reuse') || msg.includes('address reuse')) {
    return `### 🔄 Why Address Reuse Is the #1 Privacy Trap\n\n` +
      `When Bitcoin was designed, Satoshi Nakamoto explicitly recommended generating a new address for every transaction in Section 10 of the Bitcoin Whitepaper.\n\n` +
      `When you reuse an address:\n` +
      `1. **Anyone you transact with** can look up your balance and total payment history.\n` +
      `2. **Chain analysis software** (Chainalysis, Elliptic) automatically groups all those inputs and outputs into an entity cluster.\n` +
      `3. **Quantum Vulnerability:** An address that has spent coins has its public key exposed on-chain, unlike an unspent P2PKH/P2WPKH address whose public key hash is hidden.\n\n` +
      `**How Silent Ledger Solves This:**\n` +
      `Silent Ledger uses BIP47 payment codes. You only publish your payment code once (via Nostr). Every time Bob sends you sats, ECDH creates a distinct one-time address. Address reuse becomes mathematically impossible!`;
  }

  if (msg.includes('nostr') || msg.includes('nip-17') || msg.includes('handshake')) {
    return `### ⚡ Silent Ledger's Nostr NIP-17 Handshake\n\n` +
      `Traditional BIP47 had one major flaw: to establish a payment channel, the sender had to broadcast an on-chain "Notification Transaction" with an OP_RETURN payload. This cost miner fees and left an unmistakable on-chain fingerprint.\n\n` +
      `**Silent Ledger's Innovation:**\n` +
      `1. **Discovery:** Alice publishes her BIP47 Payment Code as a signed Nostr event (kind 30078) tied to her npub.\n` +
      `2. **Handshake:** Bob sends his payment code to Alice using a **NIP-17 encrypted direct message** (Gift Wrap + Seal).\n` +
      `3. **Derivation:** Both Alice and Bob perform local ECDH ($S = b \\cdot A = a \\cdot B$) to independently generate addresses #0, #1, #2...\n` +
      `4. **Zero On-Chain Trace:** Bob pays Alice directly on Bitcoin testnet/mainnet without any notification transaction!`;
  }

  // Default conversational answer
  return `### 🎙️ AI Coach Advice (Current Score: ${score || 85}/100)\n\n` +
    `Great question! Regarding "${userMessage}":\n\n` +
    `In Bitcoin on-chain analysis, identity leaks happen at the seams where uncoordinated transactions meet public ledgers. ` +
    `Your current privacy profile has ${flags.length} active flag(s).\n\n` +
    `The three golden rules to maintain 95+ score:\n` +
    `1. Never receive to an address that has already seen a transaction.\n` +
    `2. Never consolidate UTXOs from different sources in the same transaction input set without CoinJoin.\n` +
    `3. Use Silent Ledger's Nostr-discovered BIP47 codes so every payment is cryptographically isolated on-chain.`;
}

/**
 * Main coach dispatch: calls external LLM (Gemini / Claude / OpenAI) if key configured,
 * otherwise seamlessly delivers the rich fallback coaching.
 */
async function analyzePrivacyLeaks({ score, grade, flags = [], summary = {}, userMessage = null, conversationHistory = [] }) {
  // If Gemini API key is present
  if (config.GEMINI_API_KEY) {
    try {
      const prompt = `System: ${COACH_SYSTEM_PROMPT}\n\n` +
        `Current User Privacy Audit:\n` +
        `- Privacy Score: ${score}/100\n` +
        `- Grade: ${grade}\n` +
        `- Flags: ${JSON.stringify(flags, null, 2)}\n` +
        `- Summary: ${JSON.stringify(summary, null, 2)}\n\n` +
        (userMessage ? `User Question: "${userMessage}"` : `Please provide a friendly, tutor-like explanation of why this wallet scored ${score}/100, explain each flag, why chain analysis exploits it, and give 4 concrete suggestions to fix it.`);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return {
            provider: 'gemini',
            score,
            grade,
            analysis: text,
            timestamp: new Date().toISOString()
          };
        }
      }
    } catch (err) {
      console.warn('[AI Coach] Gemini API error, falling back to local coach engine:', err.message);
    }
  }

  // If Anthropic Claude API key is present
  if (config.ANTHROPIC_API_KEY) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1500,
          system: COACH_SYSTEM_PROMPT,
          messages: [
            ...conversationHistory,
            {
              role: 'user',
              content: userMessage || `Score: ${score}/100 (${grade}). Flags: ${JSON.stringify(flags)}. Explain the privacy leaks like a tutor and offer solutions.`
            }
          ]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data?.content?.[0]?.text;
        if (text) {
          return {
            provider: 'claude',
            score,
            grade,
            analysis: text,
            timestamp: new Date().toISOString()
          };
        }
      }
    } catch (err) {
      console.warn('[AI Coach] Claude API error, falling back to local coach engine:', err.message);
    }
  }

  // Intelligent fallback engine
  const analysis = generateFallbackCoaching({ score, grade, flags, summary, userMessage });
  return {
    provider: 'silent-ledger-tutor-engine',
    score,
    grade,
    analysis,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  analyzePrivacyLeaks,
  generateFallbackCoaching,
  COACH_SYSTEM_PROMPT
};
