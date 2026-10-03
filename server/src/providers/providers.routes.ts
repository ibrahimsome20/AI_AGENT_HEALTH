import { Router } from "express";
import { providers } from "../data/index.js";

export const providersRouter = Router();

providersRouter.get("/", (_request, response) => {
  response.json({ providers });
});
