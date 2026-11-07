// Greetings this browser created, so the sender sees "send" actions and a
// recipient sees "make your own". Only IDs, only in this browser.
const KEY = "diwali2026:mine";

export function rememberMine(id: string) {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[];
    if (!list.includes(id)) list.push(id);
    localStorage.setItem(KEY, JSON.stringify(list.slice(-50)));
  } catch {
    // storage unavailable
  }
}

export function isMine(id: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]).includes(id);
  } catch {
    return false;
  }
}
