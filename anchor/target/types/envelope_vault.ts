/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/envelope_vault.json`.
 */
export type EnvelopeVault = {
  "address": "43kwURZxpDniSpWPSfxyqUSc3kwuaCEmAJmSKtqdxMXi",
  "metadata": {
    "name": "envelopeVault",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "1:1 USDC <-> cUSDC wrapping, tier-based daily limits, and the event-pot registry"
  },
  "instructions": [
    {
      "name": "closePot",
      "discriminator": [
        214,
        103,
        62,
        202,
        132,
        229,
        27,
        86
      ],
      "accounts": [
        {
          "name": "host",
          "signer": true,
          "relations": [
            "pot"
          ]
        },
        {
          "name": "pot",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "host"
              },
              {
                "kind": "arg",
                "path": "potId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "potId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "createPot",
      "discriminator": [
        232,
        45,
        123,
        181,
        204,
        121,
        131,
        9
      ],
      "accounts": [
        {
          "name": "host",
          "writable": true,
          "signer": true
        },
        {
          "name": "pot",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "host"
              },
              {
                "kind": "arg",
                "path": "potId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "potId",
          "type": "u64"
        },
        {
          "name": "name",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "closeTs",
          "type": "i64"
        },
        {
          "name": "potOwner",
          "type": "pubkey"
        },
        {
          "name": "potTokenAccount",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "initialize",
      "docs": [
        "Admin-only, once. Records the mints, the vault's USDC ATA, and the per-tier daily wrap",
        "limits. `envelope_stake` is trusted directly by its compiled-in program ID (see `wrap`),",
        "not by anything supplied here."
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "address": "7cTceTkWuAEuhFwinrdFqg5udxAKtrcihtxxJoDTbig1"
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "vaultAuthority",
          "docs": [
            "holds no account data of its own."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "docs": [
            "Classic SPL Token mint (mock USDC, or Circle's real devnet/mainnet USDC)."
          ]
        },
        {
          "name": "cusdcMint",
          "docs": [
            "Token-2022 mint with the `ConfidentialTransferMint` extension (cUSDC). `InterfaceAccount`",
            "(not `Account<token::Mint>`) because the extension data makes this longer than a base mint."
          ]
        },
        {
          "name": "vaultUsdc",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "limits",
          "type": {
            "array": [
              "u64",
              3
            ]
          }
        },
        {
          "name": "secondsPerDay",
          "type": "i64"
        }
      ]
    },
    {
      "name": "initializeAsset",
      "docs": [
        "Admin-only, once per asset. Registers another underlying <-> confidential mint pair",
        "(e.g. SKR <-> cSKR) and creates the vault's account for the underlying."
      ],
      "discriminator": [
        214,
        153,
        49,
        248,
        95,
        248,
        208,
        179
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "address": "7cTceTkWuAEuhFwinrdFqg5udxAKtrcihtxxJoDTbig1"
        },
        {
          "name": "assetVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "underlyingMint"
              }
            ]
          }
        },
        {
          "name": "vaultAuthority",
          "docs": [
            "vault token account); holds no account data of its own."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "underlyingMint",
          "docs": [
            "Classic SPL Token mint (SKR)."
          ]
        },
        {
          "name": "confidentialMint",
          "docs": [
            "Token-2022 confidential mint (cSKR). Checked here, once, so `wrap_asset` can never be",
            "pointed at a mint the vault can't mint, or one whose units don't match 1:1."
          ]
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "underlyingMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "unwrap",
      "docs": [
        "Public cUSDC -> USDC, 1:1. Requires a preceding top-level `Approve(vault_authority,",
        "amount)` in the same transaction — see `Unwrap`'s account docs for why."
      ],
      "discriminator": [
        126,
        175,
        198,
        14,
        212,
        69,
        50,
        44
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "vaultAuthority",
          "docs": [
            "top-level `Approve`) the delegate on `user_cusdc` for at least `amount`."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "cusdcMint",
          "writable": true
        },
        {
          "name": "userCusdc",
          "writable": true
        },
        {
          "name": "vaultUsdc",
          "writable": true
        },
        {
          "name": "userUsdc",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "unwrapAsset",
      "docs": [
        "Public confidential tokens -> underlying, 1:1. Requires a preceding top-level",
        "`Approve(vault_authority, amount)` in the same transaction, as `unwrap` does."
      ],
      "discriminator": [
        182,
        97,
        106,
        128,
        122,
        198,
        168,
        105
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "assetVault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "underlyingMint"
              }
            ]
          }
        },
        {
          "name": "vaultAuthority",
          "docs": [
            "preceding top-level `Approve`) the delegate on `user_confidential` for at least `amount`."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "underlyingMint"
        },
        {
          "name": "confidentialMint",
          "writable": true
        },
        {
          "name": "userConfidential",
          "writable": true
        },
        {
          "name": "vaultTokenAccount",
          "writable": true
        },
        {
          "name": "userUnderlying",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "wrap",
      "docs": [
        "USDC -> public cUSDC, 1:1, gated by the caller's staking tier's daily limit."
      ],
      "discriminator": [
        178,
        40,
        10,
        189,
        228,
        129,
        186,
        140
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "vaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "docs": [
            "The stake pool singleton — read-only, for tier thresholds. `envelope_stake` is a real",
            "dependency (not a mirror), so `Account<'info, Pool>`'s built-in owner check already",
            "requires ownership by `envelope_stake::ID` correctly; `seeds::program` only needs to",
            "override which program the PDA is *derived* against (it defaults to this program's ID)."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                30,
                59,
                28,
                86,
                113,
                215,
                29,
                158,
                122,
                164,
                170,
                211,
                52,
                27,
                87,
                96,
                193,
                240,
                242,
                7,
                8,
                93,
                217,
                116,
                195,
                25,
                106,
                76,
                214,
                105,
                224,
                163
              ]
            }
          }
        },
        {
          "name": "stakePosition",
          "docs": [
            "who has never staked has no such account yet (envelope_stake's `stake` creates it on",
            "first use), and that's an ordinary Free-tier caller, not an error — so this is read as",
            "`UncheckedAccount` and treated as \"nothing staked\" when absent. The handler manually",
            "verifies ownership (`envelope_stake::ID`) and the account's own `user` field whenever it",
            "isn't empty; the `seeds`/`seeds::program` constraint below additionally pins the address."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                30,
                59,
                28,
                86,
                113,
                215,
                29,
                158,
                122,
                164,
                170,
                211,
                52,
                27,
                87,
                96,
                193,
                240,
                242,
                7,
                8,
                93,
                217,
                116,
                195,
                25,
                106,
                76,
                214,
                105,
                224,
                163
              ]
            }
          }
        },
        {
          "name": "userDaily",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  105,
                  108,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "userUsdc",
          "writable": true
        },
        {
          "name": "vaultUsdc",
          "writable": true
        },
        {
          "name": "cusdcMint",
          "writable": true
        },
        {
          "name": "userCusdc",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "wrapAsset",
      "docs": [
        "Underlying -> public confidential tokens, 1:1. No tier limit (see `AssetVault`)."
      ],
      "discriminator": [
        75,
        63,
        96,
        57,
        92,
        198,
        158,
        199
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "assetVault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "underlyingMint"
              }
            ]
          }
        },
        {
          "name": "vaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "underlyingMint",
          "docs": [
            "Pins which asset this is; `asset_vault`'s seeds tie the two together."
          ]
        },
        {
          "name": "userUnderlying",
          "writable": true
        },
        {
          "name": "vaultTokenAccount",
          "writable": true
        },
        {
          "name": "confidentialMint",
          "writable": true
        },
        {
          "name": "userConfidential",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "assetVault",
      "discriminator": [
        193,
        119,
        127,
        25,
        157,
        102,
        175,
        164
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "pot",
      "discriminator": [
        238,
        118,
        60,
        175,
        178,
        191,
        59,
        58
      ]
    },
    {
      "name": "userDaily",
      "discriminator": [
        80,
        73,
        65,
        189,
        164,
        67,
        220,
        47
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6001,
      "name": "dailyLimitExceeded",
      "msg": "Daily wrap limit exceeded for this tier"
    },
    {
      "code": 6002,
      "name": "invalidStakePosition",
      "msg": "Stake position does not belong to this user"
    },
    {
      "code": 6003,
      "name": "missingDelegateApproval",
      "msg": "VaultAuth is not the approved delegate on this account"
    },
    {
      "code": 6004,
      "name": "potAlreadyClosed",
      "msg": "Pot is already closed"
    },
    {
      "code": 6005,
      "name": "unauthorized",
      "msg": "Only the designated admin may call this instruction"
    },
    {
      "code": 6006,
      "name": "invalidAssetMint",
      "msg": "Confidential mint must be minted by the vault and match the underlying mint's decimals"
    }
  ],
  "types": [
    {
      "name": "assetVault",
      "docs": [
        "A wrappable asset beyond the original USDC <-> cUSDC pair, which keeps its own `Config`",
        "fields so existing deployments are untouched. One per underlying mint (e.g. SKR <-> cSKR),",
        "PDA-seeded by that mint. No tier limits: those exist to cap dollars entering the private",
        "system, and are enforced on `wrap` (USDC) only."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "underlyingMint",
            "docs": [
              "Classic SPL Token mint users deposit (SKR)."
            ],
            "type": "pubkey"
          },
          {
            "name": "confidentialMint",
            "docs": [
              "Token-2022 mint with the `ConfidentialTransferMint` extension, minted 1:1 (cSKR)."
            ],
            "type": "pubkey"
          },
          {
            "name": "vaultTokenAccount",
            "docs": [
              "The vault's ATA of `underlying_mint`, owned by the VaultAuth PDA."
            ],
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "cusdcMint",
            "type": "pubkey"
          },
          {
            "name": "vaultUsdc",
            "type": "pubkey"
          },
          {
            "name": "stakeProgram",
            "type": "pubkey"
          },
          {
            "name": "limits",
            "docs": [
              "Per-tier daily wrap limit, in USDC base units. Indexed by `Tier as usize`."
            ],
            "type": {
              "array": [
                "u64",
                3
              ]
            }
          },
          {
            "name": "secondsPerDay",
            "docs": [
              "Length of a \"day\" for `UserDaily.day_index` purposes, in seconds. A runtime field (not a",
              "compile-time constant) specifically so tests can pass a short value at `initialize` time",
              "without needing a second build of the program."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "pool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "skrMint",
            "type": "pubkey"
          },
          {
            "name": "vaultSkr",
            "type": "pubkey"
          },
          {
            "name": "memberThreshold",
            "type": "u64"
          },
          {
            "name": "businessThreshold",
            "type": "u64"
          },
          {
            "name": "cooldownSecs",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "pot",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "host",
            "type": "pubkey"
          },
          {
            "name": "potId",
            "type": "u64"
          },
          {
            "name": "potOwner",
            "type": "pubkey"
          },
          {
            "name": "potTokenAccount",
            "type": "pubkey"
          },
          {
            "name": "name",
            "docs": [
              "UTF-8, zero-padded; trim trailing `\\0` bytes client-side."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "closeTs",
            "type": "i64"
          },
          {
            "name": "closed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "userDaily",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "dayIndex",
            "docs": [
              "`unix_timestamp / SECONDS_PER_DAY` — the day this counter last reset on."
            ],
            "type": "i64"
          },
          {
            "name": "depositedToday",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "assetSeed",
      "type": "bytes",
      "value": "[97, 115, 115, 101, 116]"
    },
    {
      "name": "configSeed",
      "type": "bytes",
      "value": "[99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "potSeed",
      "type": "bytes",
      "value": "[112, 111, 116]"
    },
    {
      "name": "userDailySeed",
      "type": "bytes",
      "value": "[100, 97, 105, 108, 121]"
    },
    {
      "name": "vaultAuthSeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116]"
    }
  ]
};
