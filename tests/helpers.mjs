import { readFile } from "node:fs/promises";

export async function translator(locale = "en") {
  const messages = JSON.parse(await readFile(`extension/_locales/${locale}/messages.json`, "utf8"));
  return (key, substitutions = []) => {
    const entry = messages[key];
    if (!entry) throw new Error(`Unknown translation ${key}`);
    const values = Array.isArray(substitutions) ? substitutions : [substitutions];
    return entry.message.replace(/\$([a-zA-Z0-9_]+)\$/g, (_, name) => entry.placeholders[name.toLowerCase()].content.replace(/\$(\d+)/g, (_, n) => values[Number(n) - 1] ?? ""));
  };
}
