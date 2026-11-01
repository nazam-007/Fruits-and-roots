import { stdin, stdout } from "node:process";
import {
  createAdminPasswordHash,
  MAX_ADMIN_PASSWORD_LENGTH,
  MIN_ADMIN_PASSWORD_LENGTH,
} from "./adminPassword";

function readPassword(): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Run this command in an interactive terminal.");
  }

  return new Promise((resolve, reject) => {
    let password = "";
    stdout.write("Admin password: ");
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          stdout.write("\n");
          reject(new Error("Password hash generation cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(password);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          password = password.slice(0, -1);
          continue;
        }
        if (character >= " ") password += character;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const password = await readPassword();
  const passwordHash = createAdminPasswordHash(password);
  stdout.write(`ADMIN_PASSWORD_HASH=${passwordHash}\n`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unable to generate password hash.");
  process.exitCode = 1;
});
