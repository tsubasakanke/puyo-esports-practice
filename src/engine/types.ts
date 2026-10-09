/** 0=空, 1..5=赤緑青黄紫, 6=おじゃま */
export type Color = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const EMPTY = 0 as const;
export const GARBAGE = 6 as const;
