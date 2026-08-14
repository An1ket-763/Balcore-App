import { useAccount, useSwitchChain } from "wagmi";
import { defaultChain } from "@/lib/wagmi";

export default function WrongNetworkBanner() {
  const { isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();

  if (!isConnected || chain?.id === defaultChain.id) {
    return null;
  }

  return (
    <div className="risk-banner">
      You're connected to {chain?.name ?? "an unsupported network"}. Switch to {defaultChain.name} to use Balcore.
      <button onClick={() => switchChain({ chainId: defaultChain.id })}>
        Switch network
      </button>
    </div>
  );
}
