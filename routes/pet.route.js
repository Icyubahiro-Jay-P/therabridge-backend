import express from "express";
import {
  getMyPet,
  feedPet,
  renamePet,
  getAdventures,
  checkActivity,
} from "../controllers/pet.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { jsonBody } from "../middleware/jsonBody.js";

const router = express.Router();

router.use(jsonBody("10kb"));
router.use(authMiddleware);

router.get("/", getMyPet);
router.post("/feed", feedPet);
router.put("/rename", renamePet);
router.get("/adventures", getAdventures);
router.post("/activity", checkActivity);

export default router;
