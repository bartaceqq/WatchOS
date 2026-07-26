import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const directory = path.dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.LANTV_REPOSITORY_PORT ?? "8788", 10);
const app = express();

app.disable("x-powered-by");
app.use((_request, response, next) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
app.use(express.static(directory, { extensions: ["json"] }));
app.get("/", (_request, response) => response.redirect("/catalog.json"));

app.listen(port, "0.0.0.0", () => {
  console.log(`WatchOS application repository: http://localhost:${port}/catalog.json`);
});
