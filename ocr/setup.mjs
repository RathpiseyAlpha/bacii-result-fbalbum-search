import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(".venv");
const python = process.platform === "win32"
  ? resolve(root, "Scripts", "python.exe")
  : resolve(root, "bin", "python");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(python)) run(process.env.PYTHON || "python", ["-m", "venv", root]);
run(python, ["-m", "pip", "install", "--upgrade", "pip"]);
run(python, ["-m", "pip", "install", "-r", resolve("ocr", "requirements.txt")]);
run(python, [resolve("ocr", "worker.py"), "--check"]);
console.log("Khmer OCR runtime is ready. The model downloads automatically on the first OCR job.");
