import { createPublicClient, http } from "viem";
import { robinhoodChainTestnet } from "./wagmi";

export const publicClient = createPublicClient({
  chain: robinhoodChainTestnet,
  transport: http("https://rpc.testnet.chain.robinhood.com"),
});
