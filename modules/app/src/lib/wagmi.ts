import { createConfig, http } from "wagmi";
import { polkadotHub, polkadotHubTestnet } from "./chains";

type WagmiConfigChain = Parameters<typeof createConfig>[0]["chains"][number];

const chains = [polkadotHubTestnet, polkadotHub] as unknown as [
  WagmiConfigChain,
  WagmiConfigChain,
];

export const wagmiConfig = createConfig({
  chains,
  transports: {
    [polkadotHubTestnet.id]: http(),
    [polkadotHub.id]: http(),
  },
  ssr: true,
});
