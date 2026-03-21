import { createConfig, http } from "wagmi";
import { polkadotHub, polkadotHubTestnet } from "./chains";

export const wagmiConfig = createConfig({
  chains: [polkadotHubTestnet, polkadotHub],
  transports: {
    [polkadotHubTestnet.id]: http(),
    [polkadotHub.id]: http(),
  },
  ssr: true,
});
