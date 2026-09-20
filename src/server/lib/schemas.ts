import { z } from "zod";

export const createRoomSchema = z.object({
  gameId: z.literal("pon-inai"),
  roomName: z.string().trim().min(1).max(30),
  displayName: z.string().trim().min(1).max(20),
  password: z.string().max(64),
  gameConfig: z.object({ gameCount: z.number().int().min(1).max(5) })
});

export const joinRoomSchema = z.object({
  displayName: z.string().trim().min(1).max(20),
  password: z.string().max(64)
});
