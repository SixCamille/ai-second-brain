import { sendStaticAsset } from "../../src/asset-handler.js";

export default async function handler(request, response) {
  await sendStaticAsset(request, response);
}
