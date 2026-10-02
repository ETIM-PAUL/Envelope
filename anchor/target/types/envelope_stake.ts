/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/envelope_stake.json`.
 */
export type EnvelopeStake = {
  "address": "331WWNPRsoCJToHMrsbGPUC338DfqYEbMhiECL9jFqfx",
  "metadata": {
    "name": "envelopeStake",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "SKR staking that defines Envelope's Free/Member/Business tiers"
  },
  "instructions": [
    {
      "name": "initialize",
      "docs": [
        "Admin-only, once. Records the SKR mint, the pool's vault ATA, and the tier thresholds +",
        "unstake cooldown."
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
          "name": "pool",
          "writable": true,
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
            ]
          }
        },
        {
          "name": "poolAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "skrMint"
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
          "name": "vaultSkr",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "poolAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "skrMint"
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
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
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
        }
      ]
    },
    {
      "name": "requestUnstake",
      "docs": [
        "Starts the cooldown for the caller's whole stake position. Tier drops to `Free`",
        "immediately (see `tier::tier_for_stake`)."
      ],
      "discriminator": [
        44,
        154,
        110,
        253,
        160,
        202,
        54,
        34
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true,
          "relations": [
            "stakePosition"
          ]
        },
        {
          "name": "stakePosition",
          "writable": true,
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
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "stake",
      "docs": [
        "SKR user -> vault_skr; increases the caller's staked amount."
      ],
      "discriminator": [
        206,
        176,
        202,
        18,
        200,
        209,
        179,
        108
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "pool",
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
            ]
          }
        },
        {
          "name": "stakePosition",
          "writable": true,
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
            ]
          }
        },
        {
          "name": "userSkr",
          "writable": true
        },
        {
          "name": "vaultSkr",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
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
      "name": "withdrawUnstaked",
      "docs": [
        "After the cooldown elapses, returns the full staked amount to the caller and resets the",
        "stake position."
      ],
      "discriminator": [
        19,
        202,
        68,
        255,
        216,
        40,
        205,
        61
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true,
          "relations": [
            "stakePosition"
          ]
        },
        {
          "name": "pool",
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
            ]
          }
        },
        {
          "name": "poolAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "stakePosition",
          "writable": true,
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
            ]
          }
        },
        {
          "name": "vaultSkr",
          "writable": true
        },
        {
          "name": "userSkr",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "pool",
      "discriminator": [
        241,
        154,
        109,
        4,
        17,
        177,
        109,
        188
      ]
    },
    {
      "name": "stakePosition",
      "discriminator": [
        78,
        165,
        30,
        111,
        171,
        125,
        11,
        220
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
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6002,
      "name": "unstakeAlreadyRequested",
      "msg": "An unstake request is already pending for this stake position"
    },
    {
      "code": 6003,
      "name": "cannotStakeDuringUnstake",
      "msg": "Cannot stake more while an unstake request is pending — withdraw or wait it out first"
    },
    {
      "code": 6004,
      "name": "noUnstakeRequested",
      "msg": "No unstake has been requested for this stake position"
    },
    {
      "code": 6005,
      "name": "cooldownNotElapsed",
      "msg": "The cooldown period has not elapsed yet"
    },
    {
      "code": 6006,
      "name": "nothingStaked",
      "msg": "Nothing staked to unstake"
    },
    {
      "code": 6007,
      "name": "invalidThresholds",
      "msg": "member_threshold must be <= business_threshold"
    },
    {
      "code": 6008,
      "name": "unauthorized",
      "msg": "Only the designated admin may call this instruction"
    },
    {
      "code": 6009,
      "name": "invalidCooldown",
      "msg": "cooldown_secs must be >= 0"
    }
  ],
  "types": [
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
    }
  ],
  "constants": [
    {
      "name": "poolAuthSeed",
      "type": "bytes",
      "value": "[112, 111, 111, 108, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121]"
    },
    {
      "name": "poolSeed",
      "type": "bytes",
      "value": "[112, 111, 111, 108]"
    },
    {
      "name": "stakeSeed",
      "type": "bytes",
      "value": "[115, 116, 97, 107, 101]"
    }
  ]
};
