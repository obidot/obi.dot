import { http, createConfig } from "wagmi";
import { polkadotHubTestnet } from "./chains";

export const wagmiConfig = createConfig({
  chains: [polkadotHubTestnet],
  transports: {
    [polkadotHubTestnet.id]: http(),
  },
  ssr: true,
});
