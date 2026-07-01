export const GENERALE = "generale" as const;
export const BOMBERMAN = "bomberman" as const;

export type GameType = typeof GENERALE | typeof BOMBERMAN;
