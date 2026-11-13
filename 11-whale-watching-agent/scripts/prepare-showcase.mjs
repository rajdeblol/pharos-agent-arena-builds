import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(projectRoot, "..");
const publicDirectory = resolve(projectRoot, "public");
const showcaseDirectory = resolve(repositoryRoot, "showcase", "whale-watching-agent");

rmSync(showcaseDirectory, { recursive: true, force: true });
mkdirSync(showcaseDirectory, { recursive: true });
cpSync(publicDirectory, showcaseDirectory, { recursive: true, force: true });
console.log("Prepared the whale watcher showcase output.");
