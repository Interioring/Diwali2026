import { usePath } from "./lib/router.ts";
import { Create } from "./pages/Create.tsx";
import { GreetingPage } from "./pages/GreetingPage.tsx";

export function App() {
  const path = usePath();
  const greeting = path.match(/^\/g\/([A-Za-z0-9]{6,24})\/?$/);
  if (greeting) return <GreetingPage key={greeting[1]} id={greeting[1]} />;
  const fromRecipient = Boolean((history.state as { fromRecipient?: boolean } | null)?.fromRecipient);
  return <Create key={path} fromRecipient={fromRecipient} />;
}
