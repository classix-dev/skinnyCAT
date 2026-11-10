{
  description = "pq-sig: a leanSPHINCS-controlled wallet on Ethereum Classic";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/4fe25e12eb9f4c744966dd3de5a05246cf098601";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin" ];
      forAll = f: nixpkgs.lib.genAttrs systems (s: f nixpkgs.legacyPackages.${s});
    in {
      devShells = forAll (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.foundry
            pkgs.solc
            pkgs.nodejs_22
            (pkgs.python3.withPackages (ps: [ ps.pycryptodome ]))
          ];
        };
      });
    };
}
