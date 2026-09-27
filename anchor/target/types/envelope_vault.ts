/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/envelope_vault.json`.
 */
export type EnvelopeVault = {
  "address": "B9urpR9ePgLSGPuXv8QDgEBFWth3hJHzPeJoqde3Nrjk",
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
          "signer": true
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
        }
      ]
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
                208,
                214,
                163,
                244,
                85,
                180,
                220,
                97,
                120,
                249,
                110,
                86,
                210,
                107,
                98,
                124,
                195,
                121,
                146,
                24,
                222,
                46,
                83,
                15,
                52,
                70,
                49,
                254,
                200,
                125,
                181,
                168
              ]
            }
          }
        },
        {
          "name": "stakePosition",
          "docs": [
            "The user's stake position — read-only, for their staked amount and any pending unstake."
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
                208,
                214,
                163,
                244,
                85,
                180,
                220,
                97,
                120,
                249,
                110,
                86,
                210,
                107,
                98,
                124,
                195,
                121,
                146,
                24,
                222,
                46,
                83,
                15,
                52,
                70,
                49,
                254,
                200,
                125,
                181,
                168
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
    }
  ],
  "accounts": [
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
    }
  ],
  "types": [
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
      "name": "stakePosition",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "unlockRequestedAt",
            "docs": [
              "0 when no unstake has been requested; otherwise the unix timestamp `request_unstake` was",
              "called at. Tier drops to `Free` the instant this is set — see `tier::tier_for_stake`."
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
