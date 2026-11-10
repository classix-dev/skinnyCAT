// All the explainer's words, so the server-rendered shell carries every scene's text and steps
// even before (or without) the animations. Style follows /CLAUDE.md of the classix repo.

export type SceneId = "hash" | "chain" | "wots" | "merkle" | "fors" | "hypertree" | "anatomy" | "verify";

export interface SceneCopy {
  id: SceneId;
  title: string;
  body: string[];
  /** One caption per step of the animation, in order. */
  steps: string[];
  /** What the picture shows, for screen readers. */
  figure: string;
}

export const INTRO = {
  kicker: "Explainer",
  title: "How a leanSPHINCS Signature Works",
  lede: [
    "A leanSPHINCS signature is built from one ingredient, the Keccak-256 hash that Ethereum Classic already runs. There is no elliptic curve inside it for a quantum computer to attack.",
    "Every picture below is drawn from the bytes of one real signature. Sign your own message and they redraw from yours.",
  ],
};

export const SCENES: SceneCopy[] = [
  {
    id: "hash",
    title: "A Hash Only Runs Forward",
    body: [
      "Keccak-256 takes any input and stirs it into 32 bytes. It runs 24 rounds over a state of 1,600 bits, and changing one letter of the input flips about half of the output bits.",
      "Running it forward takes a microsecond. Running it backward means guessing inputs until one fits. For the 16 bytes leanSPHINCS keeps, that is about 2^128 guesses.",
      "Everything else on this page is this one function, run forward many times.",
    ],
    steps: [
      "Your text goes in as bytes, padded out to a 136-byte block.",
      "24 rounds mix, rotate and shuffle the 1,600 bits until no trace of the input pattern is left.",
      "The first 32 bytes of the state are the hash.",
      "leanSPHINCS keeps the first 16 bytes of each hash. Edit the text and watch them change.",
    ],
    figure:
      "The Keccak state drawn as a 40 by 40 grid of bits. The input's bits show as a pattern at the top, and round by round the pattern turns to noise. The hash appears below in hexadecimal.",
  },
  {
    id: "chain",
    title: "A Chain You Can Only Climb",
    body: [
      "Start from a secret and hash it three times. The four values form a chain, and only the last one goes into the public key.",
      "To sign a digit from 0 to 3, the signer reveals the value at that position. Anyone can hash it forward and check that it lands on the public end. Nobody can walk it back toward the secret.",
    ],
    steps: [
      "The signer starts from a secret value at position 0.",
      "Three hashes lead to the end of the chain, which is part of the public key.",
      "To sign the digit 2, the signer reveals the value at position 2.",
      "The verifier hashes it once more and lands on the public end.",
      "Stepping back down would mean reversing Keccak. Stepping up is free for anyone, and the next scene deals with that.",
    ],
    figure:
      "A chain of four boxes, positions 0 to 3, joined by hash arrows. Positions 0 and 1 stay locked. Position 2 is revealed and an arrow carries it to the public end at position 3.",
  },
  {
    id: "wots",
    title: "64 Chains and a Fixed Sum",
    body: [
      "A one-time key is 64 such chains. The value to sign is hashed with a counter into 64 digits, one per chain, and the signer tries counter after counter until the digits add up to exactly 128.",
      "That sum blocks forgery. Anyone can raise a digit by hashing forward, but then the sum passes 128, and getting back to 128 means lowering another digit, which means hashing backward.",
      "The 64 chain ends hash into one 16-byte value, the one-time public key.",
    ],
    steps: [
      "The value to sign and a 4-byte counter hash into 64 digits from 0 to 3.",
      "Most counters give a sum near 96. The signer keeps counting until one gives exactly 128.",
      "Each chain reveals its value at the position of its digit.",
      "The verifier hashes every chain to its end. A sum of 128 leaves exactly 64 hashes.",
      "The 64 ends hash into one value, the one-time public key.",
      "Tap a chain to raise its digit. Hashing forward is allowed, but the sum no longer checks out.",
    ],
    figure:
      "64 vertical chains of four cells. A counter runs while a histogram of digit sums fills in around 96, until one lands on 128. Then each chain lights the cell at its digit, climbs to the top, and the 64 tops merge into one key.",
  },
  {
    id: "merkle",
    title: "One Root for Many Keys",
    body: [
      "A one-time key signs once, so leanSPHINCS makes many and hashes them in pairs into a tree. The tree here holds 256 one-time keys under a single 16-byte root.",
      "The signature says which key it used and carries the sibling at each level on the way up. The verifier makes one hash per level and checks that it reaches the root.",
    ],
    steps: [
      "256 one-time public keys form the bottom row.",
      "Pairs hash into parents, level by level, up to one root.",
      "This signature uses one of the 256 keys.",
      "It carries one sibling per level, 8 in all.",
      "Eight hashes climb from the key to the root.",
    ],
    figure:
      "A binary tree with 256 leaves. One leaf is lit, the eight siblings beside its path glow blue, and a cyan path climbs from the leaf to the root.",
  },
  {
    id: "fors",
    title: "FORS Signs the Message",
    body: [
      "The message itself is signed by FORS, a few-time signature. It has 24 trees with 1,024 secret leaves each.",
      "A hash of the message gives 24 numbers from 0 to 1,023. Each picks one leaf to reveal, along with the 10 siblings up to its tree's root, and the 24 roots hash into one FORS public key.",
      "To forge, someone would need a different message whose 24 picks all land on leaves that are already public.",
    ],
    steps: [
      "The randomizer, the public key and the message hash into a digest. Its first 240 bits are used here.",
      "The bits are cut into 24 numbers of 10 bits, each from 0 to 1,023.",
      "Each number picks one secret leaf in its own tree.",
      "Each revealed leaf climbs 10 levels to its tree's root.",
      "The 24 roots hash into the 16-byte FORS public key.",
    ],
    figure:
      "A strip of 240 bits splits into 24 numbers. Below are 24 small triangular trees. In each, one leaf at the position of its number lights up and a path climbs to the top, then the 24 tops merge into one key.",
  },
  {
    id: "hypertree",
    title: "Three Layers of Trees",
    body: [
      "A one-time key in a bottom tree signs the FORS key. A key in a middle tree signs the bottom tree's root, and a key in the top tree signs the middle root. The top root is the public key.",
      "Heights of 8, 8 and 10 give 2^26 bottom keys, over 67 million, each with its own FORS. The digest picks which one to use, so the signer keeps no record of what it has signed.",
      "EthLib's Lean proof gives 127-bit security for up to 2^30 signatures per key, about a billion.",
    ],
    steps: [
      "FORS signs the message and gives a 16-byte key.",
      "A one-time key in a bottom tree signs that FORS key.",
      "A one-time key in a middle tree signs the bottom tree's root.",
      "A one-time key in the top tree signs the middle root. The top root is PK.root, half of the public key.",
      "Pull back. One top tree, 1,024 middle trees, 262,144 bottom trees and 67,108,864 FORS instances.",
      "The digest's last 26 bits pick the path, so no state is kept between signatures.",
    ],
    figure:
      "Three trees stacked, the top tree largest. A cyan path runs from FORS at the bottom through a lit leaf of each tree up to the public root. Then the view pulls back to show faint copies of the lower trees under every top leaf.",
  },
  {
    id: "anatomy",
    title: "Inside 7,740 Bytes",
    body: [
      "Each square below is one byte of the signature, in the order a verifier reads it. More than half is the 24 FORS openings. The rest is three one-time signatures, each with its counter, 64 chain values and tree path.",
      "An ECDSA signature on Ethereum Classic today is 65 bytes. This one is about 119 times larger, the cost of resting on hashes alone.",
    ],
    steps: [
      "7,740 bytes, one square each.",
      "16 bytes of randomizer, then 24 FORS openings of 176 bytes, each a secret and 10 path nodes.",
      "Three layers, each a 4-byte counter, 64 chain values of 16 bytes and a path of 8, 8 or 10 nodes.",
      "An ECDSA signature fits in 65 bytes.",
    ],
    figure:
      "A mosaic of 7,740 small squares colored by section, with brightness from each byte's value. A proportional bar labels the sections. A block of 65 squares beside it shows the size of an ECDSA signature.",
  },
  {
    id: "verify",
    title: "Checking It on Chain",
    body: [
      "Verification repeats the climb. It hashes the message into the digest, opens the 24 FORS trees, walks the 64 chains of each layer and climbs each tree. If the last root equals PK.root, the signature is valid.",
      "That is 491 Keccak calls and 515 runs of the Keccak permutation. Our contract on Ethereum Classic spends about 86,000 gas on it.",
    ],
    steps: [
      "2 hashes turn the randomizer, the public key and the message into the digest.",
      "265 hashes open the 24 FORS trees and fold their roots into the FORS key.",
      "74 hashes check the bottom layer, 64 of them chain steps.",
      "74 more check the middle layer.",
      "76 check the top layer, whose tree is 10 levels tall.",
      "The last root equals PK.root, so the signature is valid.",
    ],
    figure:
      "A pipeline from the message through the digest, the FORS trees and three layers to the public root, with a running count of hashes. At the end the computed root is compared to PK.root.",
  },
];

export const QUANTUM = {
  title: "What a Quantum Computer Changes",
  cards: [
    {
      title: "ECDSA Falls",
      body: "ECDSA rests on the discrete logarithm over an elliptic curve. A large quantum computer running Shor's algorithm solves that, and recovers a private key from its public key.",
    },
    {
      title: "Hashes Hold",
      body: "Against a hash, the best known quantum attack is Grover's search, a square-root speedup. Finding an input for a 16-byte output drops from about 2^128 to about 2^64 quantum steps that must run one after another. That is the margin NIST sets for its first security level, where AES-128 sits.",
    },
  ],
};

export const CREDITS = {
  design: { label: "sphincs.art", href: "https://sphincs.art", by: "Tom Wambsgans" },
  spec: {
    label: "EthLib leanSPHINCS",
    href: "https://github.com/ethereum/EthLib/commit/dce7a2de23a973d84eac38126a1527763cd3465d",
    commit: "dce7a2d",
  },
};
