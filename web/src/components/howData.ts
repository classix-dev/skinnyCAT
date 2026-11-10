// The How It Works story as data: who takes part, the sixteen messages, what the cat carries at
// each one, the caption that says it in words, and the balances after it. Numbers follow
// test/LeanSphincsLedger.t.sol (testAliceAndBob).

import { LEDGER_SYMBOL } from "../generated/contracts";

export const PARTIES = [
  { name: "Alice", short: "Alice", note: "holds a key" },
  { name: "Alice's browser wallet", short: "wallet", note: "pays gas" },
  { name: `${LEDGER_SYMBOL}`, short: LEDGER_SYMBOL, note: "the contract" },
  { name: "Verifier", short: "verifier", note: "leanSPHINCS" },
  { name: "Bob", short: "Bob", note: "no ETC" },
  { name: "Relayer", short: "relayer", note: "any account" },
  { name: "Bob's fresh address", short: "fresh", note: "never held ETC" },
] as const;
export const [ALICE, AW, L, V, BOB, R, FRESH] = [0, 1, 2, 3, 4, 5, 6];
export const COLS = PARTIES.length;

export type Style = "call" | "reply" | "pay" | "offchain";
/** What the cat carries along an arrow, or what it does in place on a self-message. */
export type Carry = "note" | "deposit" | "check" | "fee" | "eth" | "sign" | "credit" | "stamp";
export type Msg = { from: number; to: number; text: string; style?: Style; carry: Carry; caption: string };

const S = LEDGER_SYMBOL;

export const PHASES: { title: string; msgs: Msg[] }[] = [
  {
    title: "Alice Pays Bob in One Transaction",
    msgs: [
      {
        from: ALICE,
        to: ALICE,
        text: "signs “0.4 to Bob” with her leanSPHINCS key",
        carry: "sign",
        caption: "Alice signs “0.4 to Bob” with her leanSPHINCS key, in her browser.",
      },
      {
        from: AW,
        to: L,
        text: "transfer, with 1 ETC attached",
        carry: "deposit",
        caption: `Alice's browser wallet sends ${S} one transaction, the signed transfer with 1 ETC attached. The wallet pays the gas.`,
      },
      {
        from: L,
        to: L,
        text: `credits 1 ${S} to Alice`,
        carry: "credit",
        caption: `${S} credits the 1 ETC to Alice as 1 ${S}.`,
      },
      {
        from: L,
        to: V,
        text: "verify Alice's signature",
        carry: "note",
        caption: `${S} hands Alice's signature and public key to the leanSPHINCS verifier.`,
      },
      { from: V, to: L, text: "valid", style: "reply", carry: "check", caption: "The verifier answers valid." },
      {
        from: L,
        to: L,
        text: `moves 0.4 ${S} to Bob, emits the memo`,
        carry: "stamp",
        caption: `${S} moves 0.4 ${S} from Alice to Bob and emits the memo. Alice has 0.6 ${S} left and Bob has 0.4.`,
      },
    ],
  },
  {
    title: "Bob Pays Alice Back Through a Relayer",
    msgs: [
      {
        from: BOB,
        to: BOB,
        text: "signs “0.1 to Alice, fee 0.001”",
        carry: "sign",
        caption: "Bob signs “0.1 to Alice, fee 0.001” with his leanSPHINCS key. He has no ETC for gas.",
      },
      {
        from: BOB,
        to: R,
        text: "the signed message, off chain",
        style: "offchain",
        carry: "note",
        caption: "Bob hands the signed message to a relayer, off chain.",
      },
      {
        from: R,
        to: L,
        text: "transfer",
        carry: "note",
        caption: `The relayer submits Bob's transfer to ${S} and pays the gas.`,
      },
      {
        from: L,
        to: V,
        text: "verify Bob's signature",
        carry: "note",
        caption: `${S} hands Bob's signature and public key to the verifier.`,
      },
      { from: V, to: L, text: "valid", style: "reply", carry: "check", caption: "The verifier answers valid." },
      {
        from: L,
        to: R,
        text: "pays the 0.001 ETC fee",
        style: "pay",
        carry: "fee",
        caption: `${S} moves 0.1 ${S} from Bob to Alice and pays the relayer the 0.001 ETC fee out of Bob's balance. Bob has 0.299 ${S} and Alice 0.7.`,
      },
    ],
  },
  {
    title: "Bob Withdraws to a Fresh Address",
    msgs: [
      {
        from: BOB,
        to: R,
        text: "signed withdraw of 0.2 to his fresh address",
        style: "offchain",
        carry: "note",
        caption: "Bob signs a withdraw of 0.2 to his fresh address with a 0.001 fee, and hands it to the relayer off chain.",
      },
      {
        from: R,
        to: L,
        text: "withdraw",
        carry: "note",
        caption: `The relayer submits the withdraw to ${S} and pays the gas.`,
      },
      {
        from: L,
        to: V,
        text: "verify",
        carry: "note",
        caption: `${S} hands Bob's signature to the verifier, and it checks out.`,
      },
      {
        from: L,
        to: FRESH,
        text: "sends 0.2 ETC",
        style: "pay",
        carry: "eth",
        caption: `${S} sends 0.2 ETC to Bob's fresh address and the 0.001 ETC fee to the relayer. Bob has 0.098 ${S} left.`,
      },
    ],
  },
];

export type Step = Msg & { n: number; phase: number };
export const STEPS: Step[] = PHASES.flatMap((ph, phase) => ph.msgs.map((m) => ({ ...m, phase }))).map((m, i) => ({ ...m, n: i + 1 }));

/** The screen-reader sentence for a message, kept word for word from the README diagram's form. */
export function sentence(m: Msg) {
  const from = PARTIES[m.from].name;
  if (m.from === m.to) return `${from} ${m.text}.`;
  return `${from} to ${PARTIES[m.to].name}: ${m.text}.`;
}

// ---------------------------------------------------------------------------
// Balances. In thousandths, so the sums stay exact.
// ---------------------------------------------------------------------------

export type Balances = { alice: number; bob: number; relayer: number; fresh: number };
const START: Balances = { alice: 0, bob: 0, relayer: 0, fresh: 0 };
/** What changes once step n (1-based) has happened. */
const EFFECTS: Record<number, Partial<Balances>> = {
  3: { alice: 1000 },
  6: { alice: 600, bob: 400 },
  12: { alice: 700, bob: 299, relayer: 1 },
  16: { bob: 98, relayer: 2, fresh: 200 },
};

/** The balances after the first `done` steps have happened (0 is the start). */
export function balancesAfter(done: number): Balances {
  const b = { ...START };
  for (let n = 1; n <= done; n++) Object.assign(b, EFFECTS[n]);
  return b;
}

/** 600 thousandths as "0.6". */
export const fmt = (milli: number) => String(milli / 1000);

// ---------------------------------------------------------------------------
// Timing, in milliseconds at normal speed.
// ---------------------------------------------------------------------------

/** How long the cat takes for a step: running scales with distance, in-place actions are fixed. */
export function runMs(s: Step): number {
  if (s.from === s.to) return 1500;
  return 650 + 170 * Math.abs(s.to - s.from);
}
/** The pause after the cat arrives, before the next step. */
export const DWELL_MS = 900;
