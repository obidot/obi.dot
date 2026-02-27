# Bifrost

## What is Bifrost

Bifrost is a Liquid Staking app-chain tailored for all blockchains, utilizing decentralized cross-chain interoperability to empower users to earn staking rewards and DeFi yields with flexibility, liquidity, and high security across multiple chains.

The easiest way to understand Bifrost is to see it as a derivative issuer that provides liquidity for all pledged assets, issuing corresponding shadow assets during the bonding period of the original assets. At the same time, the shadow asset is a fungible Token that can be circulated in different DEXs, pools, protocols and across chains.

As a DeFi protocol, Bifrost is aiming to solve the following issues in PoS ecosystems:
- The paradox between staking rewards and DeFi yields
- The balance between staking/circulating tokens and security of PoS chains
- Staking rewards in cross-chain scenario

According to the questions above, Bifrost's solution vToken (liquid staking voucher Token) enables users to convert their PoS tokens into vTokens in order to obtain staking liquidity and staking rewards synchronously, without barriers in cross-chain scenarios.

### Why Bifrost?

Have a look to the blog article: [A Deep Dive into Bifrost App Chain Liquid Staking Strategy](https://bifrost.io/blog/article-9)

### Liquid-Staking

Mint vTokens on Bifrost (equals stake through Bifrost), you can control your underlying staking assets during the locked period.

### Automatic Staking Management
Bifrost Staking protocols run under the Bifrost pallets, earning staking rewards every era, without centralized risks.

### Reduced Unstaking Period
Bifrost SLP helps users to realize the possibility of early redemption by matching the real-time staking quantity with the redemption quantity at the protocol layer in the form of a queue. Theoretically, it can achieve faster redemption.

### Extra Staking Returns + DeFi Yields
Bifrost offers delegate staking for users by selecting a set of validators and rebalancing the rewards to give more profitable solutions. By holding vTokens, you will have chances to head into a world of yield scenarios.

### Bifrost vs Others

#### Bifrost's LSTs advantages

Have a look to the blog article: [The Feedback and Growth Potential of Bifrost](https://bifrost.io/blog/the-feedback-and-growth-potential-of-bifrost)

Bifrost, as a blockchain, can provide LSTs with a more diverse omni-chain adaptation scenario:
Standardized RPC to be integrated by different consensus.

- Concentrate liquidity on a single spot to support omni-chain applications.
- Retain governance rights.
- All types of tokens can be staked through Bifrost DApp.
- Bifrost LST can be set as Gas Fee.
- Leverage staking

By using intelligent node filtering, Bifrost can provide a Token base APY that is more competitive than other products. The Defi use case scenario of LSTs makes it easier for users to compound more profits.

Many liquid staking projects on the same track directly deploy contracts on other chains without having their own chains. Why does Bifrost build a chain?

To answer this question, it is necessary to clarify the concept of vTokens in the architectural design: most liquid staking protocol are built on the original chain. 

Lido’s ETH liquidity staking protocol is an Ethereum contract implemented in the Solidity language, while Lido’s SOL liquidity staking protocol is a Solana contract implemented in the Rust language. Thus, the native chain for Lido staking derivative, stETH, Ethereum derivative, and its native format is ERC-20. Lido’s SOL (native chain) staking derivative is Solana, while the native format is SPL.

The vToken adopts a cross-chain minting scheme.

All vTokens are minted on the Bifrost chain. That is to say, all vTokens are on Bifrost chain. Since Bifrost is a Kusama/Polkadot parachain, all vTokens are native assets of the Dotsama ecosystem.

> The future is omni-chain!

This is one of our fundamental judgement. Based on this, we believe that cross-chain applications will be the main form of dApps in the future, and that cross-chain calls between different applications on different chains will be the norm. 

Therefore, Bifrost has designed many of its DeFi products, including the SLP protocol, with the ease of cross-chain integration in mind. And we believe that the entire ecosystem (including the heterogeneous chain ecosystem that bridges into it) and XCM-based communications will further enable cross-chain integration between applications.

Bifrost cross-chain architecture
Cross-chain architecture and SLPx
Bifrost's Unique Approach
Unlike Ethereum's liquid staking protocols, Bifrost from inception has supported Polkadot's Omni-chain ecosystem. This strategic choice allows Bifrost to address the cross-chain friction users face when minting and using vTokens across the Omni-chain.

Why use a cross-chain architecture?
To understand the need for cross-chain architecture, consider a user who intends to mint vGLMR. They must first transfer GLMR from Moonbeam to the Bifrost-Polkadot chain. After minting, if the user wishes to use it on Moonbeam, they must transfer the vGLMR back to Moonbeam. This complex process requires multiple transactions, making it cumbersome for the user.

However, Bifrost's cross-chain architecture and SLPx module simplify these complexities. They offer users a seamless experience by combining all vToken minting processes into one transaction on a single chain.

Simplified Process

Under the cross-chain architecture, instead of deploying SLP modules on multiple chains, Bifrost allows other chains to utilize the existing SLP modules on the Bifrost-Polkadot, Bifrost-Kusama, and Ethereum chains through cross-chain remote calls.

For instance, to mint vGLMR, users only need to initiate a minting request on Moonbeam. The remote call module on Moonbeam will cross-chain transfer the user's GLMR to the Bifrost-Polkadot chain, where it is minted into vGLMR. After minting, vGLMR is transferred back to the Moonbeam chain.

Throughout this process, users do not perceive the underlying cross-chain operations; they only experience the seamless minting of GLMR into vGLMR on Moonbeam.

The redemption of vGLMR to GLMR and swaps follows a similar mechanism.

Like a chain franchise, this structure resembles a "headquarters + branch" system. Users interact with the branches on different chains. These branches communicate with the headquarters to obtain results, which are then presented to the users. This abstraction allows users to interact with the branches without being aware of the underlying cross-chain operations.

Advantages of Cross-chain Architecture
Unified Liquidity

Bifrost eliminates the need to bootstrap the liquidity of vTokens on multiple chains by consolidating liquidity onto a single chain. This optimization reduces user transaction fees and improves overall efficiency.

For example, when users want to swap vGLMR to GLMR, they can utilize the unified liquidity pool on the Bifrost-Polkadot chain via remote calls. This approach ensures better transaction prices and execution, avoiding the additional costs associated with bootstrapping liquidity on other chains like Moonbeam.

Cross-chain composability

Have a look to the blog article: [Bifrost Tokenomics and vTokens Application Scenarios](https://bifrost.io/blog/bifrost-tokenomics-and-vtokens-application-scenarios)

Furthermore, when a DeFi project seeks to integrate vTokens, it no longer needs to integrate SLP modules from different chains separately. Instead, the project only needs to communicate with the primary SLP protocol on a single chain (or a few selected chains).

The SLP modules on Bifrost-Polkadot, Bifrost-Kusama, and Ethereum maintain the global and comprehensive status of vTokens. Ideally, in a fully interoperable blockchain ecosystem, the SLP module on Bifrost-Polkadot will hold the global and comprehensive status of vTokens, streamlining the integration process for various DeFi projects.

Bifrost security model
In the world of DeFi, Liquid Staking has surpassed decentralized exchanges (DEXs) to achieve the highest Total Value Locked (TVL). Liquid Staking Token (LST) protocols manage substantial assets, significantly impacting the security and functionality of their underlying Proof-of-Stake (PoS) chains.

Bifrost's cross-chain architecture enhances the interoperability and efficiency of DeFi applications. However, effective cross-chain communication and seamless user experiences require a robust security framework. Bifrost addresses this need with a comprehensive security model that protects staked assets and maintains network integrity.

Key Aspects of Bifrost's Security Model
Polkadot's Shared Security
The Bifrost Polkadot and Bifrost Kusama chains are parachains of Polkadot and Kusama, respectively. Their security and resistance to reorganization are protected by the relay chain.

As widely known, Polkadot employs a shared architecture where the relay chain randomly assigns validators to parachains and verifies their blocks. The blocks of the relay chain will include the blocks of the parachain, providing data availability for the parachains. This mechanism is the foundation of Polkadot's shared security.

Parachains do not require running validators, nor do they need to increase validator numbers to promote decentralization. Instead, they operate with a limited number of collator nodes. The role of collator nodes functions similarly to the Sequencer in Ethereum L2, which is responsible for collecting and ordering transactions in the parachains. The number of collators does not need to be excessive; it only needs to ensure network availability and make transactions less prone to censorship. Currently, the Bifrost Polkadot chain has over 32 collator nodes, which is more than sufficient to maintain robust network performance.

Cross-chain Communication Based on XCMP and XCM
In Bifrost's cross-chain architecture, there's a significant involvement of cross-chain communication. The security of cross-chain bridges is a well-known challenge in the blockchain space. So, how does Bifrost ensure the security of cross-chain communication? The answer lies in the cross-chain communication mechanism of Polkadot. Polkadot aims not only to create a platform for shared security but also to achieve seamless cross-chain interoperability. Polkadot accomplishes this through the Cross-Chain Message Passing (XCMP) protocol and the Cross-Consensus Message (XCM) format.

How XCMP works:
Cross-chain messages enter the Egress (exit queue) of the sending chain.

Collators of the target chain collect these messages from the Egress of other chains and place them into their Ingress (entry queue).

Messages are included in the relay chain's blocks and finalized, then executed by the target chain.

In summary, XCMP ensures fast, secure, ordered, and cost-effective cross-chain message delivery between Polkadot parachains.

When XCMP is used for communication between parachains, XCM is used to ensure that these chains can understand each other's messages and know how to execute them. Polkadot's vision for XCM extends beyond the cross-chain communication within Polkadot. It aims to be adopted by a broader range of heterogeneous blockchains. Therefore, it is named the Cross-Consensus Message format.

For a more in-depth interpretation of the operational mechanisms of XCMP and XCM, Bifrost provides detailed insights in this article: How Bifrost Supports vMOVR and vGLMR Based on XCM.

However, Bifrost also acknowledges that heterogeneous cross-chain infrastructure is currently not mature. Therefore, it has not opted for a radical approach to fully implement the cross-chain architecture but instead retained the SLP modules on Ethereum and Kusama. Nevertheless, as the cryptocurrency industry develops, secure and reliable heterogeneous cross-chain solutions are expected to emerge.

Non-custodial Mechanism and Rigorously Audited Code
Bifrost adopts a fully decentralized approach to manage staked assets. All processes are completed through decentralized contracts or runtime, without any human intervention and the need to trust any third party, including the Bifrost development team.

Furthermore, Bifrost's on-chain code is open source, allowing for public scrutiny and vulnerability reporting. The code has been rigorously audited by multiple security firms, including Beosin, Slowmist, and TokenInsight. Since its inception in 2019, Bifrost has maintained a flawless security record, demonstrating its resilience in terms of code security.

Secure Validator Set and Slash Protection
Apart from the risks of intentional misconduct and code vulnerabilities, users' staked assets may also face the risk of slashing. Staked assets essentially serve as collateral for running nodes. If a node engages in improper behavior that disrupts the network, a portion or all of the malicious node's staked funds may be slashed by the network.

An LST protocol that selects validators irresponsibly can expose LST asset holders to slashing losses, which could manifest as a decrease in the exchange rate between LST and the original token.

To minimize users' exposure to slashing losses, Bifrost has implemented several measures:

Rigorous Validator Selection: Bifrost evaluates validators not only based on profitability but also by considering factors such as the node's leverage ratio (self-staking ratio) and historical credibility. Detailed criteria and methods for selecting validators will be discussed in the next chapter.

Proactive Node Switching: In the event of a slashing risk, Bifrost can immediately switch nodes to prevent further losses, a capability that individual stakers typically lack.

vToken Vault: Bifrost has established an insurance pool called the vToken Vault, allocating 5% of the protocol's income to it. If slashing occurs, this pool compensates users for their losses. If no slashing occurs, the amount in the vToken Vault accumulates over time. The more funds accumulated, the stronger the compensation capability.

For a more detailed explanation of how Bifrost distributes, mitigates, and compensates for slashing risks, refer to [How Bifrost provides an insurance mechanism for vToken holders against the Slash risk.](https://bifrost.io/blog/how-bifrost-provides-an-insurance-mechanism-for-v-token-holders-against-the-slash-risk)

## Tokenomics 2.0

### Overview

In order to further expand Bifrost's market share in the liquidity staking track and make BNC holders more closely bound to the Bifrost protocol, this new BNC economic model is now proposed to stimulate the start of Bifrost's growth flywheel by binding the Bifrost protocol revenue sharing with BNC governance and staking functions.

### Core Engine - Buy Back & Revenue Sharing

Tokenomics 2.0 suggests using 100% of the profits from the Bifrost protocol for the buyback of BNC, with 90% allocated to bbBNC holders and the remaining 10% to be burned. bbBNC, short for Buy Back BNC, is a type of escrow token used for sharing the protocol's profit.

### Protocol Growth Flywheel
1. Growth of $BNC Market Cap

Higher BNC value capture (via protocol profit buybacks and burn mechanisms) increases Bifrost’s market capitalization, driving expansion of Liquid Staking Token (LST) use cases.

100% of protocol profits are used for BNC buybacks, with 90% distributed to bbBNC holders and 10% burned, creating a deflationary token model.

2. Expanding Use Cases and vToken Yield Enhancement

More LST use cases (e.g., DeFi lending, leveraged staking) boost vToken’s comprehensive yield (base staking yield + vToken senario yield). Higher yields attract more users to mint vTokens.

3. vToken Minting and Protocol Revenue Growth

Increased vToken minting directly drives protocol revenue through liquid staking fees.

4. bbBNC Holder Returns Amplification

Protocol revenue growth feeds back to bbBNC holders via buybacks, delivering higher annualized returns. Benefits include:

- Direct dividends (90% of protocol profits)
- Governance advantages for ecosystem decisions
- Farming yield boosts (e.g., vToken liquidity mining incentives).

5. Positive Growth Flywheel Formation

A closed-loop cycle emerges:

BNC value ↑ → LST use cases ↑ → vToken yields ↑ → Minting volume ↑ → Protocol revenue ↑ → bbBNC returns ↑ → More BNC locked → Reduced BNC supply → Further value capture.

### Core - bbBNC

Key Components
Native Coin ($BNC)
BNC is Bifrost Native Coin, the governance Token of Bifrost. It is commonly used in the Bifrost network for transaction fee payments, treasury spending, and liquidity incentives.

Liquid-staked Native Coin ($vBNC)
The liquid-staked version of $BNC, staking rewards appriciating in the value of $vBNC.

$BNC + $vBNC + Revenue Sharing (bbBNC)
Users can obtain bbBNC by liquid staking BNC to acquire vBNC and then locking this vBNC to receive bbBNC. The amount of bbBNC a user gets depends on the quantity of vBNC locked and the duration of the locking period.

bbBNC is non-transferable and can be redeemed for locked vBNC upon maturity. However, bbBNC can be redeemed before maturity, but users may face a slash for redeeming earlier than the set date. Slash will be fully counted as protocol revenue and will participate in BNC buybacks, burns, and bbBNC incentives.

Benefits of Holding bbBNC
Profit Distribution: bbBNC holders will share protocol profits. The distribution proportion depends on the amount of bbBNC held and the length of the locking period. The larger the holding and the longer the lock-up period, the higher the share of the profit distribution.

Staking Rewards: bbBNC, obtained by locking vBNC, integrates the staking rewards from Bifrost liquid staking token vBNC.

Governance Rights: bbBNC inherits the governance rights of BNC, allowing holders to participate in the governance of the Bifrost protocol.

Boosted farming: bbBNC holders can receive additional incentives when participating in vToken farming.

Sources of Bifrost Protocol Revenue
vToken Commission: The protocol earns a commission from staking rewards through its liquid staking services, which are then transferred to the protocol treasury. This is a significant part of Bifrost's revenue.

System Staking: This is generated by staking assets within the Bifrost system account.

Tx Fee: As an independent app chain, Bifrost charges gas fees for transactions on the Bifrost chain. A percentage of these fees is allocated to the Bifrost treasury.

vToken Swap Fees: Bifrost has established a dedicated LST Stable Swap Pool for vTokens. Users can swap vTokens in this pool, and the Tx fees paid will largely go to liquidity providers (LPs), while a portion will also be shared with bbBNC holders.

Expanded Application Revenue: Bifrost will also launch various extension application services centered around liquid staking, including LST leverage staking (Loop Stake). Users utilizing these services will generate revenue for the Bifrost protocol, thereby providing returns for bbBNC holders.

bbBNC Early Redemption Slash: If bbBNC is redeemed before maturity, a certain slash will be incurred, and the slash will be fully allocated to protocol revenue.

### How to get or redeem?

#### How to get bbBNC
Lock vBNC and receive bbBNC. The bbBNC value is proportional to the amount and duration staked (up to a maximum of 4 years). Each address is associated with a single bbBNC expiry date, and bbBNC can't transfer.

BNC -> vBNC -> bbBNC

> The bbBNC value is a key indicator for participating in dividends. Simply put, the higher the proportion of bbBNC value in the overall, the more you might get in various bbBNC holdings benefits.

> Your bbBNC value will decrease over time and will reach zero once the lock duration ends. At this point, your staked vBNC will be unlocked.


## FAQ - Frequently Asked Questions

Our FAQ aims to answer every basic question we've been asked on Bifrost/Omni LS and vTokens. You can find our most detailed FAQ in our Bifrost Lab support.

**Liquid Staking, rewards issue method and "Peg"**



## Build with SLPx

SLPx: The Developer Toolkit
Introduction to SLPx
SLPx is an extension module developed based on SLP, serving as a developer toolkit that enables the minting of vTokens on any chain. The goal is to simplify the integration of vTokens for more DeFi applications.

For developers, integrating SLPx involves only a few lines of code. Once integrated, developers can use remote calls to access minting, redemption, and swap services for vTokens on the Bifrost-Polkadot chain.

“Bifrost SLPx streamlined the complex process of bridging funds to destination chain, allowing users to liquid stake on any chain without leaving UI to interact with bridges.”

We call it:

SLPx Chain Abstraction
The core principle behind the model is simple: Users don't need to navigate the complexities of path-finding, cross-chain bridging, switching chains, and paying gas fees for interchain transactions. They only need to interact with the SLPx contract on their source chain to delegate these operations to be completed on their behalf.

How does it works?
SLPx mainly consists of two parts:

SLPx Contract: deployed on user’s source chain, receive user’s request and teleport to Bifrost.

SLPx Module: deployed on Bifrost chain, receive the request from SLPx Contract and call to stake.

SLPx has three core steps to wrap up “Stake with Bifrost” between Bifrost chain and user’s source chain (assume a EVM chain):

User initiate a request on a source chain: The token is sent to a Bifrost chain account for asset transfer and processing. Each EVM address corresponds to a Substrate account. For conversion details, see the [Frontier Account Mapping Rules](https://github.com/polkadot-evm/frontier/blob/master/frame/evm/src/lib.rs#L669).

Execute the Bifrost SLPx module remotely. The EVM user's address (msg.sender) is embedded in the calldata for the remote execution. This allows the Bifrost chain to identify the calling EVM user when the module is executed.

After the Bifrost SLPx module logic is processed, the LST will be sent to user on source chain.

XCM Oracle
What is Bifrost XCM Oracle?
In order to facilitate easy querying of Bifrost vToken Exchange Price on other chains at the Pallet and Contract levels, a scheduled price feed task sent by Bifrost SLPx Pallet is needed. Hence, Bifrost Runtime will automatically send XCM messages to the SLPx Contract of the target chain to update the Exchange Price of vTokens in the Contract.

- [SLPx XCM Oracle Tech Doc](https://github.com/bifrost-finance/slpx-contracts?tab=readme-ov-file#xcmoracle)
- How is [vToken Exchange Price calculated](https://docs.bifrost.io/faq/what-are-vtokens/vdot#dot-reward) and [verified in the Bifrost parachain](https://docs.bifrost.io/resources/audit-report#bifrost-security-evaluation)?
- [What is SLPx?](https://docs.bifrost.io/for-builders/build-with-slpx/overview)
- [What is XCM?](https://wiki.polkadot.network/docs/learn-xcm)

vToken APIs
There are three ways to query vToken exchange price:

1. Use the Bifrost Runtime API, which is the most up-to-date and accurate method.
2. Call EVM contract on Moonbeam.
3. API for Frontend (with more vToken related storages)

Bifrost Runtime API (Get vToken Exchange Rate)

[Polkadot JS](https://polkadot.js.org/apps/?rpc=wss%3A%2F%2Fbifrost-polkadot-rpc.dwellir.com#/runtime)

`vtokenMintingRuntimeApi`

1. `getCurrencyAmountByVCurrencyAmount`
2. `getVCurrencyAmountByCurrencyAmount`


EVM contract on Moonbeam
Query the exchange rate from SLPx contract on Moonbeam:

https://github.com/bifrost-io/slpx-contracts?tab=readme-ov-file#xcmoracle

Check more details at here.

API for Frontend
exchangeRatio is to get Token by vToken

Api 1: Includes the following queryable interfaces

```json
{
   "contractAddress": "",
   "symbol": "vDOT",
   "slug": "voucher-dot",
   "baseSlug": "polkadot",
   "unstakingTime": 2592000,
   "users": 4455,
   "apr": 15.34,
   "fee": 10,
   "price": 15.0575651785682,
   "exchangeRatio": 1.43132748845706,
   "supply": 7072122.86098662
},
```

Api 2: Includes the following queryable interfaces

```json
{
  "tvl": 128783099,
  "addresses": 89168,
  "revenue": 3886150,
    "vDOT": {
    "apy": "15.34",
    "apyBase": "15.17",
    "apyReward": "0.17",
    "tvl": 74398732.4975793,
    "tvm": 7072122.86098662,
    "totalIssuance": 4940953.70767365,
    "holders": 4455,
    "holdersList": [
      {
        "name": "vDOT",
        "holders": 2551,
        "unique_id": "asset_registry/9658598ef1eace56a0662d4a067a260e42b36f2a",
        "network": "bifrost",
        "url": "<https://bifrost.subscan.io/custom_token?unique_id=asset_registry/9658598ef1eace56a0662d4a067a260e42b36f2a>"
      },
      {
        "name": "vDOT",
        "holders": 389,
        "unique_id": "standard_assets/29085784439601774464560083082574142143",
        "network": "moonbeam",
        "url": "<https://moonbeam.subscan.io/assets/29085784439601774464560083082574142143>"
      },
      {
        "name": "vDOT",
        "holders": 223,
        "unique_id": "standard_assets/18446744073709551624",
        "network": "astar",
        "url": "<https://astar.subscan.io/assets/18446744073709551624>"
      },
      {
        "name": "vDOT",
        "holders": 9,
        "unique_id": "standard_assets/313524628741076911470961827389955394913",
        "network": "polkadex",
        "url": "<https://polkadex.subscan.io/assets/313524628741076911470961827389955394913>"
      },
      {
        "name": "vDOT",
        "holders": 1283,
        "unique_id": "asset_registry/37444e63907d968b4a4947cb38ce9c019e6b6310",
        "network": "hydration",
        "url": "<https://hydration.subscan.io/custom_token?unique_id=asset_registry/37444e63907d968b4a4947cb38ce9c019e6b6310>"
      }
    ]
  },
}
```
