/* Chain-1404 Stake Manager — public pins only. No secrets. */
window.C1404_PINS = {
  name: "Chain-1404 Stake Manager",
  short: "C1404",
  version: "1.4.0",
  chainId: 1404,
  chainIdHex: "0x57c",
  symbol: "BDAG",
  decimals: 18,
  fork: {
    lastShared: 316001,
    firstDivergent: 316002,
    lastSharedHex: "0x4d261",
    firstDivergentHex: "0x4d262",
    splitUtc: "2026-02-17T22:03:01Z",
    genesisSweepUtc: "2026-02-11T08:07:51Z",
    stakingDeployApprox: 10755967,
    julyIsolationApprox: 14394144,
    julyIsolationUtc: "2026-07-15T15:28:00Z",
    community316002: "0xcd4d2568e9cba6725329e8cf6d96217ace7acb03d71d9b519c8b2560bb6bb781",
    rejectHosts: [
      "bdagscan.com", "rpc.bdagscan.com", "www.bdagscan.com",
      "blockdag.works", "rpc.blockdag.works", "www.blockdag.works"
    ]
  },
  implSlot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  contracts: [
    {
      id: "community-v1",
      label: "Community staking proxy v1",
      proxy: "0x08Bd519F611556dC148e7BfFE8d6f078F23a8EF7",
      implementation: "0xdc1440ab25b1a3727ddc4ad2bd20a185a0c03fea",
      owner: "0x4f1536fc181c541f3ef766d227373f55d03ce0ba",
      abi: "v1",
      note: "Reviewed community pin"
    }
  ],
  blocklist: {
    full: "0xe628505d5cB6F5F4f9a25Cd5c80Caa198cc645a0",
    selective: "0xc0a42A43A05e39C3a4165CA98440D516959f41D9"
  },
  constants: {
    minStakeWei: "1000000000000000",
    epochSeconds: 604800,
    bondingSeconds: 2419200,
    unbondingSeconds: 1814400
  },
  sel: {
    owner: "0x8da5cb5b",
    paused: "0x5c975abb",
    currentEpoch: "0x76671808",
    genesisTime: "0x42c6498a",
    timeToNextEpoch: "0x3a636645",
    minStake: "0xcb1c2b5c",
    stake: "0x294091cd",
    unstake: "0x867f1a3e",
    claimStake: "0xf3363c52",
    getUnbondingRequests: "0x7d18ceb1",
    poolStakerAmounts: "0xfee4e9f6",
    stakerPrincipal: "0xd8c28861",
    stakerUnbonding: "0x85952e31",
    poolStakerYield: "0xbf6ed885",
    userFirstDeposit: "0x75b12521",
    poolTotalStake: "0x31f96f32",
    minerSplit: "0x15656e6a",
    stakerSplit: "0xb2fe7213",
    isBlocked: "0xfbac3951",
    isRestricted: "0xc01bc982"
  },
  rpcs: [
    { name: "BDAG-US East", url: "https://rpc.east.bdag-us.org" },
    { name: "BDAG-US West", url: "https://rpc.west.bdag-us.org" },
    { name: "WelshDAG", url: "https://rpc.welshdag.trade" },
    { name: "Engineering", url: "https://rpc.blockdag.engineering" },
    { name: "CapeDAG", url: "https://rpc.capedag.com" },
    { name: "DVD Mining", url: "https://rpc.dvdmining.com" }
  ],
  compareRpcs: [
    { name: "rpc.bdagscan.com", url: "https://rpc.bdagscan.com", family: "divergent" },
    { name: "rpc.blockdag.works", url: "https://rpc.blockdag.works", family: "divergent" }
  ],
  explorers: [
    { name: "WelshDAG scan", url: "https://scan.welshdag.trade" },
    { name: "BDAG-US East", url: "https://explorer.east.bdag-us.org" }
  ],
  kedge: "https://psycho-v1.github.io/kedge"
};
