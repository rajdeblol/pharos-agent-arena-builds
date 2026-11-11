import { readContractState } from "../lib/pharos-reader.mjs";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Use POST to read a contract." });
  }

  try {
    const result = await readContractState(request.body?.address);
    return response.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Pharos read failed.";
    return response.status(400).json({ error: message });
  }
}
