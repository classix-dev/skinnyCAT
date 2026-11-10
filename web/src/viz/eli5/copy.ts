// The words of the "Like I'm Five" explainer. Every metaphor maps to a real part of leanSPHINCS,
// and `real` says which one in plain words and links to the detailed scene that shows it.
// Style follows /CLAUDE.md of the classix repo, and the brief in docs/brand/BRIEF.md.
import type { SceneId } from "../copy";

export type Eli5Id = "blender" | "stairs" | "tree" | "picks" | "quantum" | "catch";

export interface Eli5Copy {
  id: Eli5Id;
  title: string;
  /** One or two sentences a kid could follow. */
  body: string;
  /** One caption per step of the animation. */
  steps: string[];
  /** What the picture stands for, in plain words. */
  real: string;
  /** The detailed scene that shows it for real, the id of its section. */
  realTarget: SceneId | "quantum";
  /** What the picture shows, for screen readers. */
  figure: string;
}

export const ELI5_INTRO = {
  kicker: "Explainer",
  title: "How a Quantum-Safe Signature Works",
  lede: "Alice is a cat with coins to guard. Her signature is built from one thing, a blender that only runs forward. Six pictures show how.",
};

/** The toggle's labels. */
export const MODES = { eli5: "Like I'm Five", real: "The Real Thing" } as const;

export const UI = {
  realLabel: "What it is for real",
  seeReal: "See it for real",
  toReal: "Ready for the real thing?",
  toRealBody: "The same signature, step by step, drawn from a real one.",
  toEli5: "Back to Like I'm Five",
};

export const ELI5_SCENES: Eli5Copy[] = [
  {
    id: "blender",
    title: "The Magic Blender",
    body: "Fruit goes in and a smoothie comes out. Anyone can blend the same fruit and check that it makes the same smoothie, but nobody can turn a smoothie back into fruit.",
    steps: [
      "Fruit drops into the magic blender.",
      "Whirr! Out comes a smoothie.",
      "Blend the same fruit again and you get the same smoothie.",
      "But nobody can turn a smoothie back into fruit.",
    ],
    real: "A hash function, Keccak-256. Anything goes in, a short fingerprint comes out, and nobody can run it backward.",
    realTarget: "hash",
    figure:
      "Three pieces of fruit drop into a blender, which spins and fills a glass with a cyan smoothie. The same fruit blended again fills a second glass with the same smoothie. A red arrow from the smoothie back to the fruit is crossed out.",
  },
  {
    id: "stairs",
    title: "Secret Stairs",
    body: "Alice hides a secret note at the bottom of each staircase, and the tops are public. Each step up is one more trip through the blender, so anyone can carry a note up and nobody can carry it down.",
    steps: [
      "A secret note waits at the bottom of each staircase. The tops are public.",
      "To sign, Alice shows each note partway up. The message picks how high.",
      "Anyone can carry the notes up to the tops and check that they match.",
      "The steps must add up to 7. A cheat who moves a note up makes 8. Caught!",
      "To get back to 7 he would have to move a note down, and nobody can.",
    ],
    real: "A one-time signature made of hash chains. leanSPHINCS uses 64 chains of four steps, and the steps in a signature must add up to exactly 128.",
    realTarget: "wots",
    figure:
      "Four staircases, each with a locked note at the bottom and a cyan star on top. Notes appear at heights 2, 1, 2 and 2, which add up to 7, then climb to the tops and match. A masked cat pushes one note up a step, the total turns to 8 and goes red, and an arrow pointing down the stairs is crossed out.",
  },
  {
    id: "tree",
    title: "One Name Tag for Millions of Stairs",
    body: "A set of stairs is safe for signing one thing only, so Alice builds millions of them. They blend together in pairs, level by level, into one name tag, her public key.",
    steps: [
      "A set of stairs signs one thing only, so Alice builds lots of them.",
      "Pairs go through the blender together, level by level.",
      "One name tag is left at the top. That's Alice's public key.",
      "A signature shows one set of stairs and the neighbors it needs to climb to the tag.",
    ],
    real: "A Merkle tree. leanSPHINCS stacks three layers of them, with about 67 million one-time keys under one 16-byte root.",
    realTarget: "merkle",
    figure:
      "Eight small staircases in a row. Pairs join into colored dots, level by level, up to a cyan name tag. One staircase lights up, its neighbor at each level glows blue, and a cat climbs the lit path to the tag.",
  },
  {
    id: "picks",
    title: "The Message Picks the Stairs",
    body: "Alice blends each message, and the smoothie points at the spot to sign from. She never keeps a list, and each spot can safely sign a few times, so one key signs about a billion times. That's more lives than any cat needs.",
    steps: [
      "Alice blends the message, and the smoothie points at a spot to sign from.",
      "A new message points somewhere new. Alice keeps no list.",
      "One key is good for about a billion signatures.",
      "That's more lives than any cat needs.",
    ],
    real: "The message's hash picks one of 67 million FORS keys, a kind that can sign a few times. EthLib's proof covers 2^30 signatures per key.",
    realTarget: "hypertree",
    figure:
      "Alice drops a letter into a small blender, and a cyan beam points at one square in a big grid. More letters light more squares while a counter climbs to 1,073,741,824. Nine small hearts beside Alice stand for a cat's nine lives.",
  },
  {
    id: "quantum",
    title: "Why a Quantum Computer Can't Help",
    body: "A big quantum computer is great at picking one kind of math lock, the kind on today's ECDSA keys, and that lock is in trouble. Against the blender it can only guess faster, which still leaves about 2^64 guesses, far out of reach.",
    steps: [
      "Here comes a big quantum computer.",
      "It can pick the math lock on today's ECDSA keys.",
      "Against the blender all it can do is guess, a lot faster than before.",
      "That still leaves about 2^64 guesses. Far out of reach.",
    ],
    real: "Shor's algorithm breaks ECDSA. Against a hash the best known attack is Grover's search, which cuts 2^128 guesses to about 2^64, the bar AES-128 sets.",
    realTarget: "quantum",
    figure:
      "A quantum computer, drawn as a glowing chandelier, zaps a padlock marked ECDSA and the lock springs open. Then it throws fruit guesses at the blender, and every guess misses. A counter of guesses needed drops from 2 to the 128 to 2 to the 64 and stays out of reach.",
  },
  {
    id: "catch",
    title: "The Catch",
    body: "Alice's signature is big, a long scroll next to today's sticky note, so it costs more gas. When a contract checks it, the box opens and the skinny cat jumps out.",
    steps: [
      "Today's signatures fit on a sticky note, 65 bytes.",
      "Alice's is a long scroll, 7,740 bytes.",
      "Bigger means more gas, about 14 times a plain transfer.",
      "A contract checks the scroll. It's valid, so the box opens and the skinny cat jumps out.",
    ],
    real: "A leanSPHINCS signature is 7,740 bytes, about 119 times an ECDSA one. Checking it on chain takes 491 hashes and about 86,000 gas.",
    realTarget: "anatomy",
    figure:
      "A small yellow sticky note marked 65 bytes beside a long scroll that unrolls to 7,740 bytes. A gas bar for Alice's send grows to 14 times the bar for a plain transfer. The scroll drops into a box, the box opens and a skinny cat jumps out, its tail a lit path.",
  },
];

/** The id of the element a "see it for real" link scrolls to in the detailed explainer. */
export const realAnchor = (target: Eli5Copy["realTarget"]) => (target === "quantum" ? "how-quantum-h" : `how-${target}`);
