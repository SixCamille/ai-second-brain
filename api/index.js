import { BrainStore } from "../src/brain-store.js";
import { renderIndexPage } from "../src/index-page.js";
import { handleViewLogin, isViewAuthorized, sendViewLogin } from "../src/security.js";

export default async function handler(request, response) {
  if (request.method === "POST") {
    await handleViewLogin(request, response);
    return;
  }
  if (!isViewAuthorized(request)) {
    sendViewLogin(response);
    return;
  }
  const store = await BrainStore.create();
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.setHeader("cache-control", "private, no-store");
  response.status(200).send(await renderIndexPage(store));
}
