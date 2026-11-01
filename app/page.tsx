import PortfolioCalculator from "./PortfolioCalculator";
import defaultPortfolio from "@/lib/default-portfolio.json";

export default function Home() {
  return <PortfolioCalculator initialHoldings={defaultPortfolio.holdings} />;
}
