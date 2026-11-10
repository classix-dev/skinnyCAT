// The Aggregation section as data: the five steps of EIP-8288, how long each runs in the picture,
// and the gas sums. Every number is from docs/aggregation.md, and the sums multiply its per-signature
// figures by the six signatures in the picture.

/** Signatures in the picture. */
export const SIGS = 6;
export const SIG_BYTES = 7_740;
export const ECDSA_BYTES = 65;
export const CALLDATA_GAS = 123_000;
export const VERIFY_GAS = 86_000;
/** About what one signature costs on ETC today, calldata plus verification. */
export const TODAY_GAS = CALLDATA_GAS + VERIFY_GAS;
/** EIP-8288 as written: 3,000 for the dependency frame plus LEANSTARK_VERIFICATION_GAS. */
export const FRAME_GAS = 3_000;
export const STARK_GAS = 30_000;
export const AGG_GAS = FRAME_GAS + STARK_GAS;

export const num = (n: number) => n.toLocaleString("en-US");

export type AggStep = { n: number; title: string; caption: string };

export const AGG_STEPS: AggStep[] = [
  {
    n: 1,
    title: "Name the signature",
    caption:
      "Each transaction names its signature in a dependency frame, as a triple of the scheme byte (0x10 for leanSPHINCS), the hash that was signed and the 32-byte public key.",
  },
  {
    n: 2,
    title: "Send it alongside",
    caption: "Users send their transactions to the mempool with the 7,740-byte signatures alongside, outside the transactions themselves.",
  },
  {
    n: 3,
    title: "Fold and gossip",
    caption:
      "Every second, each mempool node checks the signatures it has seen and folds them into one recursive STARK. Nodes pass their aggregates to peers, and each merges what it receives into its own.",
  },
  {
    n: 4,
    title: "Build the block",
    caption: "The block builder merges the aggregates for the transactions it includes and puts a single recursive STARK in the block header.",
  },
  {
    n: 5,
    title: "Check one proof",
    caption: "Validators check that one proof against the dependency triples of the block's transactions. No signature appears on chain.",
  },
];

export const AGG_LAST = AGG_STEPS.length;

/** How long each step's run takes at normal speed, in ms. */
export const AGG_RUN_MS = [2000, 2200, 3400, 2600, 2600];
export const AGG_DWELL_MS = 1300;
