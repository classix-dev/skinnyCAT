# EthLib leanSPHINCS Vectors

The `key_gen`, `sign` and `verify` directories are copied unchanged from `tests/cryptography/sphincs/` of [ethereum/EthLib](https://github.com/ethereum/EthLib) at commit `ccf5c1e10`. The Sphincs module and these vectors last changed in commit [`dce7a2de23a973d84eac38126a1527763cd3465d`](https://github.com/ethereum/EthLib/commit/dce7a2de23a973d84eac38126a1527763cd3465d) (#1555, "feat(sphincs)!: follow the FIPS 205 layout"), merged 2026-11-08. Each directory's `format.md` describes its cases.

EthLib is released under CC0 1.0 Universal. Its license text is in [LICENSE-EthLib](LICENSE-EthLib).

Foundry reads JSON and not YAML, so [script/ethlib-vectors.mjs](../../../script/ethlib-vectors.mjs) writes a `data.json` next to each `data.yaml` and lists the case names in `index.json`. It also writes `vectors.json` with every case in one file, which the web app's self-test extractor reads. Rerun it after copying in new vectors.

```sh
node script/ethlib-vectors.mjs
```

The signer's tests in [signer/test/vectors.test.ts](../../../signer/test/vectors.test.ts) read the YAML files. The verifier's tests in [test/LeanSphincsVerifier.t.sol](../../LeanSphincsVerifier.t.sol) read the JSON.
