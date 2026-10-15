import { z } from "zod";

export const createRoomSchema = z.object({
  gameId: z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/),
  roomName: z.string().trim().min(1).max(30),
  displayName: z.string().trim().min(1).max(20),
  password: z.string().max(64),
  gameConfig: z.unknown()
});

export const joinRoomSchema = z.object({
  displayName: z.string().trim().min(1).max(20),
  password: z.string().max(64)
});
