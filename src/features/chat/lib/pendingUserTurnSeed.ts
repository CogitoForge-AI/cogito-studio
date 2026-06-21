type PendingUserTurnSeed = {
  content: string;
  metadata?: string;
};

const seedsByChatId = new Map<string, PendingUserTurnSeed>();

export function setPendingUserTurnSeed(
  chatId: string,
  seed: PendingUserTurnSeed
): void {
  seedsByChatId.set(chatId, seed);
}

export function takePendingUserTurnSeed(
  chatId: string
): PendingUserTurnSeed | undefined {
  const seed = seedsByChatId.get(chatId);
  if (seed) {
    seedsByChatId.delete(chatId);
  }
  return seed;
}
